"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ProtectedRoute } from "@/components/protected-route"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WarehouseFloorPlan, FloorPlanLegend } from "@/components/warehouse-floor-plan"
import {
  warehouseApi,
  locationApi,
  aiApi,
  Warehouse,
  Zone,
  ZoneType,
  WarehouseLocation,
  LocationInventoryItem,
  GeneratedZone,
  SmartPutawayResponse,
  ZONE_TYPE_COLORS,
} from "@/lib/api"
import {
  MapPinned,
  Plus,
  Trash2,
  Package,
  Layers,
  Box,
  ChevronRight,
  X,
  Warehouse as WarehouseIcon,
  Sparkles,
  Brain,
  Zap,
  MapPin,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import { InventoryCombobox } from "@/components/inventory-combobox"
import { AiLoadingSteps } from "@/components/ai-loading-steps"

const ZONE_TYPES: ZoneType[] = [
  "receiving",
  "storage",
  "shipping",
  "staging",
  "cold_storage",
  "returns",
]

interface ZoneFormData {
  name: string
  code: string
  type: ZoneType
  x: number
  y: number
  w: number
  h: number
  aisles: number
  racksPerAisle: number
  capacityPerSlot: number
}

const defaultZoneForm: ZoneFormData = {
  name: "",
  code: "",
  type: "storage",
  x: 0,
  y: 0,
  w: 4,
  h: 3,
  aisles: 3,
  racksPerAisle: 4,
  capacityPerSlot: 100,
}

export default function LocationsPage() {
  const { t } = useTranslation()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [selectedLocation, setSelectedLocation] = useState<WarehouseLocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [zonesLoading, setZonesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialogs
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [zoneForm, setZoneForm] = useState<ZoneFormData>(defaultZoneForm)
  const [zoneFormError, setZoneFormError] = useState<string | null>(null)
  const [zoneSaving, setZoneSaving] = useState(false)

  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false)
  const [invItems, setInvItems] = useState<LocationInventoryItem[]>([])
  const [invSaving, setInvSaving] = useState(false)

  // AI features
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiTab, setAiTab] = useState<"putaway" | "layout">("layout")

  // Smart Putaway
  const [putawayTypeName, setPutawayTypeName] = useState("")
  const [putawayCount, setPutawayCount] = useState(1)
  const [putawayResult, setPutawayResult] = useState<SmartPutawayResponse | null>(null)
  const [putawayLoading, setPutawayLoading] = useState(false)

  // Ergonomic Layout
  const [layoutCols, setLayoutCols] = useState(20)
  const [layoutRows, setLayoutRows] = useState(14)
  const [layoutPreferences, setLayoutPreferences] = useState("")
  const [generatedZones, setGeneratedZones] = useState<GeneratedZone[]>([])
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [applyingLayout, setApplyingLayout] = useState(false)
  const [layoutGenerated, setLayoutGenerated] = useState(false)

  // Load warehouses
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await warehouseApi.getAll()
        setWarehouses(res.warehouses)
        if (res.warehouses.length > 0) {
          setSelectedWarehouseId(res.warehouses[0].id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("locations.failedToLoadWarehouses"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  // Load zones when warehouse changes
  const loadZones = useCallback(async () => {
    if (!selectedWarehouseId) return
    try {
      setZonesLoading(true)
      const res = await locationApi.getZones(selectedWarehouseId)
      setZones(res.zones)
      setSelectedZone(null)
      setLocations([])
      setSelectedLocation(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.failedToLoadZones"))
    } finally {
      setZonesLoading(false)
    }
  }, [selectedWarehouseId, t])

  useEffect(() => {
    loadZones()
  }, [loadZones])

  // Load locations when zone selected
  const loadLocations = useCallback(async (zoneId: string) => {
    try {
      const res = await locationApi.getZone(zoneId)
      setLocations(res.locations)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.failedToLoadLocations"))
    }
  }, [t])

  useEffect(() => {
    if (selectedZone) {
      loadLocations(selectedZone.id)
    } else {
      setLocations([])
    }
    setSelectedLocation(null)
  }, [selectedZone, loadLocations])

  // Floor plan cell click
  const handleCellClick = (col: number, row: number, zoneId: string | null) => {
    if (zoneId) {
      const zone = zones.find((z) => z.id === zoneId)
      setSelectedZone(zone ?? null)
    } else {
      setZoneForm({ ...defaultZoneForm, x: col, y: row })
      setZoneFormError(null)
      setZoneDialogOpen(true)
    }
  }

  // Create zone
  const handleCreateZone = async () => {
    if (!selectedWarehouseId) return
    if (!zoneForm.name.trim() || !zoneForm.code.trim()) {
      setZoneFormError(t("locations.nameCodeRequired"))
      return
    }
    try {
      setZoneSaving(true)
      setZoneFormError(null)
      await locationApi.createZone({ ...zoneForm, warehouseId: selectedWarehouseId })
      setZoneDialogOpen(false)
      setZoneForm(defaultZoneForm)
      await loadZones()
    } catch (e) {
      setZoneFormError(e instanceof Error ? e.message : t("locations.failedToCreateZone"))
    } finally {
      setZoneSaving(false)
    }
  }

  // Delete zone
  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm(t("locations.deleteZoneConfirm"))) return
    try {
      await locationApi.deleteZone(zoneId)
      if (selectedZone?.id === zoneId) {
        setSelectedZone(null)
        setLocations([])
      }
      await loadZones()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.failedToDeleteZone"))
    }
  }

  // Inventory management
  const openInventoryDialog = (loc: WarehouseLocation) => {
    setSelectedLocation(loc)
    setInvItems(loc.inventory.length > 0 ? [...loc.inventory] : [{ typeName: "", count: 0 }])
    setInventoryDialogOpen(true)
  }

  const handleSaveInventory = async () => {
    if (!selectedLocation) return
    try {
      setInvSaving(true)
      const cleaned = invItems.filter((i) => i.typeName.trim() && i.count > 0)
      await locationApi.updateLocationInventory(selectedLocation.id, cleaned)
      setInventoryDialogOpen(false)
      if (selectedZone) await loadLocations(selectedZone.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.failedToUpdateInventory"))
    } finally {
      setInvSaving(false)
    }
  }

  // Smart Putaway handler
  const handleSmartPutaway = async () => {
    if (!selectedWarehouseId || !putawayTypeName.trim()) return
    try {
      setPutawayLoading(true)
      setPutawayResult(null)
      const res = await aiApi.getSmartPutaway(selectedWarehouseId, {
        typeName: putawayTypeName.trim(),
        count: putawayCount,
      })
      setPutawayResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.putawayFailed"))
    } finally {
      setPutawayLoading(false)
    }
  }

  // Generate Layout handler
  const handleGenerateLayout = async () => {
    if (!selectedWarehouseId) return
    try {
      setLayoutLoading(true)
      setGeneratedZones([])
      setLayoutGenerated(false)
      const res = await aiApi.generateLayout(selectedWarehouseId, {
        gridCols: layoutCols,
        gridRows: layoutRows,
        preferences: layoutPreferences || undefined,
      })
      setGeneratedZones(res.zones)
      setLayoutGenerated(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.generateLayoutFailed"))
    } finally {
      setLayoutLoading(false)
    }
  }

  // Apply Layout handler
  const handleApplyLayout = async () => {
    if (!selectedWarehouseId || generatedZones.length === 0) return
    if (!confirm(t("locations.applyLayoutConfirm"))) return
    try {
      setApplyingLayout(true)
      await aiApi.applyLayout(selectedWarehouseId, {
        zones: generatedZones,
        clearExisting: true,
      })
      setGeneratedZones([])
      setLayoutGenerated(false)
      setAiPanelOpen(false)
      await loadZones()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locations.applyLayoutFailed"))
    } finally {
      setApplyingLayout(false)
    }
  }

  // Utilization stats
  const totalCapacity = locations.reduce((s, l) => s + l.maxCapacity, 0)
  const totalUsed = locations.reduce((s, l) => s + l.currentUtilization, 0)
  const utilizationPct = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="text-muted-foreground">{t("common.loading")}</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("locations.title")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("locations.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={aiPanelOpen ? "default" : "outline"}
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className={aiPanelOpen ? "" : "bg-gradient-to-r from-violet-500/10 to-blue-500/10 border-violet-500/30 hover:border-violet-500/50"}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("locations.aiFeatures")}
            </Button>
            <Button onClick={() => { setZoneForm(defaultZoneForm); setZoneFormError(null); setZoneDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              {t("locations.addZone")}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Warehouse selector */}
        {warehouses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <WarehouseIcon className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t("locations.noWarehousesYet")}</h3>
              <p className="mt-2 text-muted-foreground">{t("locations.createWarehouseFirst")}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2">
              <Label className="text-sm font-medium">{t("locations.warehouseLabel")}</Label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {zonesLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              )}
            </div>

            {/* AI Features Panel */}
            {aiPanelOpen && (
              <Card className="mb-6 border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {t("locations.aiFeatures")}
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setAiPanelOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant={aiTab === "layout" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAiTab("layout")}
                    >
                      <Brain className="mr-1.5 h-3.5 w-3.5" />
                      {t("locations.generateLayout")}
                    </Button>
                    <Button
                      variant={aiTab === "putaway" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAiTab("putaway")}
                    >
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      {t("locations.smartPutaway")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {aiTab === "layout" ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">{t("locations.generateLayoutDesc")}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("locations.gridColumns")}</Label>
                          <Input
                            type="number"
                            min={10}
                            max={40}
                            value={layoutCols}
                            onChange={(e) => setLayoutCols(parseInt(e.target.value) || 20)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("locations.gridRowsLabel")}</Label>
                          <Input
                            type="number"
                            min={8}
                            max={30}
                            value={layoutRows}
                            onChange={(e) => setLayoutRows(parseInt(e.target.value) || 14)}
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">{t("locations.preferences")}</Label>
                          <Input
                            value={layoutPreferences}
                            onChange={(e) => setLayoutPreferences(e.target.value)}
                            placeholder={t("locations.preferencesPlaceholder")}
                          />
                        </div>
                      </div>
                      <Button onClick={handleGenerateLayout} disabled={layoutLoading}>
                        {layoutLoading ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("locations.generating")}</>
                        ) : (
                          <><Sparkles className="mr-2 h-4 w-4" />{t("locations.generateErgonomicPlan")}</>
                        )}
                      </Button>

                      {layoutLoading && (
                        <AiLoadingSteps
                          steps={[
                            "locations.generatingStep1",
                            "locations.generatingStep2",
                            "locations.generatingStep3",
                            "locations.generatingStep4",
                            "locations.generatingStep5",
                          ]}
                          intervalMs={4000}
                        />
                      )}

                      {layoutGenerated && generatedZones.length > 0 && (
                        <div className="space-y-3 mt-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              {t("locations.generatedPlan")} ({generatedZones.length} {t("locations.zonesLabel")})
                            </h4>
                            <Button size="sm" onClick={handleApplyLayout} disabled={applyingLayout}>
                              {applyingLayout ? (
                                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{t("locations.applying")}</>
                              ) : (
                                <>{t("locations.applyLayout")}</>
                              )}
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {generatedZones.map((z, i) => (
                              <div key={i} className="rounded-lg border p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: z.color }} />
                                  <span className="font-medium text-sm">{z.name}</span>
                                  <Badge variant="secondary" className="text-[10px] ml-auto">{z.code}</Badge>
                                </div>
                                <div className="flex gap-2 text-[10px] text-muted-foreground">
                                  <span>{t("zoneTypes." + z.type)}</span>
                                  <span>({z.x},{z.y}) {z.w}×{z.h}</span>
                                  <span>{z.aisles}×{z.racksPerAisle} = {z.aisles * z.racksPerAisle} loc</span>
                                </div>
                                {z.rationale && (
                                  <p className="text-[10px] text-muted-foreground italic">{z.rationale}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Preview floor plan */}
                          <div className="rounded-lg border p-3">
                            <h5 className="text-xs font-medium mb-2">{t("locations.layoutPreview")}</h5>
                            <div className="overflow-auto">
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: `repeat(${layoutCols}, 20px)`,
                                  gridTemplateRows: `repeat(${layoutRows}, 20px)`,
                                  gap: "1px",
                                  width: "fit-content",
                                }}
                              >
                                {Array.from({ length: layoutRows * layoutCols }).map((_, idx) => {
                                  const col = idx % layoutCols
                                  const row = Math.floor(idx / layoutCols)
                                  const zone = generatedZones.find(
                                    z => col >= z.x && col < z.x + z.w && row >= z.y && row < z.y + z.h
                                  )
                                  return (
                                    <div
                                      key={idx}
                                      className="rounded-sm"
                                      style={{
                                        width: 20,
                                        height: 20,
                                        backgroundColor: zone ? zone.color + "99" : "var(--muted)",
                                        border: zone ? `1px solid ${zone.color}` : "1px solid transparent",
                                      }}
                                      title={zone ? `${zone.name} (${zone.code})` : `(${col},${row})`}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">{t("locations.smartPutawayDesc")}</p>
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">{t("locations.productType")}</Label>
                          <InventoryCombobox
                            value={putawayTypeName}
                            onValueChange={setPutawayTypeName}
                            placeholder={t("locations.selectItem")}
                            className="w-full h-10"
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs">{t("locations.countLabel")}</Label>
                          <Input
                            type="number"
                            min={1}
                            value={putawayCount}
                            onChange={(e) => setPutawayCount(parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <Button onClick={handleSmartPutaway} disabled={putawayLoading || !putawayTypeName.trim()}>
                          {putawayLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>{t("locations.findBestLocation")}</>
                          )}
                        </Button>
                      </div>

                      {putawayResult && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-sm">
                            <Badge variant={putawayResult.isFastMover ? "default" : "secondary"}>
                              {putawayResult.isFastMover ? t("locations.fastMover") : t("locations.normalMover")}
                            </Badge>
                            <span className="text-muted-foreground">
                              {t("locations.turnover90d")}: {putawayResult.turnover90d.toLocaleString()}
                            </span>
                          </div>

                          {putawayResult.topAffinities.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">{t("locations.frequentlyPickedWith")}:</span>{" "}
                              {putawayResult.topAffinities.map(a => a.typeName).join(", ")}
                            </div>
                          )}

                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">{t("locations.recommendedLocations")}</h4>
                            {putawayResult.recommendations.map((rec, i) => (
                              <div key={rec.locationId} className={`flex items-center gap-3 rounded-lg border p-3 ${i === 0 ? "border-primary/40 bg-primary/5" : ""}`}>
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                  #{i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-medium">{rec.locationCode}</span>
                                    <Badge variant="outline" className="text-[10px]">{rec.zoneName}</Badge>
                                    <span className="text-[10px] text-muted-foreground">{rec.zoneType}</span>
                                  </div>
                                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                                    <span>{t("locations.available")}: {rec.availableSpace}/{rec.maxCapacity}</span>
                                    <span>{t("locations.score")}: {rec.score}</span>
                                  </div>
                                  {rec.reasons.length > 0 && (
                                    <div className="flex gap-1.5 mt-1 flex-wrap">
                                      {rec.reasons.map((r, ri) => (
                                        <span key={ri} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{r}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {putawayResult.recommendations.length === 0 && (
                              <p className="text-sm text-muted-foreground">{t("locations.noLocationsAvailable")}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              {/* Left: Floor plan + legend */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Layers className="h-4 w-4" />
                      {t("locations.floorPlan")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FloorPlanLegend />
                    <div className="mt-4 pl-4 pt-4">
                      <WarehouseFloorPlan
                        zones={zones}
                        selectedZoneId={selectedZone?.id ?? null}
                        onCellClick={handleCellClick}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Zone summary cards */}
                {zones.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {zones.map((z) => (
                      <Card
                        key={z.id}
                        className={`cursor-pointer transition-shadow hover:shadow-md ${selectedZone?.id === z.id ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setSelectedZone(z)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: z.color }} />
                              <span className="font-medium text-sm">{z.name}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">{z.code}</Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{t("zoneTypes." + z.type)}</span>
                            <span>{t("locations.locations_count", { count: z.locationCount ?? 0 })}</span>
                            <span>{t("locations.items_count", { count: z.totalItems ?? 0 })}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Zone detail panel */}
              <div className="space-y-4">
                {selectedZone ? (
                  <>
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedZone.color }} />
                            {selectedZone.name}
                          </CardTitle>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteZone(selectedZone.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("locations.type")}</span>
                            <Badge variant="outline">{t("zoneTypes." + selectedZone.type)}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("locations.code")}</span>
                            <span className="font-mono text-xs">{selectedZone.code}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("locations.gridPosition")}</span>
                            <span className="font-mono text-xs">({selectedZone.x}, {selectedZone.y}) {selectedZone.w}×{selectedZone.h}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("locations.layout")}</span>
                            <span>
                              {t("locations.aislesRacks", {
                                aisles: selectedZone.aisles,
                                racks: selectedZone.racksPerAisle,
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("locations.locationsLabel")}</span>
                            <span>{locations.length}</span>
                          </div>
                          {locations.length > 0 && (
                            <>
                              <div className="pt-2">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">{t("locations.utilization")}</span>
                                  <span>{utilizationPct}%</span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${utilizationPct}%`,
                                      backgroundColor:
                                        utilizationPct > 90 ? "#ef4444" :
                                        utilizationPct > 70 ? "#f97316" :
                                        utilizationPct > 40 ? "#eab308" : "#22c55e",
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{t("locations.itemsUsage", { used: totalUsed, total: totalCapacity })}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Locations table */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Box className="h-4 w-4" />
                          {t("locations.locationsLabel")} ({locations.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {locations.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">{t("locations.noLocations")}</div>
                        ) : (
                          <div className="max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">{t("locations.codeHeader")}</TableHead>
                                  <TableHead className="text-xs text-right">{t("locations.used")}</TableHead>
                                  <TableHead className="text-xs text-right">{t("locations.cap")}</TableHead>
                                  <TableHead className="text-xs w-[80px]">{t("locations.util")}</TableHead>
                                  <TableHead className="text-xs w-8" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {locations.map((loc) => (
                                  <TableRow key={loc.id} className="text-xs">
                                    <TableCell className="font-mono py-2">{loc.code}</TableCell>
                                    <TableCell className="text-right py-2">{loc.currentUtilization}</TableCell>
                                    <TableCell className="text-right py-2">{loc.maxCapacity}</TableCell>
                                    <TableCell className="py-2">
                                      <div className="flex items-center gap-1.5">
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                          <div
                                            className="h-full rounded-full"
                                            style={{
                                              width: `${loc.utilizationPercent}%`,
                                              backgroundColor:
                                                loc.utilizationPercent > 90 ? "#ef4444" :
                                                loc.utilizationPercent > 70 ? "#f97316" :
                                                loc.utilizationPercent > 40 ? "#eab308" : "#22c55e",
                                            }}
                                          />
                                        </div>
                                        <span className="w-8 text-right text-muted-foreground">{loc.utilizationPercent}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                      <button
                                        type="button"
                                        onClick={() => openInventoryDialog(loc)}
                                        className="rounded p-1 hover:bg-accent"
                                        title={t("locations.manageInventory")}
                                      >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      </button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                      <MapPinned className="h-10 w-10 text-muted-foreground" />
                      <h3 className="mt-3 text-sm font-semibold">
                        {zones.length === 0 ? t("locations.noZonesYet") : t("locations.selectZone")}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {zones.length === 0
                          ? t("locations.noZonesHint")
                          : t("locations.selectZoneHint")}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}

        {/* Create Zone Dialog */}
        <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("locations.createZone")}</DialogTitle>
              <DialogDescription>
                {t("locations.createZoneDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {zoneFormError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                  {zoneFormError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("locations.zoneName")}</Label>
                  <Input
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("locations.zoneNamePlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("locations.codeShort")}</Label>
                  <Input
                    value={zoneForm.code}
                    onChange={(e) => setZoneForm((f) => ({ ...f, code: e.target.value.toUpperCase().slice(0, 6) }))}
                    placeholder={t("locations.codePlaceholder")}
                    maxLength={6}
                    className="font-mono uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("locations.zoneType")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ZONE_TYPES.map((zt) => (
                    <button
                      key={zt}
                      type="button"
                      onClick={() => setZoneForm((f) => ({ ...f, type: zt }))}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        zoneForm.type === zt
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: ZONE_TYPE_COLORS[zt] }} />
                        {t("zoneTypes." + zt)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("locations.gridPositionSize")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.xCol")}</span>
                    <Input
                      type="number"
                      min={0}
                      value={zoneForm.x}
                      onChange={(e) => setZoneForm((f) => ({ ...f, x: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.yRow")}</span>
                    <Input
                      type="number"
                      min={0}
                      value={zoneForm.y}
                      onChange={(e) => setZoneForm((f) => ({ ...f, y: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.width")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={zoneForm.w}
                      onChange={(e) => setZoneForm((f) => ({ ...f, w: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.height")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      value={zoneForm.h}
                      onChange={(e) => setZoneForm((f) => ({ ...f, h: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("locations.storageLayout")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.aisles")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={zoneForm.aisles}
                      onChange={(e) => setZoneForm((f) => ({ ...f, aisles: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.racksPerAisle")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={zoneForm.racksPerAisle}
                      onChange={(e) => setZoneForm((f) => ({ ...f, racksPerAisle: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{t("locations.capPerSlot")}</span>
                    <Input
                      type="number"
                      min={1}
                      value={zoneForm.capacityPerSlot}
                      onChange={(e) => setZoneForm((f) => ({ ...f, capacityPerSlot: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("locations.willCreateLocations", {
                    count: zoneForm.aisles * zoneForm.racksPerAisle,
                  })}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>{t("locations.cancel")}</Button>
              <Button onClick={handleCreateZone} disabled={zoneSaving}>
                {zoneSaving ? t("locations.creating") : t("locations.createZone")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Inventory Dialog */}
        <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                {t("locations.inventoryTitle", { code: selectedLocation?.code ?? "" })}
              </DialogTitle>
              <DialogDescription>
                {t("locations.inventoryDesc", { capacity: selectedLocation?.maxCapacity ?? 0 })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {invItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    {idx === 0 && <Label className="text-xs">{t("locations.itemName")}</Label>}
                    <InventoryCombobox
                      value={item.typeName}
                      onValueChange={(v) => {
                        const next = [...invItems]
                        next[idx] = { ...next[idx], typeName: v }
                        setInvItems(next)
                      }}
                      placeholder={t("locations.selectItem")}
                      className="w-full h-10"
                    />
                  </div>
                  <div className="w-20">
                    {idx === 0 && <Label className="text-xs">{t("locations.countLabel")}</Label>}
                    <Input
                      type="number"
                      min={0}
                      value={item.count}
                      onChange={(e) => {
                        const next = [...invItems]
                        next[idx] = { ...next[idx], count: parseInt(e.target.value) || 0 }
                        setInvItems(next)
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInvItems(invItems.filter((_, i) => i !== idx))}
                    disabled={invItems.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setInvItems([...invItems, { typeName: "", count: 0 }])}
              >
                <Plus className="mr-2 h-3 w-3" />
                {t("locations.addItem")}
              </Button>
              {(() => {
                const invTotal = invItems.reduce((s, i) => s + (i.count || 0), 0)
                const cap = selectedLocation?.maxCapacity ?? 0
                const over = invTotal > cap
                return (
                  <p className={`text-xs ${over ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {t("locations.totalCapacity", { total: invTotal, cap })}
                    {over ? ` ${t("locations.exceedsCapacity")}` : ""}
                  </p>
                )
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>{t("locations.cancel")}</Button>
              <Button onClick={handleSaveInventory} disabled={invSaving}>
                {invSaving ? t("locations.saving") : t("locations.saveInventory")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  )
}
