"use client"

import { ProtectedRoute } from "@/components/protected-route"

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-muted-foreground">Settings page coming soon...</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
