import { Router, Response } from "express"
import { Warehouse } from "../models/Warehouse"
import { authenticate, AuthRequest } from "../middleware/auth"

const router = Router()

// All warehouse routes require authentication
router.use(authenticate)

// Get all warehouses for the authenticated user
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouses = await Warehouse.find({ userId: req.user.id }).sort({
      createdAt: -1,
    })

    res.json({
      warehouses: warehouses.map((w) => ({
        id: w._id.toString(),
        name: w.name,
        description: w.description,
        address: w.address,
        coordinates: [w.coordinates.lng, w.coordinates.lat] as [number, number],
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
    })
  } catch (error: any) {
    console.error("Get warehouses error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get a single warehouse by ID
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    res.json({
      warehouse: {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: [
          warehouse.coordinates.lng,
          warehouse.coordinates.lat,
        ] as [number, number],
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Get warehouse error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create a new warehouse
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { name, description, address, coordinates } = req.body

    // Validation
    if (!name || !address || !coordinates) {
      res.status(400).json({
        error: "Name, address, and coordinates are required",
      })
      return
    }

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      res.status(400).json({
        error: "Coordinates must be an array of [lng, lat]",
      })
      return
    }

    const [lng, lat] = coordinates

    if (typeof lng !== "number" || typeof lat !== "number") {
      res.status(400).json({
        error: "Coordinates must be numbers",
      })
      return
    }

    // Create warehouse
    const warehouse = new Warehouse({
      name,
      description: description || "",
      address,
      coordinates: { lat, lng },
      userId: req.user.id,
    })

    await warehouse.save()

    res.status(201).json({
      message: "Warehouse created successfully",
      warehouse: {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: [warehouse.coordinates.lng, warehouse.coordinates.lat] as [
          number,
          number
        ],
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Create warehouse error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update a warehouse
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { name, description, address, coordinates } = req.body

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    // Update fields
    if (name !== undefined) warehouse.name = name
    if (description !== undefined) warehouse.description = description
    if (address !== undefined) warehouse.address = address
    if (coordinates !== undefined) {
      if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        res.status(400).json({
          error: "Coordinates must be an array of [lng, lat]",
        })
        return
      }
      const [lng, lat] = coordinates
      warehouse.coordinates = { lat, lng }
    }

    await warehouse.save()

    res.json({
      message: "Warehouse updated successfully",
      warehouse: {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: [warehouse.coordinates.lng, warehouse.coordinates.lat] as [
          number,
          number
        ],
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Update warehouse error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete a warehouse
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    res.json({ message: "Warehouse deleted successfully" })
  } catch (error: any) {
    console.error("Delete warehouse error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
