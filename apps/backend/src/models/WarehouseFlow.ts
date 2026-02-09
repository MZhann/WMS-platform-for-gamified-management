import mongoose, { Document, Schema } from "mongoose"

export interface IWarehouseFlowItem {
  typeName: string
  count: number
  unitPrice: number
}

export type WarehouseFlowOperation = "load" | "unload"

export interface IWarehouseFlow extends Document {
  warehouseId: mongoose.Types.ObjectId
  operation: WarehouseFlowOperation
  items: IWarehouseFlowItem[]
  performedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const WarehouseFlowItemSchema = new Schema<IWarehouseFlowItem>(
  {
    typeName: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
)

const WarehouseFlowSchema = new Schema<IWarehouseFlow>(
  {
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse ID is required"],
    },
    operation: {
      type: String,
      enum: { values: ["load", "unload"], message: "Operation must be load or unload" },
      required: [true, "Operation is required"],
    },
    items: {
      type: [WarehouseFlowItemSchema],
      required: true,
      validate: {
        validator: (v: IWarehouseFlowItem[]) => Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
)

WarehouseFlowSchema.index({ warehouseId: 1, createdAt: -1 })

export const WarehouseFlow = mongoose.model<IWarehouseFlow>("WarehouseFlow", WarehouseFlowSchema)
