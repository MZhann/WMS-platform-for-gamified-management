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
const PORT = parseInt(process.env.PORT || "3001", 10)

// CORS - allow frontend origin in production, or all origins in development
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean)
app.use(cors(corsOrigins?.length ? { origin: corsOrigins, credentials: true } : {}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoints (for Railway, load balancers, etc.)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WMS API is running", version: "1.0" })
})
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
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()
