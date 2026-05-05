"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useRouter } from "next/navigation"
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
  shipmentApi,
  Order,
  OrderStatus,
  Shipment,
  ShipmentStatus,
} from "@/lib/api"
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  Play,
  Trash2,
  Loader2,
  PackageCheck,
  Clock,
  Truck,
  ExternalLink,
} from "lucide-react"

const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  picking: "bg-sky-50 text-sky-700 border-sky-200",
  picked: "bg-blue-50 text-blue-700 border-blue-200",
  packing: "bg-violet-50 text-violet-700 border-violet-200",
  packed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

const STATUS_STEPS: OrderStatus[] = ["draft", "confirmed", "in_progress", "completed"]

function StatusStepper({ current }: { current: OrderStatus }) {
  const { t } = useTranslation()
  const cancelled = current === "cancelled"
  const currentIdx = STATUS_STEPS.indexOf(current)

  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, idx) => {
        const isDone = !cancelled && idx < currentIdx
        const isActive = !cancelled && idx === currentIdx
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-300 ${
                isDone
                  ? "bg-green-100 text-green-700"
                  : isActive
                  ? "bg-primary text-primary-foreground shadow-sm scale-105"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : isActive ? (
                <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
              ) : null}
              {t("orders.statusLabels." + step)}
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={`h-0.5 w-4 transition-colors duration-300 ${
                  isDone ? "bg-green-300" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
      {cancelled && (
        <>
          <div className="h-0.5 w-4 bg-red-300" />
          <div className="flex h-8 items-center gap-1.5 rounded-full bg-red-50 px-3 text-xs font-medium text-red-600 border border-red-200">
            <XCircle className="h-3.5 w-3.5" />
            {t("orders.statusLabels.cancelled")}
          </div>
        </>
      )}
    </div>
  )
}

export default function OrderDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [shipmentLoading, setShipmentLoading] = useState(false)

  const loadOrder = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await orderApi.getOne(id)
      setOrder(res.order)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderDetail.failedToLoadOrder"))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  const loadShipment = useCallback(async () => {
    try {
      const res = await shipmentApi.getAll({ orderId: id, limit: 1 })
      setShipment(res.shipments.length > 0 ? res.shipments[0] : null)
    } catch {
      // no shipment is fine
    }
  }, [id])

  useEffect(() => { loadOrder() }, [loadOrder])
  useEffect(() => { loadShipment() }, [loadShipment])

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return
    try {
      setActionLoading(newStatus)
      const res = await orderApi.updateStatus(order.id, newStatus)
      setOrder(res.order)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderDetail.actionFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleFulfill() {
    if (!order) return
    try {
      setActionLoading("fulfill")
      const res = await orderApi.fulfill(order.id)
      setOrder(res.order)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderDetail.fulfillmentFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete() {
    if (!order) return
    try {
      setActionLoading("delete")
      await orderApi.delete(order.id)
      router.push("/orders")
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderDetail.deleteFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCreateShipment() {
    if (!order) return
    try {
      setShipmentLoading(true)
      setError(null)
      const res = await shipmentApi.create({ orderId: order.id })
      setShipment(res.shipment)
      await loadOrder()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orderDetail.createShipmentFailed"))
    } finally {
      setShipmentLoading(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="text-muted-foreground">{t("orderDetail.loadingOrder")}</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!order) {
    return (
      <ProtectedRoute>
        <div className="p-6 lg:p-8">
          <Button variant="ghost" onClick={() => router.push("/orders")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("orderDetail.backToOrders")}
          </Button>
          <p className="mt-8 text-center text-muted-foreground">{t("orderDetail.notFound")}</p>
        </div>
      </ProtectedRoute>
    )
  }

  const totalValue = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const fulfilledValue = order.items.reduce((sum, i) => sum + i.fulfilledQty * i.unitPrice, 0)
  const isTerminal = order.status === "completed" || order.status === "cancelled"
  const isSalesOrder = order.orderType === "sales"
  const canCreateShipment =
    isSalesOrder &&
    !shipment &&
    (order.status === "confirmed" || order.status === "in_progress")

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in-0 slide-in-from-left-4 duration-300">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/orders")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight font-mono">
                  {order.orderNumber}
                </h1>
                {order.orderType === "purchase" ? (
                  <ArrowDownCircle className="h-5 w-5 text-blue-500" />
                ) : (
                  <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {order.orderType === "purchase"
                  ? t("orderDetail.purchaseOrder")
                  : t("orderDetail.salesOrder")}{" "}
                &middot; {order.counterparty}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-sm px-3 py-1 ${STATUS_COLORS[order.status]} transition-all duration-300`}
          >
            {t("orders.statusLabels." + order.status)}
          </Badge>
        </div>

        {/* Status stepper */}
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300 delay-100 fill-mode-both">
          <StatusStepper current={order.status} />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive animate-in fade-in-0 duration-200">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline text-sm">
              {t("orderDetail.dismiss")}
            </button>
          </div>
        )}

        {/* Actions */}
        {!isTerminal && (
          <div className="flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-150 fill-mode-both">
            {order.status === "draft" && (
              <Button
                onClick={() => handleStatusChange("confirmed")}
                disabled={!!actionLoading}
              >
                {actionLoading === "confirmed" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {t("orderDetail.confirmOrder")}
              </Button>
            )}
            {order.status === "confirmed" && (
              <>
                <Button
                  onClick={() => handleStatusChange("in_progress")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "in_progress" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {t("orderDetail.startProcessing")}
                </Button>
                {!isSalesOrder && (
                  <Button
                    variant="outline"
                    onClick={handleFulfill}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "fulfill" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PackageCheck className="mr-2 h-4 w-4" />
                    )}
                    {t("orderDetail.fulfillComplete")}
                  </Button>
                )}
              </>
            )}
            {order.status === "in_progress" && !isSalesOrder && (
              <Button
                variant="outline"
                onClick={handleFulfill}
                disabled={!!actionLoading}
              >
                {actionLoading === "fulfill" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="mr-2 h-4 w-4" />
                )}
                {t("orderDetail.fulfillComplete")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => handleStatusChange("cancelled")}
              disabled={!!actionLoading}
            >
              {actionLoading === "cancelled" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {t("orderDetail.cancelOrder")}
            </Button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-200 fill-mode-both">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("orderDetail.totalValue")}</p>
              <p className="mt-1 text-2xl font-bold font-mono">
                ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("orderDetail.fulfilledValue")}</p>
              <p className="mt-1 text-2xl font-bold font-mono">
                ${fulfilledValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              {totalValue > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, (fulfilledValue / totalValue) * 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("orderDetail.items")}</p>
              <p className="mt-1 text-2xl font-bold">{order.items.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Items table */}
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-250 fill-mode-both">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">{t("orderDetail.orderItems")}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orderDetail.product")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.quantity")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.fulfilled")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.unitPrice")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.itemTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{item.typeName}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        item.fulfilledQty >= item.quantity
                          ? "text-green-600"
                          : item.fulfilledQty > 0
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      }
                    >
                      {item.fulfilledQty}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${item.unitPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${(item.quantity * item.unitPrice).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Shipment section (sales orders only) */}
        {isSalesOrder && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-300 fill-mode-both">
            {shipment ? (
              <Card>
                <div className="border-b p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">{t("orderDetail.shipment")}</h2>
                    <span className="text-sm font-mono text-muted-foreground">{shipment.shipmentNumber}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${SHIPMENT_STATUS_COLORS[shipment.status]} transition-all duration-300`}
                  >
                    {t("shipments.statusLabels." + shipment.status)}
                  </Badge>
                </div>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    {shipment.carrier && (
                      <div>
                        <span className="text-muted-foreground">{t("orderDetail.carrier")}:</span>{" "}
                        <span className="font-medium">{shipment.carrier}</span>
                      </div>
                    )}
                    {shipment.trackingNumber && (
                      <div>
                        <span className="text-muted-foreground">{t("orderDetail.tracking")}:</span>{" "}
                        <span className="font-mono font-medium">{shipment.trackingNumber}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("orderDetail.goToShipmentDetail")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/shipments/${shipment.id}`)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("orderDetail.openShipmentDetails")}
                  </Button>
                </CardContent>
              </Card>
            ) : canCreateShipment ? (
              <Card>
                <div className="border-b p-4 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{t("orderDetail.shipment")}</h2>
                </div>
                <CardContent className="pt-4">
                  <div className="flex flex-col items-center py-6 text-center">
                    <Truck className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("orderDetail.noShipmentYet")}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleCreateShipment}
                      disabled={shipmentLoading}
                    >
                      {shipmentLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Truck className="mr-2 h-4 w-4" />
                      )}
                      {t("orderDetail.createShipment")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <Card className="animate-in fade-in-0 duration-200 delay-300 fill-mode-both">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground mb-1">{t("orderDetail.notes")}</p>
              <p className="text-sm">{order.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Audit trail */}
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-300 fill-mode-both">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">{t("orderDetail.auditTrail")}</h2>
          </div>
          <CardContent className="pt-4">
            {order.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("orderDetail.noAuditEntries")}</p>
            ) : (
              <div className="relative space-y-0">
                {order.audit.map((entry, idx) => (
                  <div key={idx} className="flex gap-4 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {idx < order.audit.length - 1 && (
                        <div className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-sm font-medium capitalize">
                        {entry.action.replace(/_/g, " ")}
                        {entry.fromStatus && entry.toStatus && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            &mdash;{" "}
                            {t("orders.statusLabels." + entry.fromStatus, {
                              defaultValue: entry.fromStatus,
                            })}{" "}
                            &rarr;{" "}
                            {t("orders.statusLabels." + entry.toStatus, {
                              defaultValue: entry.toStatus,
                            })}
                          </span>
                        )}
                      </p>
                      {entry.note && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete button for draft/cancelled */}
        {(order.status === "draft" || order.status === "cancelled") && (
          <div className="flex justify-end animate-in fade-in-0 duration-200 delay-350 fill-mode-both">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              {actionLoading === "delete" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("orderDetail.deleteOrder")}
            </Button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
