import mongoose, { Document, Schema } from "mongoose"

export type ShipmentStatus =
  | "pending"
  | "picking"
  | "picked"
  | "packing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"

export interface IShipmentItem {
  typeName: string
  quantity: number
  pickedQty: number
  packedQty: number
  locationId?: mongoose.Types.ObjectId
  locationCode?: string
}

export interface IShipmentAuditEntry {
  action: string
  fromStatus?: string
  toStatus?: string
  performedBy: mongoose.Types.ObjectId
  timestamp: Date
  note?: string
}

export interface IShipment extends Document {
  shipmentNumber: string
  orderId: mongoose.Types.ObjectId
  orderNumber: string
  warehouseId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  status: ShipmentStatus
  carrier: string
  trackingNumber: string
  items: IShipmentItem[]
  shippedAt?: Date
  deliveredAt?: Date
  notes: string
  audit: IShipmentAuditEntry[]
  createdAt: Date
  updatedAt: Date
}

const ShipmentItemSchema = new Schema<IShipmentItem>(
  {
    typeName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    pickedQty: { type: Number, default: 0, min: 0 },
    packedQty: { type: Number, default: 0, min: 0 },
    locationId: { type: Schema.Types.ObjectId, ref: "Location" },
    locationCode: { type: String, trim: true },
  },
  { _id: false }
)

const ShipmentAuditSchema = new Schema<IShipmentAuditEntry>(
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

const ShipmentSchema = new Schema<IShipment>(
  {
    shipmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID is required"],
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
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
    status: {
      type: String,
      enum: {
        values: ["pending", "picking", "picked", "packing", "packed", "shipped", "delivered", "cancelled"],
        message: "Invalid shipment status",
      },
      default: "pending",
    },
    carrier: { type: String, trim: true, default: "" },
    trackingNumber: { type: String, trim: true, default: "" },
    items: {
      type: [ShipmentItemSchema],
      required: true,
      validate: {
        validator: (v: IShipmentItem[]) => Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    notes: { type: String, trim: true, default: "" },
    audit: { type: [ShipmentAuditSchema], default: [] },
  },
  { timestamps: true }
)

ShipmentSchema.index({ orderId: 1 })
ShipmentSchema.index({ userId: 1, createdAt: -1 })
ShipmentSchema.index({ warehouseId: 1, status: 1 })

export const Shipment = mongoose.model<IShipment>("Shipment", ShipmentSchema)

const VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ["picking", "picked", "cancelled"],
  picking: ["picked", "cancelled"],
  picked: ["packing", "packed", "cancelled"],
  packing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
}

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

let shipmentCounter: number | null = null

export async function generateShipmentNumber(): Promise<string> {
  if (shipmentCounter === null) {
    const latest = await Shipment.findOne().sort({ createdAt: -1 }).lean()
    if (latest) {
      const num = parseInt(latest.shipmentNumber.replace(/^SH-/, ""), 10)
      shipmentCounter = Number.isNaN(num) ? 0 : num
    } else {
      shipmentCounter = 0
    }
  }
  shipmentCounter++
  return `SH-${String(shipmentCounter).padStart(5, "0")}`
}
