"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/protected-route"

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && isAuthenticated && !user?.isAdmin) {
      router.push("/")
    }
  }, [user?.isAdmin, loading, isAuthenticated, router])

  if (!user?.isAdmin && isAuthenticated) {
    return null
  }

  return <ProtectedRoute>{children}</ProtectedRoute>
}
