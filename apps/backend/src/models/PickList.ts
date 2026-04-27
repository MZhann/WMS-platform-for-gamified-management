import mongoose, { Document, Schema } from "mongoose"

export type PickListType = "single" | "wave"
export type PickListStatus = "pending" | "in_progress" | "completed" | "cancelled"
export type PickItemStatus = "pending" | "picked" | "short"

export interface IPickItem {
  shipmentId: mongoose.Types.ObjectId
  orderNumber: string
  typeName: string
  quantity: number
  pickedQty: number
  locationId?: mongoose.Types.ObjectId
  locationCode?: string
  status: PickItemStatus
}

export interface IPickList extends Document {
  pickListNumber: string
  warehouseId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  type: PickListType
  status: PickListStatus
  shipmentIds: mongoose.Types.ObjectId[]
  items: IPickItem[]
  startedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const PickItemSchema = new Schema<IPickItem>(
  {
    shipmentId: {
      type: Schema.Types.ObjectId,
      ref: "Shipment",
      required: true,
    },
    orderNumber: { type: String, required: true, trim: true },
    typeName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    pickedQty: { type: Number, default: 0, min: 0 },
    locationId: { type: Schema.Types.ObjectId, ref: "Location" },
    locationCode: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "picked", "short"],
      default: "pending",
    },
  },
  { _id: false }
)

const PickListSchema = new Schema<IPickList>(
  {
    pickListNumber: {
      type: String,
      required: true,
      unique: true,
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
    type: {
      type: String,
      enum: { values: ["single", "wave"], message: "Type must be single or wave" },
      required: true,
    },
    status: {
      type: String,
      enum: { values: ["pending", "in_progress", "completed", "cancelled"], message: "Invalid status" },
      default: "pending",
    },
    shipmentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Shipment" }],
      required: true,
      validate: {
        validator: (v: mongoose.Types.ObjectId[]) => Array.isArray(v) && v.length > 0,
        message: "At least one shipment is required",
      },
    },
    items: {
      type: [PickItemSchema],
      required: true,
      validate: {
        validator: (v: IPickItem[]) => Array.isArray(v) && v.length > 0,
        message: "At least one pick item is required",
      },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

PickListSchema.index({ userId: 1, createdAt: -1 })
PickListSchema.index({ warehouseId: 1, status: 1 })

export const PickList = mongoose.model<IPickList>("PickList", PickListSchema)

let pickListCounter: number | null = null

export async function generatePickListNumber(): Promise<string> {
  if (pickListCounter === null) {
    const latest = await PickList.findOne().sort({ createdAt: -1 }).lean()
    if (latest) {
      const num = parseInt(latest.pickListNumber.replace(/^PK-/, ""), 10)
      pickListCounter = Number.isNaN(num) ? 0 : num
    } else {
      pickListCounter = 0
    }
  }
  pickListCounter++
  return `PK-${String(pickListCounter).padStart(5, "0")}`
}
