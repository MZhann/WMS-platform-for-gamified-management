import { Router, Response } from "express"
import { authenticate, AuthRequest } from "../middleware/auth"
import {
  Shipment,
  ShipmentStatus,
  canTransitionShipment,
  generateShipmentNumber,
} from "../models/Shipment"
import { Order } from "../models/Order"
import { Warehouse } from "../models/Warehouse"
import { WarehouseFlow } from "../models/WarehouseFlow"
import { wmsEvents, WMS_EVENTS, ShipmentStatusEvent } from "../telegram/events"

const router = Router()
router.use(authenticate)

function toShipmentResponse(s: InstanceType<typeof Shipment>) {
  return {
    id: s._id.toString(),
    shipmentNumber: s.shipmentNumber,
    orderId: s.orderId.toString(),
    orderNumber: s.orderNumber,
    warehouseId: s.warehouseId.toString(),
    userId: s.userId.toString(),
    status: s.status,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    items: (s.items || []).map((i) => ({
      typeName: i.typeName,
      quantity: i.quantity,
      pickedQty: i.pickedQty,
      packedQty: i.packedQty,
      locationId: i.locationId?.toString() || null,
      locationCode: i.locationCode || null,
    })),
    shippedAt: s.shippedAt || null,
    deliveredAt: s.deliveredAt || null,
    notes: s.notes,
    audit: (s.audit || []).map((a) => ({
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      performedBy: a.performedBy?.toString(),
      timestamp: a.timestamp,
      note: a.note,
    })),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}

async function deductWarehouseInventory(
  shipment: InstanceType<typeof Shipment>,
  userId: string
) {
  const warehouse = await Warehouse.findById(shipment.warehouseId)
  if (!warehouse) return

  for (const item of shipment.items) {
    const qty = item.packedQty || item.pickedQty || item.quantity
    const inv = warehouse.inventory.find((i) => i.typeName === item.typeName)
    if (inv) {
      inv.count = Math.max(0, inv.count - qty)
    }
  }
  await warehouse.save()

  const order = await Order.findById(shipment.orderId)
  if (order) {
    order.audit.push({
      action: "inventory_deducted",
      performedBy: userId as any,
      timestamp: new Date(),
      note: `Inventory deducted for shipment ${shipment.shipmentNumber}`,
    })
    await order.save()
  }
}

async function completeOrderFromShipment(
  shipment: InstanceType<typeof Shipment>,
  userId: string
) {
  const order = await Order.findById(shipment.orderId)
  if (!order) return

  for (const sItem of shipment.items) {
    const oItem = order.items.find((i) => i.typeName === sItem.typeName)
    if (oItem) {
      const fulfilled = sItem.packedQty || sItem.pickedQty || sItem.quantity
      oItem.fulfilledQty = Math.min(oItem.quantity, oItem.fulfilledQty + fulfilled)
    }
  }

  const allFulfilled = order.items.every((i) => i.fulfilledQty >= i.quantity)

  if (allFulfilled && order.status === "in_progress") {
    const fromStatus = order.status
    order.status = "completed"
    order.audit.push({
      action: "status_change",
      fromStatus,
      toStatus: "completed",
      performedBy: userId as any,
      timestamp: new Date(),
      note: `Auto-completed: all items fulfilled via shipment ${shipment.shipmentNumber}`,
    })
  } else {
    order.audit.push({
      action: "shipment_delivered",
      performedBy: userId as any,
      timestamp: new Date(),
      note: `Shipment ${shipment.shipmentNumber} delivered. Fulfilled qty updated.`,
    })
  }

  await order.save()
}

// List shipments with optional filters
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const filter: Record<string, unknown> = { userId: req.user.id }
    if (req.query.orderId) filter.orderId = req.query.orderId
    if (req.query.status) filter.status = req.query.status
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId

    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20))
    const skip = (page - 1) * limit

    const [shipments, total] = await Promise.all([
      Shipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Shipment.countDocuments(filter),
    ])

    res.json({
      shipments: shipments.map(toShipmentResponse),
      total,
      page,
      limit,
    })
  } catch (error: any) {
    console.error("List shipments error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get single shipment
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    res.json({ shipment: toShipmentResponse(shipment) })
  } catch (error: any) {
    console.error("Get shipment error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create shipment from a sales order
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { orderId, carrier, trackingNumber, notes } = req.body

    if (!orderId) { res.status(400).json({ error: "orderId is required" }); return }

    const order = await Order.findOne({ _id: orderId, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    if (order.orderType !== "sales") {
      res.status(400).json({ error: "Shipments can only be created for sales orders" }); return
    }

    const terminalStatuses = ["draft", "cancelled"]
    if (terminalStatuses.includes(order.status)) {
      res.status(400).json({ error: `Cannot create shipment for ${order.status} order` }); return
    }

    const existing = await Shipment.findOne({
      orderId: order._id,
      status: { $nin: ["cancelled"] },
    })
    if (existing) {
      res.status(400).json({ error: "An active shipment already exists for this order" }); return
    }

    const items = order.items.map((i) => ({
      typeName: i.typeName,
      quantity: i.quantity,
      pickedQty: 0,
      packedQty: 0,
    }))

    let shipment: InstanceType<typeof Shipment> | null = null
    let lastErr: any = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const shipmentNumber = await generateShipmentNumber()
      const candidate = new Shipment({
        shipmentNumber,
        orderId: order._id,
        orderNumber: order.orderNumber,
        warehouseId: order.warehouseId,
        userId: req.user.id,
        status: "pending",
        carrier: carrier || "",
        trackingNumber: trackingNumber || "",
        items,
        notes: notes || "",
        audit: [{
          action: "created",
          toStatus: "pending",
          performedBy: req.user.id,
          timestamp: new Date(),
        }],
      })
      try {
        await candidate.save()
        shipment = candidate
        break
      } catch (err: any) {
        lastErr = err
        if (err?.code === 11000 && err?.keyPattern?.shipmentNumber) {
          continue
        }
        throw err
      }
    }
    if (!shipment) {
      console.error("Create shipment — exhausted retries:", lastErr)
      res.status(500).json({ error: "Could not allocate shipment number, try again" })
      return
    }

    if (order.status === "confirmed") {
      const fromStatus = order.status
      order.status = "in_progress"
      order.audit.push({
        action: "status_change",
        fromStatus,
        toStatus: "in_progress",
        performedBy: req.user.id as any,
        timestamp: new Date(),
        note: `Auto-advanced: shipment ${shipment.shipmentNumber} created`,
      })
    }

    order.audit.push({
      action: "shipment_created",
      performedBy: req.user.id as any,
      timestamp: new Date(),
      note: `Shipment ${shipment.shipmentNumber} created`,
    })
    await order.save()

    res.status(201).json({
      message: "Shipment created successfully",
      shipment: toShipmentResponse(shipment),
    })
  } catch (error: any) {
    console.error("Create shipment error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message }); return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update shipment status
router.patch("/:id/status", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { status: newStatus, carrier, trackingNumber, note } = req.body as {
      status: ShipmentStatus
      carrier?: string
      trackingNumber?: string
      note?: string
    }
    if (!newStatus) { res.status(400).json({ error: "status is required" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    if (!canTransitionShipment(shipment.status, newStatus)) {
      res.status(400).json({
        error: `Cannot transition from '${shipment.status}' to '${newStatus}'`,
      })
      return
    }

    const fromStatus = shipment.status
    shipment.status = newStatus

    if (carrier !== undefined) shipment.carrier = String(carrier).trim()
    if (trackingNumber !== undefined) shipment.trackingNumber = String(trackingNumber).trim()

    if (newStatus === "shipped" && !shipment.shippedAt) {
      shipment.shippedAt = new Date()
    }
    if (newStatus === "delivered") {
      shipment.deliveredAt = new Date()
    }

    shipment.audit.push({
      action: "status_change",
      fromStatus,
      toStatus: newStatus,
      performedBy: req.user.id as any,
      timestamp: new Date(),
      note: note || undefined,
    })

    await shipment.save()

    if (newStatus === "shipped") {
      await deductWarehouseInventory(shipment, req.user.id)
    }

    if (newStatus === "delivered") {
      await completeOrderFromShipment(shipment, req.user.id)
    }

    wmsEvents.emit(WMS_EVENTS.SHIPMENT_STATUS_CHANGED, {
      shipmentId: shipment._id.toString(),
      shipmentNumber: shipment.shipmentNumber,
      orderNumber: shipment.orderNumber,
      userId: req.user.id,
      fromStatus,
      toStatus: newStatus,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    } as ShipmentStatusEvent)

    res.json({
      message: `Shipment status changed to '${newStatus}'`,
      shipment: toShipmentResponse(shipment),
    })
  } catch (error: any) {
    console.error("Shipment status transition error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Pick items in a shipment
router.post("/:id/pick", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    if (!["pending", "picking"].includes(shipment.status)) {
      res.status(400).json({ error: "Shipment must be pending or picking to pick items" }); return
    }

    const { picks } = req.body as { picks: { typeName: string; pickedQty: number }[] }
    if (!Array.isArray(picks) || picks.length === 0) {
      res.status(400).json({ error: "picks array is required" }); return
    }

    for (const pick of picks) {
      const item = shipment.items.find((i) => i.typeName === pick.typeName)
      if (item) {
        item.pickedQty = Math.min(Math.max(0, pick.pickedQty), item.quantity)
      }
    }

    const allPicked = shipment.items.every((i) => i.pickedQty >= i.quantity)

    if (shipment.status === "pending") {
      shipment.status = "picking"
      shipment.audit.push({
        action: "status_change",
        fromStatus: "pending",
        toStatus: "picking",
        performedBy: req.user.id as any,
        timestamp: new Date(),
      })
    }

    if (allPicked) {
      shipment.status = "picked"
      shipment.audit.push({
        action: "pick_completed",
        fromStatus: "picking",
        toStatus: "picked",
        performedBy: req.user.id as any,
        timestamp: new Date(),
      })
    }

    await shipment.save()

    res.json({
      message: allPicked ? "All items picked" : "Pick progress saved",
      shipment: toShipmentResponse(shipment),
    })
  } catch (error: any) {
    console.error("Pick shipment error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Pack items in a shipment
router.post("/:id/pack", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    if (!["picked", "packing"].includes(shipment.status)) {
      res.status(400).json({ error: "Shipment must be picked or packing to pack items" }); return
    }

    const { packs } = req.body as { packs: { typeName: string; packedQty: number }[] }
    if (!Array.isArray(packs) || packs.length === 0) {
      res.status(400).json({ error: "packs array is required" }); return
    }

    const prevStatus = shipment.status

    for (const pack of packs) {
      const item = shipment.items.find((i) => i.typeName === pack.typeName)
      if (item) {
        item.packedQty = Math.min(Math.max(0, pack.packedQty), item.pickedQty)
      }
    }

    const allPacked = shipment.items.every(
      (i) => i.pickedQty > 0 && i.packedQty >= i.pickedQty
    )

    if (allPacked) {
      shipment.status = "packed"
      if (prevStatus === "picked") {
        shipment.audit.push({
          action: "status_change",
          fromStatus: "picked",
          toStatus: "packing",
          performedBy: req.user.id as any,
          timestamp: new Date(),
        })
      }
      shipment.audit.push({
        action: "pack_completed",
        fromStatus: "packing",
        toStatus: "packed",
        performedBy: req.user.id as any,
        timestamp: new Date(),
      })
    } else if (prevStatus === "picked") {
      shipment.status = "packing"
      shipment.audit.push({
        action: "status_change",
        fromStatus: "picked",
        toStatus: "packing",
        performedBy: req.user.id as any,
        timestamp: new Date(),
      })
    }

    await shipment.save()

    res.json({
      message: allPacked ? "All items packed" : "Pack progress saved",
      shipment: toShipmentResponse(shipment),
    })
  } catch (error: any) {
    console.error("Pack shipment error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get packing slip for a shipment
router.get("/:id/packing-slip", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    const order = await Order.findById(shipment.orderId)
    const warehouse = await Warehouse.findById(shipment.warehouseId)

    res.json({
      packingSlip: {
        shipmentNumber: shipment.shipmentNumber,
        orderNumber: shipment.orderNumber,
        date: shipment.createdAt.toISOString(),
        warehouse: warehouse
          ? { name: warehouse.name, address: warehouse.address }
          : null,
        counterparty: order?.counterparty || "",
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        items: shipment.items.map((i) => ({
          typeName: i.typeName,
          quantity: i.quantity,
          packedQty: i.packedQty,
        })),
        notes: shipment.notes,
        status: shipment.status,
      },
    })
  } catch (error: any) {
    console.error("Packing slip error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete shipment (pending/cancelled only)
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const shipment = await Shipment.findOne({ _id: req.params.id, userId: req.user.id })
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return }

    if (shipment.status !== "pending" && shipment.status !== "cancelled") {
      res.status(400).json({ error: "Only pending or cancelled shipments can be deleted" }); return
    }

    await Shipment.deleteOne({ _id: shipment._id })
    res.json({ message: "Shipment deleted" })
  } catch (error: any) {
    console.error("Delete shipment error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
