import mongoose from "mongoose"

// Support multiple env var names (Railway uses MONGO_URL, we use MONGODB_URI)
const getMongoUri = (): string | undefined =>
  process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL || process.env.MONGO_URI

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = getMongoUri()

    if (!mongoUri) {
      throw new Error(
        "MongoDB URI not found. Set MONGODB_URI, MONGO_URL, or DATABASE_URL in Railway Variables."
      )
    }

    await mongoose.connect(mongoUri)
    console.log("✅ MongoDB connected successfully")
  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}

// Handle connection events
mongoose.connection.on("disconnected", () => {
  console.log("⚠️  MongoDB disconnected")
})

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB error:", error)
})
