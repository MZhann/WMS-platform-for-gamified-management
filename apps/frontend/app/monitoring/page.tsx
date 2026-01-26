"use client"

import { ProtectedRoute } from "@/components/protected-route"

export default function MonitoringPage() {
  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Monitoring</h1>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-muted-foreground">Monitoring dashboard coming soon...</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
