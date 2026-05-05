"use client"

import { useEffect, useState, useCallback } from "react"
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
  pickingApi,
  shipmentApi,
  PickListData,
  PickListStatus,
  Shipment,
  ShipmentStatus,
} from "@/lib/api"
import {
  ClipboardCheck,
  Filter,
  Loader2,
  CheckCircle2,
  XCircle,
  Layers,
  PackageSearch,
  MapPin,
} from "lucide-react"

const PL_STATUS_COLORS: Record<PickListStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
}

const PICK_LIST_STATUSES: PickListStatus[] = ["pending", "in_progress", "completed", "cancelled"]

export default function PickingPage() {
  const { t } = useTranslation()
  const [pickLists, setPickLists] = useState<PickListData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<PickListStatus | "">("")
  const [page, setPage] = useState(1)
  const limit = 20

  const [pendingShipments, setPendingShipments] = useState<Shipment[]>([])
  const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set())
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null)

  const [expandedPL, setExpandedPL] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<PickListData | null>(null)

  const loadPickLists = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params: Record<string, unknown> = { page, limit }
      if (filterStatus) params.status = filterStatus
      const res = await pickingApi.getAll(params as any)
      setPickLists(res.pickLists)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToLoad"))
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, t])

  useEffect(() => { loadPickLists() }, [loadPickLists])

  async function loadPendingShipments() {
    try {
      setShipmentsLoading(true)
      const [pending, picking] = await Promise.all([
        shipmentApi.getAll({ status: "pending" as ShipmentStatus, limit: 50 }),
        shipmentApi.getAll({ status: "picking" as ShipmentStatus, limit: 50 }),
      ])
      setPendingShipments([...pending.shipments, ...picking.shipments])
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToLoadShipments"))
    } finally {
      setShipmentsLoading(false)
    }
  }

  function toggleShipment(id: string) {
    setSelectedShipments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreatePickList() {
    if (selectedShipments.size === 0) return
    try {
      setCreateLoading(true)
      setError(null)
      await pickingApi.create(Array.from(selectedShipments))
      setSelectedShipments(new Set())
      setPendingShipments([])
      await loadPickLists()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToCreate"))
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleExpandPL(pl: PickListData) {
    if (expandedPL === pl.id) {
      setExpandedPL(null)
      setExpandedData(null)
      return
    }
    try {
      const res = await pickingApi.getOne(pl.id)
      setExpandedData(res.pickList)
      setExpandedPL(pl.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToLoadDetails"))
    }
  }

  async function handleConfirmAll(pl: PickListData) {
    try {
      setConfirmLoading(pl.id)
      setError(null)
      const picks = pl.items.map((i) => ({
        typeName: i.typeName,
        orderNumber: i.orderNumber,
        pickedQty: i.quantity,
      }))
      await pickingApi.confirm(pl.id, picks)
      await loadPickLists()
      setExpandedPL(null)
      setExpandedData(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToConfirm"))
    } finally {
      setConfirmLoading(null)
    }
  }

  async function handleCancelPL(plId: string) {
    try {
      setConfirmLoading(plId)
      await pickingApi.cancel(plId)
      await loadPickLists()
      if (expandedPL === plId) {
        setExpandedPL(null)
        setExpandedData(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("picking.failedToCancel"))
    } finally {
      setConfirmLoading(null)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
            <h1 className="text-3xl font-bold tracking-tight">{t("picking.title")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("picking.subtitle")}
            </p>
          </div>
          <Button
            onClick={loadPendingShipments}
            disabled={shipmentsLoading}
            className="animate-in fade-in-0 slide-in-from-right-4 duration-300"
          >
            {shipmentsLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Layers className="mr-2 h-4 w-4" />
            )}
            {t("picking.newPickList")}
          </Button>
        </div>

        {/* Wave pick builder */}
        {pendingShipments.length > 0 && (
          <Card className="mb-6 animate-in fade-in-0 zoom-in-95 duration-300">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold">
                {t("picking.createPickList")}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {t("picking.selectShipments")}
                </span>
              </h2>
            </div>
            <CardContent className="pt-4">
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingShipments.map((sh) => (
                  <label
                    key={sh.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all duration-200 ${
                      selectedShipments.has(sh.id)
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedShipments.has(sh.id)}
                      onChange={() => toggleShipment(sh.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{sh.shipmentNumber}</span>
                        <span className="text-xs text-muted-foreground">({sh.orderNumber})</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("picking.items", { count: sh.items.length })} &middot;{" "}
                        {t("picking.units", {
                          count: sh.items.reduce((s, i) => s + i.quantity, 0),
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-xs">
                      {sh.status}
                    </Badge>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  onClick={handleCreatePickList}
                  disabled={selectedShipments.size === 0 || createLoading}
                >
                  {createLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                  )}
                  {selectedShipments.size > 1
                    ? t("picking.createWavePickList")
                    : t("picking.createSinglePickList")}
                  {selectedShipments.size > 0 && ` (${selectedShipments.size})`}
                </Button>
                <Button variant="outline" onClick={() => { setPendingShipments([]); setSelectedShipments(new Set()) }}>
                  {t("picking.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-top-2 duration-300 fill-mode-both delay-100">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as PickListStatus | ""); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("picking.allStatuses")}</option>
            {PICK_LIST_STATUSES.map((s) => (
              <option key={s} value={s}>{t("picking.statusLabels." + s)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive animate-in fade-in-0 duration-200">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 underline text-sm">{t("picking.dismiss")}</button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="text-muted-foreground">{t("picking.loadingPickLists")}</p>
            </div>
          </div>
        ) : pickLists.length === 0 ? (
          <Card className="animate-in fade-in-0 zoom-in-95 duration-300">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <PackageSearch className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t("picking.noPickListsYet")}</h3>
              <p className="mt-2 text-muted-foreground">
                {t("picking.noPickListsDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 fill-mode-both delay-150">
              {pickLists.map((pl) => (
                <Card
                  key={pl.id}
                  className={`transition-all duration-200 ${expandedPL === pl.id ? "ring-2 ring-primary/20" : ""}`}
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors duration-150"
                    onClick={() => handleExpandPL(pl)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{pl.pickListNumber}</span>
                          {pl.type === "wave" && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              {t("picking.wave")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("picking.items", { count: pl.items.length })} &middot;{" "}
                          {t("picking.shipments", { count: pl.shipmentIds.length })} &middot;{" "}
                          {new Date(pl.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${PL_STATUS_COLORS[pl.status]} transition-all duration-200`}
                      >
                        {t("picking.statusLabels." + pl.status)}
                      </Badge>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedPL === pl.id && expandedData && (
                    <div className="border-t animate-in fade-in-0 slide-in-from-top-2 duration-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("picking.order")}</TableHead>
                            <TableHead>{t("picking.product")}</TableHead>
                            <TableHead>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {t("picking.location")}
                              </div>
                            </TableHead>
                            <TableHead className="text-right">{t("picking.qty")}</TableHead>
                            <TableHead className="text-right">{t("picking.picked")}</TableHead>
                            <TableHead>{t("picking.status")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expandedData.items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm text-muted-foreground">{item.orderNumber}</TableCell>
                              <TableCell className="font-medium">{item.typeName}</TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground">
                                {item.locationCode || "—"}
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                <span className={
                                  item.pickedQty >= item.quantity
                                    ? "text-green-600 font-medium"
                                    : item.pickedQty > 0
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                                }>
                                  {item.pickedQty}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status === "picked"
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : item.status === "short"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-gray-100 text-gray-600 border-gray-200"
                                  }
                                >
                                  {item.status === "picked"
                                    ? t("picking.statusPicked")
                                    : item.status === "short"
                                    ? t("picking.statusShort")
                                    : t("picking.statusPending")}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {(pl.status === "pending" || pl.status === "in_progress") && (
                        <div className="flex gap-2 p-4 border-t">
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleConfirmAll(expandedData) }}
                            disabled={!!confirmLoading}
                          >
                            {confirmLoading === pl.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            {t("picking.confirmAllPicks")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleCancelPL(pl.id) }}
                            disabled={!!confirmLoading}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t("picking.cancel")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between animate-in fade-in-0 duration-200 delay-200">
                <p className="text-sm text-muted-foreground">
                  {t("picking.showing", {
                    from: (page - 1) * limit + 1,
                    to: Math.min(page * limit, total),
                    total,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t("picking.previous")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    {t("picking.next")}
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
