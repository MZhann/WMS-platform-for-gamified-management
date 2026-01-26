"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/AuthContext"
import { warehouseApi } from "@/lib/api"
import { User } from "lucide-react"

export default function ProfilePage() {
  const { user } = useAuth()
  const [warehouseCount, setWarehouseCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadWarehouseCount = async () => {
      try {
        const response = await warehouseApi.getAll()
        setWarehouseCount(response.warehouses.length)
      } catch (error) {
        console.error("Failed to load warehouse count:", error)
      } finally {
        setLoading(false)
      }
    }

    loadWarehouseCount()
  }, [])

  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Profile</h1>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* User Information Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">User Information</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <p className="text-lg font-medium mt-1">{user?.name || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-lg font-medium mt-1">{user?.email || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">User ID</label>
                <p className="text-sm text-muted-foreground mt-1 font-mono">{user?.id || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Statistics Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Statistics</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Warehouses</label>
                {loading ? (
                  <p className="text-lg font-medium mt-1">Loading...</p>
                ) : (
                  <p className="text-lg font-medium mt-1">{warehouseCount}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
