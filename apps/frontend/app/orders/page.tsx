"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
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
import {
  orderApi,
  Order,
  OrderType,
  OrderStatus,
} from "@/lib/api"
import { CreateOrderDialog } from "@/components/create-order-dialog"
import {
  ClipboardList,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Filter,
} from "lucide-react"

const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

export default function OrdersPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [filterType, setFilterType] = useState<OrderType | "">("")
  const [filterStatus, setFilterStatus] = useState<OrderStatus | "">("")
  const [page, setPage] = useState(1)
  const limit = 20

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params: Record<string, unknown> = { page, limit }
      if (filterType) params.type = filterType
      if (filterStatus) params.status = filterStatus
      const res = await orderApi.getAll(params as any)
      setOrders(res.orders)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orders.failedToLoad"))
    } finally {
      setLoading(false)
    }
  }, [page, filterType, filterStatus, t])

  useEffect(() => { loadOrders() }, [loadOrders])

  const totalPages = Math.ceil(total / limit)

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
            <h1 className="text-3xl font-bold tracking-tight">{t("orders.title")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("orders.subtitle")}
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="animate-in fade-in-0 slide-in-from-right-4 duration-300"
          >
            <Plus className="mr-2 h-4 w-4" /> {t("orders.newOrder")}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-top-2 duration-300 fill-mode-both delay-100">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
          </div>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as OrderType | ""); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("orders.allTypes")}</option>
            <option value="purchase">{t("orders.purchase")}</option>
            <option value="sales">{t("orders.sales")}</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as OrderStatus | ""); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("orders.allStatuses")}</option>
            {(Object.keys(STATUS_COLORS) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{t("orders.statusLabels." + s)}</option>
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
              <p className="text-muted-foreground">{t("orders.loadingOrders")}</p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <Card className="animate-in fade-in-0 zoom-in-95 duration-300">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t("orders.noOrdersYet")}</h3>
              <p className="mt-2 text-muted-foreground">
                {t("orders.noOrdersDesc")}
              </p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> {t("orders.newOrder")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 fill-mode-both delay-150">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("orders.orderNumber")}</TableHead>
                    <TableHead>{t("orders.type")}</TableHead>
                    <TableHead>{t("orders.counterparty")}</TableHead>
                    <TableHead>{t("orders.items")}</TableHead>
                    <TableHead className="text-right">{t("orders.totalValue")}</TableHead>
                    <TableHead>{t("orders.status")}</TableHead>
                    <TableHead>{t("orders.created")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order, idx) => {
                    const totalValue = order.items.reduce(
                      (sum, i) => sum + i.quantity * i.unitPrice,
                      0
                    )
                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer transition-colors duration-150 hover:bg-accent/50"
                        style={{ animationDelay: `${idx * 30}ms` }}
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        <TableCell className="font-mono font-medium">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {order.orderType === "purchase" ? (
                              <ArrowDownCircle className="h-4 w-4 text-blue-500" />
                            ) : (
                              <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                            )}
                            {order.orderType === "purchase" ? "PO" : "SO"}
                          </span>
                        </TableCell>
                        <TableCell>{order.counterparty}</TableCell>
                        <TableCell>{order.items.length}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${STATUS_COLORS[order.status]} transition-all duration-200`}
                          >
                            {t("orders.statusLabels." + order.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between animate-in fade-in-0 duration-200 delay-200">
                <p className="text-sm text-muted-foreground">
                  {t("orders.showing", {
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
                    {t("orders.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("orders.next")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <CreateOrderDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={loadOrders}
        />
      </div>
    </ProtectedRoute>
  )
}
