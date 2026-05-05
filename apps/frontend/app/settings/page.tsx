"use client"

import { useTranslation } from "react-i18next"
import { ProtectedRoute } from "@/components/protected-route"

export default function SettingsPage() {
  const { t } = useTranslation()
  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">{t("settings.title")}</h1>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-muted-foreground">{t("settings.comingSoon")}</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
