import mongoose, { Document, Schema } from "mongoose"

export interface IWarehouse extends Document {
  name: string
  description: string
  address: string
  coordinates: {
    lat: number
    lng: number
  }
  userId: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const WarehouseSchema = new Schema<IWarehouse>(
  {
    name: {
      type: String,
      required: [true, "Warehouse name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    coordinates: {
      lat: {
        type: Number,
        required: [true, "Latitude is required"],
      },
      lng: {
        type: Number,
        required: [true, "Longitude is required"],
      },
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
  },
  {
    timestamps: true,
  }
)

// Index for faster queries by user
WarehouseSchema.index({ userId: 1 })

export const Warehouse = mongoose.model<IWarehouse>("Warehouse", WarehouseSchema)
