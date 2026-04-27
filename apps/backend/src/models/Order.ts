import mongoose, { Document, Schema } from "mongoose"

export type OrderType = "purchase" | "sales"
export type OrderStatus = "draft" | "confirmed" | "in_progress" | "completed" | "cancelled"

export interface IOrderItem {
  typeName: string
  quantity: number
  unitPrice: number
  fulfilledQty: number
}

export interface IOrderAuditEntry {
  action: string
  fromStatus?: string
  toStatus?: string
  performedBy: mongoose.Types.ObjectId
  timestamp: Date
  note?: string
}

export interface IOrder extends Document {
  orderNumber: string
  orderType: OrderType
  status: OrderStatus
  warehouseId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  counterparty: string
  items: IOrderItem[]
  notes: string
  audit: IOrderAuditEntry[]
  createdAt: Date
  updatedAt: Date
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    typeName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    fulfilledQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
)

const OrderAuditEntrySchema = new Schema<IOrderAuditEntry>(
  {
    action: { type: String, required: true },
    fromStatus: { type: String },
    toStatus: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false }
)

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderType: {
      type: String,
      enum: { values: ["purchase", "sales"], message: "orderType must be purchase or sales" },
      required: [true, "Order type is required"],
    },
    status: {
      type: String,
      enum: {
        values: ["draft", "confirmed", "in_progress", "completed", "cancelled"],
        message: "Invalid status",
      },
      default: "draft",
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse ID is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    counterparty: {
      type: String,
      required: [true, "Counterparty (supplier/customer) is required"],
      trim: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (v: IOrderItem[]) => Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    audit: {
      type: [OrderAuditEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
)

OrderSchema.index({ userId: 1, createdAt: -1 })
OrderSchema.index({ warehouseId: 1, status: 1 })

export const Order = mongoose.model<IOrder>("Order", OrderSchema)

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

let orderCounter: number | null = null

export async function generateOrderNumber(type: OrderType): Promise<string> {
  if (orderCounter === null) {
    const latest = await Order.findOne().sort({ createdAt: -1 }).lean()
    if (latest) {
      const num = parseInt(latest.orderNumber.replace(/^(PO|SO)-/, ""), 10)
      orderCounter = Number.isNaN(num) ? 0 : num
    } else {
      orderCounter = 0
    }
  }
  orderCounter++
  const prefix = type === "purchase" ? "PO" : "SO"
  return `${prefix}-${String(orderCounter).padStart(5, "0")}`
}
