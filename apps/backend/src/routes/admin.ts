import { Router, Response } from "express"
import { SupportComment } from "../models/SupportComment"
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth"

const router = Router()

// All admin routes require authentication and admin role
router.use(authenticate)
router.use(requireAdmin)

// Get all support comments
router.get("/comments", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comments = await SupportComment.find()
      .sort({ createdAt: -1 })
      .lean()

    res.json({
      comments: comments.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        email: c.email,
        message: c.message,
        createdAt: c.createdAt,
      })),
    })
  } catch (error: any) {
    console.error("Get admin comments error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete a support comment
router.delete(
  "/comments/:id",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const comment = await SupportComment.findByIdAndDelete(req.params.id)

      if (!comment) {
        res.status(404).json({ error: "Comment not found" })
        return
      }

      res.json({ message: "Comment deleted successfully" })
    } catch (error: any) {
      console.error("Delete comment error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }
)

export default router
