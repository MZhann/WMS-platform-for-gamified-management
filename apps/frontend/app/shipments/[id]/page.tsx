"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
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
import {
  shipmentApi,
  Shipment,
  ShipmentStatus,
  PackingSlip,
} from "@/lib/api"
import {
  ArrowLeft,
  Truck,
  Package,
  PackageCheck,
  PackageX,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Printer,
  Send,
} from "lucide-react"

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  picking: "bg-blue-50 text-blue-700 border-blue-200",
  picked: "bg-indigo-50 text-indigo-700 border-indigo-200",
  packing: "bg-amber-50 text-amber-700 border-amber-200",
  packed: "bg-orange-50 text-orange-700 border-orange-200",
  shipped: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

const STEPPER_STEPS: ShipmentStatus[] = [
  "pending", "picking", "picked", "packing", "packed", "shipped", "delivered",
]

function ShipmentStepper({ current }: { current: ShipmentStatus }) {
  const { t } = useTranslation()
  const cancelled = current === "cancelled"
  const currentIdx = STEPPER_STEPS.indexOf(current)

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STEPPER_STEPS.map((step, idx) => {
        const isDone = !cancelled && idx < currentIdx
        const isActive = !cancelled && idx === currentIdx
        return (
          <div key={step} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-all duration-300 ${
                isDone
                  ? "bg-green-100 text-green-700"
                  : isActive
                  ? "bg-primary text-primary-foreground shadow-sm scale-105"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : isActive ? (
                <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              ) : null}
              {t("shipments.statusLabels." + step)}
            </div>
            {idx < STEPPER_STEPS.length - 1 && (
              <div className={`h-0.5 w-3 transition-colors duration-300 ${isDone ? "bg-green-300" : "bg-border"}`} />
            )}
          </div>
        )
      })}
      {cancelled && (
        <>
          <div className="h-0.5 w-3 bg-red-300" />
          <div className="flex h-7 items-center gap-1 rounded-full bg-red-50 px-2.5 text-xs font-medium text-red-600 border border-red-200">
            <XCircle className="h-3 w-3" />
            {t("shipments.statusLabels.cancelled")}
          </div>
        </>
      )}
    </div>
  )
}

function PackingSlipView({ slip }: { slip: PackingSlip }) {
  const { t } = useTranslation()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    if (!printRef.current) return
    const w = window.open("", "_blank")
    if (!w) return
    const docTitle = `${t("shipmentDetail.packingSlip")} - ${slip.shipmentNumber}`
    w.document.write(`
      <html><head><title>${docTitle}</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; }
        .mono { font-family: monospace; }
        h1 { font-size: 1.5rem; margin: 0; }
        .meta { color: #666; font-size: 0.875rem; margin-top: 0.5rem; }
        .notes { margin-top: 1rem; padding: 0.75rem; background: #fafafa; border-radius: 4px; font-size: 0.875rem; }
        @media print { body { margin: 1rem; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const orderLabel = `${t("shipmentDetail.order")}:`
  const shipFromLabel = t("shipmentDetail.shipFrom")
  const shipToLabel = t("shipmentDetail.shipTo")
  const carrierInline = t("shipmentDetail.carrierLabel")
  const trackingInline = `${t("shipments.tracking")}:`
  const itemTh = t("shipmentDetail.item")
  const qtyOrderedTh = t("shipmentDetail.qtyOrdered")
  const qtyPackedTh = t("shipmentDetail.qtyPacked")
  const notesStrong = `${t("shipmentDetail.notes")}:`

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-200 fill-mode-both">
      <div className="border-b p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("shipmentDetail.packingSlip")}</h2>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          {t("shipmentDetail.print")}
        </Button>
      </div>
      <CardContent className="pt-4">
        <div ref={printRef}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{t("shipmentDetail.PACKING_SLIP")}</h1>
              <p className="mono" style={{ fontFamily: "monospace", marginTop: "0.25rem" }}>
                {slip.shipmentNumber}
              </p>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.875rem", color: "#666" }}>
              <p>{orderLabel} {slip.orderNumber}</p>
              <p>{new Date(slip.date).toLocaleDateString()}</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem", fontSize: "0.875rem" }}>
            <div>
              <p style={{ fontWeight: 600 }}>{shipFromLabel}</p>
              <p>{slip.warehouse?.name || "N/A"}</p>
              <p style={{ color: "#666" }}>{slip.warehouse?.address || ""}</p>
            </div>
            <div>
              <p style={{ fontWeight: 600 }}>{shipToLabel}</p>
              <p>{slip.counterparty}</p>
            </div>
          </div>
          {(slip.carrier !== "N/A" || slip.trackingNumber !== "N/A") && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600 }}>{carrierInline}:</span> {slip.carrier}
              {slip.trackingNumber !== "N/A" && (
                <span style={{ marginLeft: "1.5rem" }}>
                  <span style={{ fontWeight: 600 }}>{trackingInline}</span> {slip.trackingNumber}
                </span>
              )}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #ddd", padding: "8px", background: "#f5f5f5", textAlign: "left" }}>{itemTh}</th>
                <th style={{ border: "1px solid #ddd", padding: "8px", background: "#f5f5f5", textAlign: "right" }}>{qtyOrderedTh}</th>
                <th style={{ border: "1px solid #ddd", padding: "8px", background: "#f5f5f5", textAlign: "right" }}>{qtyPackedTh}</th>
              </tr>
            </thead>
            <tbody>
              {slip.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #ddd", padding: "8px" }}>{item.typeName}</td>
                  <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "right" }}>{item.packedQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {slip.notes && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#fafafa", borderRadius: "4px", fontSize: "0.875rem" }}>
              <strong>{notesStrong}</strong> {slip.notes}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function statusLabel(t: (key: string, opts?: { defaultValue?: string }) => string, status: string | undefined) {
  if (!status) return ""
  const key = "shipments.statusLabels." + status
  return t(key, { defaultValue: status })
}

export default function ShipmentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [packingSlip, setPackingSlip] = useState<PackingSlip | null>(null)
  const [showShipForm, setShowShipForm] = useState(false)
  const [carrier, setCarrier] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")

  const loadShipment = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await shipmentApi.getOne(id)
      setShipment(res.shipment)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.failedToLoad"))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadShipment() }, [loadShipment])

  async function handlePickAll() {
    if (!shipment) return
    try {
      setActionLoading("pick")
      const picks = shipment.items.map((i) => ({
        typeName: i.typeName,
        pickedQty: i.quantity,
      }))
      const res = await shipmentApi.pick(shipment.id, picks)
      setShipment(res.shipment)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.pickFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePackAll() {
    if (!shipment) return
    try {
      setActionLoading("pack")
      const packs = shipment.items.map((i) => ({
        typeName: i.typeName,
        packedQty: i.pickedQty,
      }))
      const res = await shipmentApi.pack(shipment.id, packs)
      setShipment(res.shipment)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.packFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleStatusChange(newStatus: ShipmentStatus) {
    if (!shipment) return
    try {
      setActionLoading(newStatus)
      const data: any = { status: newStatus }
      if (newStatus === "shipped") {
        data.carrier = carrier
        data.trackingNumber = trackingNumber
      }
      const res = await shipmentApi.updateStatus(shipment.id, data)
      setShipment(res.shipment)
      setShowShipForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.actionFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  async function loadPackingSlip() {
    if (!shipment) return
    try {
      const res = await shipmentApi.getPackingSlip(shipment.id)
      setPackingSlip(res.packingSlip)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.packingSlipFailed"))
    }
  }

  async function handleDelete() {
    if (!shipment) return
    try {
      setActionLoading("delete")
      await shipmentApi.delete(shipment.id)
      router.push("/shipments")
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shipmentDetail.deleteFailed"))
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="text-muted-foreground">{t("shipmentDetail.loadingShipment")}</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!shipment) {
    return (
      <ProtectedRoute>
        <div className="p-6 lg:p-8">
          <Button variant="ghost" onClick={() => router.push("/shipments")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("shipmentDetail.backToShipments")}
          </Button>
          <p className="mt-8 text-center text-muted-foreground">{t("shipmentDetail.notFound")}</p>
        </div>
      </ProtectedRoute>
    )
  }

  const isTerminal = shipment.status === "delivered" || shipment.status === "cancelled"
  const totalPicked = shipment.items.reduce((s, i) => s + i.pickedQty, 0)
  const totalToPick = shipment.items.reduce((s, i) => s + i.quantity, 0)
  const totalPacked = shipment.items.reduce((s, i) => s + i.packedQty, 0)
  const pickProgress = totalToPick > 0 ? (totalPicked / totalToPick) * 100 : 0
  const packProgress = totalPicked > 0 ? (totalPacked / totalPicked) * 100 : 0

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in-0 slide-in-from-left-4 duration-300">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/shipments")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight font-mono">
                  {shipment.shipmentNumber}
                </h1>
                <Truck className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("shipmentDetail.order")} {shipment.orderNumber}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-sm px-3 py-1 ${STATUS_COLORS[shipment.status]} transition-all duration-300`}
          >
            {t("shipments.statusLabels." + shipment.status)}
          </Badge>
        </div>

        {/* Stepper */}
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300 delay-100 fill-mode-both">
          <ShipmentStepper current={shipment.status} />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive animate-in fade-in-0 duration-200">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 underline text-sm">{t("shipmentDetail.dismiss")}</button>
          </div>
        )}

        {/* Actions */}
        {!isTerminal && (
          <div className="flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-150 fill-mode-both">
            {(shipment.status === "pending" || shipment.status === "picking") && (
              <Button onClick={handlePickAll} disabled={!!actionLoading}>
                {actionLoading === "pick" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Package className="mr-2 h-4 w-4" />
                )}
                {t("shipmentDetail.pickAllItems")}
              </Button>
            )}
            {(shipment.status === "picked" || shipment.status === "packing") && (
              <Button onClick={handlePackAll} disabled={!!actionLoading}>
                {actionLoading === "pack" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="mr-2 h-4 w-4" />
                )}
                {t("shipmentDetail.packAllItems")}
              </Button>
            )}
            {shipment.status === "packed" && !showShipForm && (
              <Button onClick={() => setShowShipForm(true)} disabled={!!actionLoading}>
                <Send className="mr-2 h-4 w-4" />
                {t("shipmentDetail.ship")}
              </Button>
            )}
            {shipment.status === "shipped" && (
              <Button onClick={() => handleStatusChange("delivered")} disabled={!!actionLoading}>
                {actionLoading === "delivered" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {t("shipmentDetail.markDelivered")}
              </Button>
            )}
            {!["shipped", "delivered"].includes(shipment.status) && (
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
                {t("shipmentDetail.cancel")}
              </Button>
            )}
          </div>
        )}

        {/* Ship form */}
        {showShipForm && (
          <Card className="animate-in fade-in-0 zoom-in-95 duration-200">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">{t("shipmentDetail.shippingDetails")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("shipmentDetail.carrierLabel")}</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder={t("shipmentDetail.carrierPlaceholder")}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("shipmentDetail.trackingNumber")}</label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder={t("shipmentDetail.trackingPlaceholder")}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleStatusChange("shipped")} disabled={!!actionLoading}>
                  {actionLoading === "shipped" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Truck className="mr-2 h-4 w-4" />
                  )}
                  {t("shipmentDetail.confirmShip")}
                </Button>
                <Button variant="outline" onClick={() => setShowShipForm(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress cards */}
        <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-200 fill-mode-both">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("shipmentDetail.pickProgress")}</p>
              <p className="mt-1 text-2xl font-bold">{totalPicked} / {totalToPick}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${pickProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("shipmentDetail.packProgress")}</p>
              <p className="mt-1 text-2xl font-bold">{totalPacked} / {totalPicked}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                  style={{ width: `${packProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("shipmentDetail.shipping")}</p>
              {shipment.carrier ? (
                <>
                  <p className="mt-1 text-lg font-bold">{shipment.carrier}</p>
                  {shipment.trackingNumber && (
                    <p className="text-sm text-muted-foreground font-mono">{shipment.trackingNumber}</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-lg text-muted-foreground">{t("shipmentDetail.notShippedYet")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Items table */}
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-250 fill-mode-both">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">{t("shipmentDetail.shipmentItems")}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shipmentDetail.product")}</TableHead>
                <TableHead>{t("shipmentDetail.location")}</TableHead>
                <TableHead className="text-right">{t("shipmentDetail.qty")}</TableHead>
                <TableHead className="text-right">{t("shipmentDetail.picked")}</TableHead>
                <TableHead className="text-right">{t("shipmentDetail.packed")}</TableHead>
                <TableHead>{t("shipmentDetail.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipment.items.map((item, idx) => {
                const picked = item.pickedQty >= item.quantity
                const packed = item.packedQty >= item.pickedQty && item.pickedQty > 0
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.typeName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {item.locationCode || "—"}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      <span className={picked ? "text-green-600 font-medium" : item.pickedQty > 0 ? "text-amber-600" : "text-muted-foreground"}>
                        {item.pickedQty}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={packed ? "text-green-600 font-medium" : item.packedQty > 0 ? "text-amber-600" : "text-muted-foreground"}>
                        {item.packedQty}
                      </span>
                    </TableCell>
                    <TableCell>
                      {packed ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t("shipmentDetail.statusPacked")}</Badge>
                      ) : picked ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{t("shipmentDetail.statusPicked")}</Badge>
                      ) : item.pickedQty > 0 ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t("shipmentDetail.statusPartial")}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">{t("shipmentDetail.statusPending")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>

        {/* Packing slip */}
        {["packed", "shipped", "delivered"].includes(shipment.status) && (
          <div className="animate-in fade-in-0 duration-200 delay-300 fill-mode-both">
            {packingSlip ? (
              <PackingSlipView slip={packingSlip} />
            ) : (
              <Button variant="outline" onClick={loadPackingSlip}>
                <Printer className="mr-2 h-4 w-4" />
                {t("shipmentDetail.viewPackingSlip")}
              </Button>
            )}
          </div>
        )}

        {/* Audit trail */}
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-300 fill-mode-both">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">{t("shipmentDetail.auditTrail")}</h2>
          </div>
          <CardContent className="pt-4">
            {shipment.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("shipmentDetail.noAuditEntries")}</p>
            ) : (
              <div className="relative space-y-0">
                {shipment.audit.map((entry, idx) => (
                  <div key={idx} className="flex gap-4 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {idx < shipment.audit.length - 1 && <div className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-sm font-medium capitalize">
                        {entry.action.replace(/_/g, " ")}
                        {entry.fromStatus && entry.toStatus && (
                          <span className="font-normal text-muted-foreground">
                            {" "}&mdash; {statusLabel(t, entry.fromStatus)}{" "}
                            &rarr; {statusLabel(t, entry.toStatus)}
                          </span>
                        )}
                      </p>
                      {entry.note && <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>}
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

        {/* Delete for pending/cancelled */}
        {(shipment.status === "pending" || shipment.status === "cancelled") && (
          <div className="flex justify-end animate-in fade-in-0 duration-200 delay-350 fill-mode-both">
            <Button variant="destructive" onClick={handleDelete} disabled={!!actionLoading}>
              {actionLoading === "delete" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackageX className="mr-2 h-4 w-4" />
              )}
              {t("shipmentDetail.deleteShipment")}
            </Button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
