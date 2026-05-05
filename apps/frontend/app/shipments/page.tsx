"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ProtectedRoute } from "@/components/protected-route"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { shipmentApi, Shipment, ShipmentStatus } from "@/lib/api"
import {
  Truck,
  Filter,
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Box,
  XCircle,
} from "lucide-react"

const ALL_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "picking",
  "picked",
  "packing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
]

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  picking: "bg-sky-50 text-sky-700 border-sky-200",
  picked: "bg-blue-50 text-blue-700 border-blue-200",
  packing: "bg-violet-50 text-violet-700 border-violet-200",
  packed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

const STATUS_ICONS: Record<ShipmentStatus, typeof Truck> = {
  pending: Clock,
  picking: Package,
  picked: Package,
  packing: Box,
  packed: Box,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: XCircle,
}

export default function ShipmentsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState<ShipmentStatus | "">("")
  const [page, setPage] = useState(1)
  const limit = 20

  const loadShipments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params: Record<string, unknown> = { page, limit }
      if (filterStatus) params.status = filterStatus
      const res = await shipmentApi.getAll(params as any)
      setShipments(res.shipments)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipments.failedToLoad"))
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, t])

  useEffect(() => { loadShipments() }, [loadShipments])

  const totalPages = Math.ceil(total / limit)

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
            <h1 className="text-3xl font-bold tracking-tight">{t("shipments.title")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("shipments.subtitle")}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-top-2 duration-300 fill-mode-both delay-100">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as ShipmentStatus | ""); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("shipments.allStatuses")}</option>
            {ALL_SHIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{t("shipments.statusLabels." + s)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive animate-in fade-in-0 duration-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="text-muted-foreground">{t("shipments.loadingShipments")}</p>
            </div>
          </div>
        ) : shipments.length === 0 ? (
          <Card className="animate-in fade-in-0 zoom-in-95 duration-300">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <Truck className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t("shipments.noShipmentsYet")}</h3>
              <p className="mt-2 text-muted-foreground">
                {t("shipments.noShipmentsDesc")}
              </p>
              <Button className="mt-4" onClick={() => router.push("/orders")}>
                {t("shipments.viewOrders")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 fill-mode-both delay-150">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("shipments.shipmentNumber")}</TableHead>
                    <TableHead>{t("shipments.orderNumber")}</TableHead>
                    <TableHead>{t("shipments.carrier")}</TableHead>
                    <TableHead>{t("shipments.tracking")}</TableHead>
                    <TableHead>{t("shipments.items")}</TableHead>
                    <TableHead>{t("shipments.status")}</TableHead>
                    <TableHead>{t("shipments.created")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((shipment, idx) => {
                    const StatusIcon = STATUS_ICONS[shipment.status]
                    return (
                      <TableRow
                        key={shipment.id}
                        className="cursor-pointer transition-colors duration-150 hover:bg-accent/50"
                        style={{ animationDelay: `${idx * 30}ms` }}
                        onClick={() => router.push(`/shipments/${shipment.id}`)}
                      >
                        <TableCell className="font-mono font-medium">
                          {shipment.shipmentNumber}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {shipment.orderNumber}
                        </TableCell>
                        <TableCell>{shipment.carrier || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {shipment.trackingNumber || "—"}
                        </TableCell>
                        <TableCell>{shipment.items.length}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${STATUS_COLORS[shipment.status]} transition-all duration-200`}
                          >
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t("shipments.statusLabels." + shipment.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(shipment.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between animate-in fade-in-0 duration-200 delay-200">
                <p className="text-sm text-muted-foreground">
                  {t("shipments.showing", {
                    from: (page - 1) * limit + 1,
                    to: Math.min(page * limit, total),
                    total,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t("shipments.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("shipments.next")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}
