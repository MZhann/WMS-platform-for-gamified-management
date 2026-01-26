import { Router, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { User } from "../models/User"

const router = Router()

// Register new user
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body

    // Validation
    if (!email || !password || !name) {
      res.status(400).json({
        error: "Email, password, and name are required",
      })
      return
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      res.status(400).json({ error: "User with this email already exists" })
      return
    }

    // Create new user
    const user = new User({ email, password, name })
    await user.save()

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: "Server configuration error" })
      return
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      jwtSecret,
      { expiresIn: "7d" }
    )

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    })
  } catch (error: any) {
    console.error("Registration error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Login user
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      res.status(400).json({
        error: "Email and password are required",
      })
      return
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select("+password")
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: "Server configuration error" })
      return
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      jwtSecret,
      { expiresIn: "7d" }
    )

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    })
  } catch (error: any) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get current user (protected route)
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.status(401).json({ error: "Authentication required" })
      return
    }

    const token = authHeader.replace("Bearer ", "")
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: "Server configuration error" })
      return
    }

    const decoded = jwt.verify(token, jwtSecret) as {
      id: string
      email: string
      name: string
    }

    const user = await User.findById(decoded.id)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    })
  } catch (error: any) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid token" })
      return
    }
    console.error("Get user error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
