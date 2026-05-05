"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ProtectedRoute } from "@/components/protected-route"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  warehouseApi,
  aiApi,
  Warehouse,
  DemandForecastResponse,
  DemandForecastItem,
} from "@/lib/api"
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Sparkles,
  Package,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Activity,
} from "lucide-react"
import { AiLoadingSteps } from "@/components/ai-loading-steps"

const RISK_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
}

const RISK_BG = {
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
}

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("")
  const [forecast, setForecast] = useState<DemandForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forecastDays, setForecastDays] = useState(30)
  const [selectedProduct, setSelectedProduct] = useState<DemandForecastItem | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await warehouseApi.getAll()
        setWarehouses(res.warehouses)
        if (res.warehouses.length > 0) setSelectedWarehouseId(res.warehouses[0].id)
      } catch (e) {
        setError(e instanceof Error ? e.message : t("analytics.failedToLoadWarehouses"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  const loadForecast = useCallback(async () => {
    if (!selectedWarehouseId) return
    try {
      setForecastLoading(true)
      setError(null)
      const res = await aiApi.getDemandForecast(selectedWarehouseId, { days: forecastDays })
      setForecast(res)
      if (res.forecasts.length > 0 && !selectedProduct) {
        setSelectedProduct(res.forecasts[0])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("analytics.failedToLoadForecast"))
    } finally {
      setForecastLoading(false)
    }
  }, [selectedWarehouseId, forecastDays, t])

  useEffect(() => {
    if (selectedWarehouseId) loadForecast()
  }, [selectedWarehouseId, loadForecast])

  const riskSummary = useMemo(() => {
    if (!forecast) return { critical: 0, high: 0, medium: 0, low: 0 }
    return forecast.forecasts.reduce(
      (acc, f) => { acc[f.riskLevel]++; return acc },
      { critical: 0, high: 0, medium: 0, low: 0 }
    )
  }, [forecast])

  const chartData = useMemo(() => {
    if (!selectedProduct || !forecast) return []
    const histDates = forecast.historicalDates
    const fcDates = forecast.forecastDates
    const data: { date: string; label: string; demand?: number; supply?: number; forecastDemand?: number; forecastSupply?: number; ma7?: number }[] = []

    const recentHist = Math.min(30, histDates.length)
    const startIdx = histDates.length - recentHist

    for (let i = startIdx; i < histDates.length; i++) {
      data.push({
        date: histDates[i],
        label: new Date(histDates[i]).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        demand: selectedProduct.historicalDemand[i],
        supply: selectedProduct.historicalSupply[i],
        ma7: selectedProduct.movingAvgDemand[i],
      })
    }
    for (let i = 0; i < fcDates.length; i++) {
      data.push({
        date: fcDates[i],
        label: new Date(fcDates[i]).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        forecastDemand: selectedProduct.forecastedDemand[i],
        forecastSupply: selectedProduct.forecastedSupply[i],
      })
    }
    return data
  }, [selectedProduct, forecast])

  const chartConfig = {
    demand: { label: t("analytics.demand"), color: "#ef4444" },
    supply: { label: t("analytics.supply"), color: "#3b82f6" },
    forecastDemand: { label: t("analytics.forecastDemand"), color: "#f97316" },
    forecastSupply: { label: t("analytics.forecastSupply"), color: "#06b6d4" },
    ma7: { label: t("analytics.movingAvg7d"), color: "#8b5cf6" },
  }

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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              {t("analytics.title")}
            </h1>
            <p className="mt-1 text-muted-foreground">{t("analytics.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedWarehouseId}
              onChange={(e) => { setSelectedWarehouseId(e.target.value); setSelectedProduct(null) }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(parseInt(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={7}>{t("analytics.days7")}</option>
              <option value={14}>{t("analytics.days14")}</option>
              <option value={30}>{t("analytics.days30")}</option>
              <option value={60}>{t("analytics.days60")}</option>
              <option value={90}>{t("analytics.days90")}</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={loadForecast}
              disabled={forecastLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${forecastLoading ? "animate-spin" : ""}`} />
              {t("analytics.refresh")}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {warehouses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t("analytics.noWarehouses")}</h3>
              <p className="mt-2 text-muted-foreground">{t("analytics.createWarehouseFirst")}</p>
            </CardContent>
          </Card>
        ) : forecastLoading && !forecast ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <AiLoadingSteps
              steps={[
                "analytics.forecastStep1",
                "analytics.forecastStep2",
                "analytics.forecastStep3",
                "analytics.forecastStep4",
              ]}
              intervalMs={2500}
            />
          </div>
        ) : forecast ? (
          <>
            {/* Risk Summary Cards */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-500/10 p-2">
                      <ShieldAlert className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{riskSummary.critical}</p>
                      <p className="text-xs text-muted-foreground">{t("analytics.criticalRisk")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-orange-500/10 p-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{riskSummary.high}</p>
                      <p className="text-xs text-muted-foreground">{t("analytics.highRisk")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-500/10 p-2">
                      <ShieldCheck className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{riskSummary.low + riskSummary.medium}</p>
                      <p className="text-xs text-muted-foreground">{t("analytics.healthy")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{forecast.forecasts.length}</p>
                      <p className="text-xs text-muted-foreground">{t("analytics.productsTracked")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              {/* Left: Chart + forecast details */}
              <div className="space-y-6">
                {/* Demand Forecast Chart */}
                {selectedProduct && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          {t("analytics.demandForecast")}: {selectedProduct.typeName}
                        </CardTitle>
                        <Badge className={RISK_BG[selectedProduct.riskLevel]}>
                          {t(`analytics.risk_${selectedProduct.riskLevel}`)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={chartConfig} className="h-[320px] w-full">
                        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="fcDemandGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10 }}
                            interval="preserveStartEnd"
                            tickMargin={8}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickMargin={4} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ReferenceLine
                            x={chartData.find(d => d.forecastDemand !== undefined)?.label}
                            stroke="#888"
                            strokeDasharray="4 4"
                            label={{ value: t("analytics.forecastStart"), position: "top", fontSize: 10 }}
                          />
                          <Area type="monotone" dataKey="demand" stroke="#ef4444" fill="url(#demandGrad)" strokeWidth={2} dot={false} />
                          <Area type="monotone" dataKey="supply" stroke="#3b82f6" fill="url(#supplyGrad)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="ma7" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                          <Area type="monotone" dataKey="forecastDemand" stroke="#f97316" fill="url(#fcDemandGrad)" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                          <Line type="monotone" dataKey="forecastSupply" stroke="#06b6d4" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                        </AreaChart>
                      </ChartContainer>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-red-500" />{t("analytics.demand")}</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-blue-500" />{t("analytics.supply")}</span>
                        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-violet-500" />{t("analytics.movingAvg7d")}</span>
                        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-orange-500" />{t("analytics.forecastDemand")}</span>
                        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-cyan-500" />{t("analytics.forecastSupply")}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Product Detail */}
                {selectedProduct && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {t("analytics.productInsights")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{t("analytics.currentStock")}</p>
                          <p className="text-xl font-bold">{selectedProduct.currentStock.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{t("analytics.avgDailyDemand")}</p>
                          <p className="text-xl font-bold flex items-center gap-1">
                            {selectedProduct.avgDailyDemand.toFixed(1)}
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{t("analytics.avgDailySupply")}</p>
                          <p className="text-xl font-bold flex items-center gap-1">
                            {selectedProduct.avgDailySupply.toFixed(1)}
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{t("analytics.stockoutIn")}</p>
                          <p className="text-xl font-bold flex items-center gap-1">
                            {selectedProduct.daysUntilStockout != null ? (
                              <>
                                <Clock className="h-4 w-4 text-orange-500" />
                                {selectedProduct.daysUntilStockout}d
                              </>
                            ) : (
                              <span className="text-green-500">—</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-3">
                        <p className="text-sm font-medium">{t("analytics.aiRecommendation")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{selectedProduct.recommendation}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Product list */}
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("analytics.productRiskTable")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {forecast.forecasts.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      {t("analytics.noFlowData")}
                    </div>
                  ) : (
                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">{t("analytics.product")}</TableHead>
                            <TableHead className="text-xs text-right">{t("analytics.stock")}</TableHead>
                            <TableHead className="text-xs text-center">{t("analytics.risk")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {forecast.forecasts.map((f) => (
                            <TableRow
                              key={f.typeName}
                              className={`cursor-pointer text-xs transition-colors ${selectedProduct?.typeName === f.typeName ? "bg-accent" : "hover:bg-muted/50"}`}
                              onClick={() => setSelectedProduct(f)}
                            >
                              <TableCell className="py-2 font-medium max-w-[140px] truncate" title={f.typeName}>
                                {f.typeName}
                              </TableCell>
                              <TableCell className="py-2 text-right tabular-nums">
                                {f.currentStock.toLocaleString()}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Badge variant="outline" className={`text-[10px] ${RISK_BG[f.riskLevel]}`}>
                                  {t(`analytics.risk_${f.riskLevel}`)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </ProtectedRoute>
  )
}
