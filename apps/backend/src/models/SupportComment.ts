import mongoose, { Document, Schema } from "mongoose"

export interface ISupportComment extends Document {
  name: string
  email: string
  message: string
  userId: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const SupportCommentSchema = new Schema<ISupportComment>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
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

SupportCommentSchema.index({ userId: 1 })
SupportCommentSchema.index({ createdAt: -1 })

export const SupportComment = mongoose.model<ISupportComment>(
  "SupportComment",
  SupportCommentSchema
)
