import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { connectDatabase } from "./config/database"
import { seedAdminUser } from "./config/seedAdmin"
import authRoutes from "./routes/auth"
import warehouseRoutes from "./routes/warehouses"
import supportRoutes from "./routes/support"
import adminRoutes from "./routes/admin"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" })
})

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/warehouses", warehouseRoutes)
app.use("/api/support", supportRoutes)
app.use("/api/admin", adminRoutes)

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err)
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  })
})

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase()

    // Seed admin user if not exists
    await seedAdminUser()

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`)
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()
