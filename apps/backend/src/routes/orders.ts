import { Router, Response } from "express"
import { authenticate, AuthRequest } from "../middleware/auth"
import {
  Order,
  IOrderItem,
  OrderStatus,
  canTransition,
  generateOrderNumber,
} from "../models/Order"
import { Warehouse } from "../models/Warehouse"
import { WarehouseFlow, WarehouseFlowOperation } from "../models/WarehouseFlow"
import { wmsEvents, WMS_EVENTS, OrderStatusEvent } from "../telegram/events"

const router = Router()
router.use(authenticate)

function toOrderResponse(o: InstanceType<typeof Order>) {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    status: o.status,
    warehouseId: o.warehouseId.toString(),
    userId: o.userId.toString(),
    counterparty: o.counterparty,
    items: (o.items || []).map((i) => ({
      typeName: i.typeName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      fulfilledQty: i.fulfilledQty,
    })),
    notes: o.notes,
    audit: (o.audit || []).map((a) => ({
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      performedBy: a.performedBy?.toString(),
      timestamp: a.timestamp,
      note: a.note,
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

// List orders for the authenticated user, with optional filters
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const filter: Record<string, unknown> = { userId: req.user.id }
    if (req.query.type) filter.orderType = req.query.type
    if (req.query.status) filter.status = req.query.status
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId

    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20))
    const skip = (page - 1) * limit

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ])

    res.json({
      orders: orders.map(toOrderResponse),
      total,
      page,
      limit,
    })
  } catch (error: any) {
    console.error("List orders error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get single order
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    res.json({ order: toOrderResponse(order) })
  } catch (error: any) {
    console.error("Get order error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create order
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { orderType, warehouseId, counterparty, items: rawItems, notes } = req.body

    if (!orderType || (orderType !== "purchase" && orderType !== "sales")) {
      res.status(400).json({ error: "orderType must be 'purchase' or 'sales'" }); return
    }
    if (!warehouseId) { res.status(400).json({ error: "warehouseId is required" }); return }
    if (!counterparty || !String(counterparty).trim()) {
      res.status(400).json({ error: "counterparty is required" }); return
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      res.status(400).json({ error: "items must be a non-empty array" }); return
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const items: IOrderItem[] = []
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i]
      const typeName = item?.typeName != null ? String(item.typeName).trim() : ""
      const quantity = typeof item?.quantity === "number" ? item.quantity : parseInt(String(item.quantity), 10)
      const unitPrice = typeof item?.unitPrice === "number" ? item.unitPrice : parseFloat(String(item?.unitPrice ?? ""))

      if (!typeName) { res.status(400).json({ error: `Row ${i + 1}: typeName is required` }); return }
      if (!Number.isInteger(quantity) || quantity < 1) {
        res.status(400).json({ error: `Row ${i + 1}: quantity must be a positive integer` }); return
      }
      if (typeof unitPrice !== "number" || Number.isNaN(unitPrice) || unitPrice < 0) {
        res.status(400).json({ error: `Row ${i + 1}: unitPrice must be a non-negative number` }); return
      }
      items.push({ typeName, quantity, unitPrice, fulfilledQty: 0 })
    }

    if (orderType === "sales") {
      for (let i = 0; i < items.length; i++) {
        const inv = warehouse.inventory.find((wi) => wi.typeName === items[i].typeName)
        if (!inv || inv.count <= 0) {
          res.status(400).json({
            error: `Row ${i + 1}: "${items[i].typeName}" is not available in warehouse inventory`,
          })
          return
        }
        if (inv.count < items[i].quantity) {
          res.status(400).json({
            error: `Row ${i + 1}: "${items[i].typeName}" only has ${inv.count} units in stock (requested ${items[i].quantity})`,
          })
          return
        }
      }
    }

    const orderNumber = await generateOrderNumber(orderType)

    const order = new Order({
      orderNumber,
      orderType,
      status: "draft",
      warehouseId: warehouse._id,
      userId: req.user.id,
      counterparty: String(counterparty).trim(),
      items,
      notes: notes || "",
      audit: [{
        action: "created",
        toStatus: "draft",
        performedBy: req.user.id,
        timestamp: new Date(),
      }],
    })

    await order.save()

    res.status(201).json({
      message: "Order created successfully",
      order: toOrderResponse(order),
    })
  } catch (error: any) {
    console.error("Create order error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message }); return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update order (only draft orders)
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    if (order.status !== "draft") {
      res.status(400).json({ error: "Only draft orders can be edited" }); return
    }

    const { counterparty, items: rawItems, notes } = req.body

    if (counterparty !== undefined) {
      if (!String(counterparty).trim()) {
        res.status(400).json({ error: "counterparty cannot be empty" }); return
      }
      order.counterparty = String(counterparty).trim()
    }

    if (rawItems !== undefined) {
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array" }); return
      }
      const items: IOrderItem[] = []
      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i]
        const typeName = item?.typeName != null ? String(item.typeName).trim() : ""
        const quantity = typeof item?.quantity === "number" ? item.quantity : parseInt(String(item.quantity), 10)
        const unitPrice = typeof item?.unitPrice === "number" ? item.unitPrice : parseFloat(String(item?.unitPrice ?? ""))

        if (!typeName) { res.status(400).json({ error: `Row ${i + 1}: typeName is required` }); return }
        if (!Number.isInteger(quantity) || quantity < 1) {
          res.status(400).json({ error: `Row ${i + 1}: quantity must be a positive integer` }); return
        }
        if (typeof unitPrice !== "number" || Number.isNaN(unitPrice) || unitPrice < 0) {
          res.status(400).json({ error: `Row ${i + 1}: unitPrice must be a non-negative number` }); return
        }
        items.push({ typeName, quantity, unitPrice, fulfilledQty: 0 })
      }
      order.items = items
    }

    if (notes !== undefined) order.notes = notes

    order.audit.push({
      action: "updated",
      performedBy: req.user.id as any,
      timestamp: new Date(),
    })

    await order.save()

    res.json({ message: "Order updated", order: toOrderResponse(order) })
  } catch (error: any) {
    console.error("Update order error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Transition order status
router.patch("/:id/status", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { status: newStatus, note } = req.body as { status: OrderStatus; note?: string }
    if (!newStatus) { res.status(400).json({ error: "status is required" }); return }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    if (!canTransition(order.status, newStatus)) {
      res.status(400).json({
        error: `Cannot transition from '${order.status}' to '${newStatus}'`,
      })
      return
    }

    const fromStatus = order.status
    order.status = newStatus
    order.audit.push({
      action: "status_change",
      fromStatus,
      toStatus: newStatus,
      performedBy: req.user.id as any,
      timestamp: new Date(),
      note: note || undefined,
    })

    await order.save()

    wmsEvents.emit(WMS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: req.user.id,
      fromStatus,
      toStatus: newStatus,
      note: note || undefined,
    } as OrderStatusEvent)

    res.json({
      message: `Order status changed to '${newStatus}'`,
      order: toOrderResponse(order),
    })
  } catch (error: any) {
    console.error("Status transition error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Fulfill order — creates warehouse flow and updates inventory
// Purchase order → load into warehouse; Sales order → unload from warehouse
router.post("/:id/fulfill", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    if (order.status !== "confirmed" && order.status !== "in_progress") {
      res.status(400).json({ error: "Order must be confirmed or in-progress to fulfill" }); return
    }

    const warehouse = await Warehouse.findOne({ _id: order.warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const unfulfilled = order.items.filter((i) => i.fulfilledQty < i.quantity)
    if (unfulfilled.length === 0) {
      res.status(400).json({ error: "All items already fulfilled" }); return
    }

    const operation: WarehouseFlowOperation = order.orderType === "purchase" ? "load" : "unload"

    const inventoryMap = new Map<string, number>()
    for (const i of warehouse.inventory || []) {
      inventoryMap.set(i.typeName, i.count)
    }

    const flowItems: { typeName: string; count: number; unitPrice: number }[] = []

    for (const item of unfulfilled) {
      const remaining = item.quantity - item.fulfilledQty
      if (remaining <= 0) continue

      if (operation === "unload") {
        const current = inventoryMap.get(item.typeName) ?? 0
        if (current < remaining) {
          res.status(400).json({
            error: `Insufficient inventory for "${item.typeName}": have ${current}, need ${remaining}`,
          })
          return
        }
      }

      flowItems.push({ typeName: item.typeName, count: remaining, unitPrice: item.unitPrice })
    }

    for (const fi of flowItems) {
      if (operation === "load") {
        inventoryMap.set(fi.typeName, (inventoryMap.get(fi.typeName) ?? 0) + fi.count)
      } else {
        const next = (inventoryMap.get(fi.typeName) ?? 0) - fi.count
        if (next <= 0) inventoryMap.delete(fi.typeName)
        else inventoryMap.set(fi.typeName, next)
      }
    }

    warehouse.inventory = Array.from(inventoryMap.entries()).map(([typeName, count]) => ({ typeName, count }))
    await warehouse.save()

    const flow = new WarehouseFlow({
      warehouseId: warehouse._id,
      operation,
      items: flowItems,
      performedBy: req.user.id,
    })
    await flow.save()

    for (const item of order.items) {
      item.fulfilledQty = item.quantity
    }

    if (order.status === "confirmed") {
      order.status = "in_progress"
      order.audit.push({
        action: "status_change",
        fromStatus: "confirmed",
        toStatus: "in_progress",
        performedBy: req.user.id as any,
        timestamp: new Date(),
        note: "Auto-advanced on fulfillment",
      })
    }

    order.status = "completed"
    order.audit.push({
      action: "fulfilled",
      fromStatus: "in_progress",
      toStatus: "completed",
      performedBy: req.user.id as any,
      timestamp: new Date(),
    })

    await order.save()

    wmsEvents.emit(WMS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: req.user.id,
      fromStatus: "in_progress",
      toStatus: "completed",
    } as OrderStatusEvent)

    res.json({
      message: `Order fulfilled — ${operation} recorded`,
      order: toOrderResponse(order),
      flow: {
        id: flow._id.toString(),
        operation: flow.operation,
        items: flow.items,
        createdAt: flow.createdAt,
      },
    })
  } catch (error: any) {
    console.error("Fulfill order error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete order (draft only)
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
    if (!order) { res.status(404).json({ error: "Order not found" }); return }

    if (order.status !== "draft" && order.status !== "cancelled") {
      res.status(400).json({ error: "Only draft or cancelled orders can be deleted" }); return
    }

    await Order.deleteOne({ _id: order._id })
    res.json({ message: "Order deleted" })
  } catch (error: any) {
    console.error("Delete order error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
