import mongoose, { Document, Schema } from "mongoose"

export type ZoneType = "receiving" | "storage" | "shipping" | "staging" | "cold_storage" | "returns"

export const ZONE_TYPES: ZoneType[] = ["receiving", "storage", "shipping", "staging", "cold_storage", "returns"]

export const ZONE_TYPE_COLORS: Record<ZoneType, string> = {
  receiving: "#3b82f6",
  storage: "#22c55e",
  shipping: "#f97316",
  staging: "#eab308",
  cold_storage: "#06b6d4",
  returns: "#ef4444",
}

export interface IZone extends Document {
  warehouseId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  name: string
  code: string
  type: ZoneType
  color: string
  x: number
  y: number
  w: number
  h: number
  aisles: number
  racksPerAisle: number
  capacityPerSlot: number
  createdAt: Date
  updatedAt: Date
}

const ZoneSchema = new Schema<IZone>(
  {
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
    name: {
      type: String,
      required: [true, "Zone name is required"],
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Zone code is required"],
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 6,
    },
    type: {
      type: String,
      enum: { values: ZONE_TYPES, message: "Invalid zone type" },
      required: [true, "Zone type is required"],
    },
    color: { type: String, default: "#3b82f6" },
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    w: { type: Number, required: true, min: 1, max: 30 },
    h: { type: Number, required: true, min: 1, max: 20 },
    aisles: { type: Number, required: true, min: 1, max: 50, default: 1 },
    racksPerAisle: { type: Number, required: true, min: 1, max: 50, default: 1 },
    capacityPerSlot: { type: Number, required: true, min: 1, default: 100 },
  },
  { timestamps: true }
)

ZoneSchema.index({ warehouseId: 1 })
ZoneSchema.index({ userId: 1 })
ZoneSchema.index({ warehouseId: 1, code: 1 }, { unique: true })

export const Zone = mongoose.model<IZone>("Zone", ZoneSchema)
