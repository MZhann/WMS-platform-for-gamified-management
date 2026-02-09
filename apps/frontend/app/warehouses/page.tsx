"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { warehouseApi, Warehouse } from "@/lib/api"
import { Package } from "lucide-react"

export default function WarehousesPage() {
  const router = useRouter()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await warehouseApi.getAll()
        setWarehouses(res.warehouses)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load warehouses")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="text-muted-foreground">Loading warehouses...</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Warehouses</h1>
          <p className="mt-1 text-muted-foreground">
            View inventory summary and manage items by warehouse
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {warehouses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No warehouses yet</h3>
              <p className="mt-2 text-muted-foreground">
                Create warehouses on the map to see them here
              </p>
              <Link
                href="/"
                className="mt-4 text-sm font-medium text-primary hover:underline"
              >
                Go to map
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse name</TableHead>
                  <TableHead className="text-right">Total items</TableHead>
                  <TableHead className="text-right">Type count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow
                    key={w.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/warehouses/${w.id}`)}
                  >
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right">
                      {w.totalItems ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.typeCount ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  )
}
