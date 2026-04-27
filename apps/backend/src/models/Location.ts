import mongoose, { Document, Schema } from "mongoose"

export interface ILocationInventoryItem {
  typeName: string
  count: number
}

export interface ILocation extends Document {
  warehouseId: mongoose.Types.ObjectId
  zoneId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  code: string
  aisle: string
  rack: string
  maxCapacity: number
  inventory: ILocationInventoryItem[]
  status: "active" | "inactive"
  createdAt: Date
  updatedAt: Date
}

const LocationSchema = new Schema<ILocation>(
  {
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse ID is required"],
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: "Zone",
      required: [true, "Zone ID is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    code: {
      type: String,
      required: [true, "Location code is required"],
      trim: true,
    },
    aisle: {
      type: String,
      required: true,
      trim: true,
    },
    rack: {
      type: String,
      required: true,
      trim: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    inventory: {
      type: [
        {
          typeName: { type: String, required: true, trim: true },
          count: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
)

LocationSchema.index({ warehouseId: 1, zoneId: 1 })
LocationSchema.index({ warehouseId: 1, code: 1 }, { unique: true })
LocationSchema.index({ userId: 1 })

export const Location = mongoose.model<ILocation>("Location", LocationSchema)
