import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    isAdmin?: boolean
  }
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")

    if (!token) {
      res.status(401).json({ error: "Authentication required" })
      return
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: "Server configuration error" })
      return
    }

    const decoded = jwt.verify(token, jwtSecret) as {
      id: string
      email: string
      name: string
      isAdmin?: boolean
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      isAdmin: decoded.isAdmin ?? false,
    }
    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid token" })
      return
    }
    res.status(500).json({ error: "Authentication error" })
  }
}

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" })
    return
  }
  next()
}
