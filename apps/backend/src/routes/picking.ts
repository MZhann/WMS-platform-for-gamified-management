import { Router, Response } from "express"
import { authenticate, AuthRequest } from "../middleware/auth"
import {
  PickList,
  PickListStatus,
  generatePickListNumber,
} from "../models/PickList"
import { Shipment } from "../models/Shipment"
import { Location } from "../models/Location"
import { wmsEvents, WMS_EVENTS, PickListEvent } from "../telegram/events"

const router = Router()
router.use(authenticate)

function toPickListResponse(pl: InstanceType<typeof PickList>) {
  return {
    id: pl._id.toString(),
    pickListNumber: pl.pickListNumber,
    warehouseId: pl.warehouseId.toString(),
    userId: pl.userId.toString(),
    type: pl.type,
    status: pl.status,
    shipmentIds: pl.shipmentIds.map((s) => s.toString()),
    items: (pl.items || []).map((i) => ({
      shipmentId: i.shipmentId.toString(),
      orderNumber: i.orderNumber,
      typeName: i.typeName,
      quantity: i.quantity,
      pickedQty: i.pickedQty,
      locationId: i.locationId?.toString() || null,
      locationCode: i.locationCode || null,
      status: i.status,
    })),
    startedAt: pl.startedAt,
    completedAt: pl.completedAt,
    createdAt: pl.createdAt,
    updatedAt: pl.updatedAt,
  }
}

router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const filter: Record<string, unknown> = { userId: req.user.id }
    if (req.query.status) filter.status = req.query.status
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId

    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20))
    const skip = (page - 1) * limit

    const [pickLists, total] = await Promise.all([
      PickList.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PickList.countDocuments(filter),
    ])

    res.json({ pickLists: pickLists.map(toPickListResponse), total, page, limit })
  } catch (error: any) {
    console.error("List pick lists error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }
    const pl = await PickList.findOne({ _id: req.params.id, userId: req.user.id })
    if (!pl) { res.status(404).json({ error: "Pick list not found" }); return }
    res.json({ pickList: toPickListResponse(pl) })
  } catch (error: any) {
    console.error("Get pick list error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { shipmentIds } = req.body as { shipmentIds: string[] }
    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      res.status(400).json({ error: "shipmentIds array is required" }); return
    }

    const shipments = await Shipment.find({
      _id: { $in: shipmentIds },
      userId: req.user.id,
      status: { $in: ["pending", "picking"] },
    })

    if (shipments.length === 0) {
      res.status(400).json({ error: "No valid shipments found (must be pending or picking)" }); return
    }

    const warehouseId = shipments[0].warehouseId.toString()
    const allSameWarehouse = shipments.every(
      (s) => s.warehouseId.toString() === warehouseId
    )
    if (!allSameWarehouse) {
      res.status(400).json({ error: "All shipments must be from the same warehouse" }); return
    }

    const locations = await Location.find({
      warehouseId,
      status: "active",
    }).sort({ code: 1 })

    const items = shipments.flatMap((s) =>
      s.items.map((item) => {
        const loc = item.locationId
          ? locations.find((l) => l._id.toString() === item.locationId?.toString())
          : locations.find((l) =>
              l.inventory.some((inv) => inv.typeName === item.typeName && inv.count > 0)
            )
        return {
          shipmentId: s._id,
          orderNumber: s.orderNumber,
          typeName: item.typeName,
          quantity: item.quantity,
          pickedQty: 0,
          locationId: loc?._id,
          locationCode: loc?.code || item.locationCode || undefined,
          status: "pending" as const,
        }
      })
    )

    items.sort((a, b) => (a.locationCode || "ZZZ").localeCompare(b.locationCode || "ZZZ"))

    const pickListNumber = await generatePickListNumber()

    const pickList = new PickList({
      pickListNumber,
      warehouseId,
      userId: req.user.id,
      type: shipments.length === 1 ? "single" : "wave",
      status: "pending",
      shipmentIds: shipments.map((s) => s._id),
      items,
    })

    await pickList.save()

    for (const s of shipments) {
      if (s.status === "pending") {
        s.status = "picking"
        s.audit.push({
          action: "status_change",
          fromStatus: "pending",
          toStatus: "picking",
          performedBy: req.user.id as any,
          timestamp: new Date(),
          note: `Pick list ${pickListNumber} generated`,
        })
        await s.save()
      }
    }

    res.status(201).json({
      message: `Pick list created with ${items.length} items from ${shipments.length} shipment(s)`,
      pickList: toPickListResponse(pickList),
    })
  } catch (error: any) {
    console.error("Create pick list error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message }); return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/:id/confirm", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const pl = await PickList.findOne({ _id: req.params.id, userId: req.user.id })
    if (!pl) { res.status(404).json({ error: "Pick list not found" }); return }

    if (pl.status !== "pending" && pl.status !== "in_progress") {
      res.status(400).json({ error: "Pick list must be pending or in-progress" }); return
    }

    const { picks } = req.body as {
      picks: { typeName: string; orderNumber: string; pickedQty: number }[]
    }
    if (!Array.isArray(picks) || picks.length === 0) {
      res.status(400).json({ error: "picks array is required" }); return
    }

    if (pl.status === "pending") {
      pl.status = "in_progress"
      pl.startedAt = new Date()
    }

    for (const pick of picks) {
      const item = pl.items.find(
        (i) => i.typeName === pick.typeName && i.orderNumber === pick.orderNumber
      )
      if (!item) continue

      item.pickedQty = Math.min(Math.max(0, pick.pickedQty), item.quantity)
      item.status = item.pickedQty >= item.quantity
        ? "picked"
        : item.pickedQty > 0
        ? "short"
        : "pending"
    }

    const allDone = pl.items.every((i) => i.status === "picked" || i.status === "short")
    if (allDone) {
      pl.status = "completed"
      pl.completedAt = new Date()

      const shipmentMap = new Map<string, { typeName: string; pickedQty: number }[]>()
      for (const item of pl.items) {
        const sid = item.shipmentId.toString()
        if (!shipmentMap.has(sid)) shipmentMap.set(sid, [])
        shipmentMap.get(sid)!.push({ typeName: item.typeName, pickedQty: item.pickedQty })
      }

      for (const [sid, itemPicks] of shipmentMap) {
        const shipment = await Shipment.findById(sid)
        if (!shipment) continue

        for (const pick of itemPicks) {
          const si = shipment.items.find((i) => i.typeName === pick.typeName)
          if (si) si.pickedQty = pick.pickedQty
        }

        const allShipmentPicked = shipment.items.every(
          (i) => i.pickedQty >= i.quantity
        )
        if (allShipmentPicked && shipment.status === "picking") {
          shipment.status = "picked"
          shipment.audit.push({
            action: "pick_completed",
            fromStatus: "picking",
            toStatus: "picked",
            performedBy: req.user.id as any,
            timestamp: new Date(),
            note: `Via pick list ${pl.pickListNumber}`,
          })
        }
        await shipment.save()
      }
    }

    await pl.save()

    if (allDone) {
      wmsEvents.emit(WMS_EVENTS.PICK_LIST_COMPLETED, {
        pickListId: pl._id.toString(),
        pickListNumber: pl.pickListNumber,
        userId: req.user.id,
        status: "completed",
        itemCount: pl.items.length,
      } as PickListEvent)
    }

    res.json({
      message: allDone ? "Pick list completed" : "Pick progress saved",
      pickList: toPickListResponse(pl),
    })
  } catch (error: any) {
    console.error("Confirm picks error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.patch("/:id/status", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { status } = req.body as { status: PickListStatus }
    if (status !== "cancelled") {
      res.status(400).json({ error: "Only cancellation is supported via this endpoint" }); return
    }

    const pl = await PickList.findOne({ _id: req.params.id, userId: req.user.id })
    if (!pl) { res.status(404).json({ error: "Pick list not found" }); return }

    if (pl.status === "completed" || pl.status === "cancelled") {
      res.status(400).json({ error: "Cannot cancel a completed or already cancelled pick list" }); return
    }

    pl.status = "cancelled"
    await pl.save()

    res.json({ message: "Pick list cancelled", pickList: toPickListResponse(pl) })
  } catch (error: any) {
    console.error("Cancel pick list error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
