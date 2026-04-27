import mongoose, { Document, Schema } from "mongoose"

export interface ITelegramSession extends Document {
  chatId: number
  userId: mongoose.Types.ObjectId
  userName: string
  userEmail: string
  createdAt: Date
  updatedAt: Date
}

const TelegramSessionSchema = new Schema<ITelegramSession>(
  {
    chatId: {
      type: Number,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

TelegramSessionSchema.index({ userId: 1 })

export const TelegramSession = mongoose.model<ITelegramSession>(
  "TelegramSession",
  TelegramSessionSchema
)
