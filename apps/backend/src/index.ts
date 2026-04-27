import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database";
import { seedAdminUser } from "./config/seedAdmin";
import authRoutes from "./routes/auth";
import warehouseRoutes from "./routes/warehouses";
import supportRoutes from "./routes/support";
import adminRoutes from "./routes/admin";
import orderRoutes from "./routes/orders";
import locationRoutes from "./routes/locations";
import shipmentRoutes from "./routes/shipments";
import pickingRoutes from "./routes/picking";
import aiRoutes from "./routes/ai";
import { startTelegramBot } from "./telegram/bot";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// CORS - localhost for dev + optional CORS_ORIGIN for production
const localhostOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];
const envOrigins =
  process.env.CORS_ORIGIN?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];
const corsOrigins = [...new Set([...localhostOrigins, ...envOrigins])];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints (for Railway, load balancers, etc.)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WMS API is running", version: "1.0" });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/picking", pickingRoutes);
app.use("/api/ai", aiRoutes);

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Seed admin user if not exists
    await seedAdminUser();

    // Start Telegram bot (non-blocking — runs in background)
    startTelegramBot(app).catch((err) => {
      console.error("Telegram bot failed to start:", err);
    });

    // Start Express server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
