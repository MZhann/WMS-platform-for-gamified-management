import { Router, Response } from "express"
import { SupportComment } from "../models/SupportComment"
import { authenticate, AuthRequest } from "../middleware/auth"

const router = Router()

// All support routes require authentication
router.use(authenticate)

// Create a new support comment
router.post("/comments", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { name, email, message } = req.body

    if (!name || !email || !message) {
      res.status(400).json({
        error: "Name, email, and message are required",
      })
      return
    }

    const comment = new SupportComment({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
      userId: req.user.id,
    })

    await comment.save()

    res.status(201).json({
      message: "Comment submitted successfully",
      comment: {
        id: comment._id.toString(),
        name: comment.name,
        email: comment.email,
        message: comment.message,
        createdAt: comment.createdAt,
      },
    })
  } catch (error: any) {
    console.error("Create support comment error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
