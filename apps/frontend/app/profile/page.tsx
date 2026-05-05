"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/AuthContext"
import { warehouseApi } from "@/lib/api"
import { User } from "lucide-react"

export default function ProfilePage() {
  const { t } = useTranslation()
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
        <h1 className="text-3xl font-bold mb-6">{t("profile.title")}</h1>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* User Information Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">{t("profile.userInformation")}</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t("profile.nameLabel")}</label>
                <p className="text-lg font-medium mt-1">{user?.name || t("profile.na")}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t("profile.emailLabel")}</label>
                <p className="text-lg font-medium mt-1">{user?.email || t("profile.na")}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t("profile.userId")}</label>
                <p className="text-sm text-muted-foreground mt-1 font-mono">{user?.id || t("profile.na")}</p>
              </div>
            </div>
          </div>

          {/* Statistics Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">{t("profile.statistics")}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t("profile.totalWarehouses")}</label>
                {loading ? (
                  <p className="text-lg font-medium mt-1">{t("common.loading")}</p>
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
