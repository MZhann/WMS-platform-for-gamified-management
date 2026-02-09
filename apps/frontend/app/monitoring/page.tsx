"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { ProtectedRoute } from "@/components/protected-route";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  warehouseApi,
  Warehouse,
  WarehouseAnalyticsResponse,
  AiAdviceResponse,
} from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
} from "lucide-react";

const PIE_COLORS = [
  "hsl(220, 70%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 65%, 60%)",
  "hsl(340, 75%, 55%)",
  "hsl(200, 70%, 45%)",
  "hsl(50, 80%, 50%)",
  "hsl(260, 60%, 55%)",
];

const valueChartConfig = {
  incomingValue: {
    label: "Value loaded",
    color: "hsl(220, 70%, 50%)",
  },
  outgoingValue: {
    label: "Value unloaded",
    color: "hsl(0, 84%, 60%)",
  },
} satisfies ChartConfig;

const quantityChartConfig = {
  incomingCount: {
    label: "Incoming",
    color: "hsl(30, 80%, 55%)",
  },
  outgoingCount: {
    label: "Outgoing",
    color: "hsl(280, 65%, 60%)",
  },
} satisfies ChartConfig;

const flowByTypeChartConfig = {
  loaded: {
    label: "Loaded",
    color: "hsl(142, 76%, 36%)",
  },
  unloaded: {
    label: "Unloaded",
    color: "hsl(0, 84%, 60%)",
  },
} satisfies ChartConfig;

export default function MonitoringPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<WarehouseAnalyticsResponse | null>(
    null
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [aiAdviceOpen, setAiAdviceOpen] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<AiAdviceResponse | null>(null);
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false);
  const [aiAdviceError, setAiAdviceError] = useState<string | null>(null);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setLoading(true);
        const response = await warehouseApi.getAll();
        setWarehouses(response.warehouses);
        setFilteredWarehouses(response.warehouses);
        if (response.warehouses.length > 0 && !selectedWarehouse) {
          setSelectedWarehouse(response.warehouses[0]);
        }
      } catch (error) {
        console.error("Failed to load warehouses:", error);
      } finally {
        setLoading(false);
      }
    };

    loadWarehouses();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredWarehouses(warehouses);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredWarehouses(
      warehouses.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.address.toLowerCase().includes(query) ||
          w.description?.toLowerCase().includes(query)
      )
    );
  }, [searchQuery, warehouses]);

  useEffect(() => {
    if (!selectedWarehouse) {
      setAnalytics(null);
      setAnalyticsError(null);
      return;
    }
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    warehouseApi
      .getAnalytics(selectedWarehouse.id, { period: "month", periods: 6 })
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled)
          setAnalyticsError(
            err instanceof Error ? err.message : "Failed to load analytics"
          );
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWarehouse]);

  useEffect(() => {
    if (!aiAdviceOpen || !selectedWarehouse) return;
    let cancelled = false;
    setAiAdviceError(null);
    setAiAdviceLoading(true);
    warehouseApi
      .getAiAdvice(selectedWarehouse.id)
      .then((data) => {
        if (!cancelled) setAiAdvice(data);
      })
      .catch((err) => {
        if (!cancelled)
          setAiAdviceError(
            err instanceof Error ? err.message : "Failed to load AI advice"
          );
      })
      .finally(() => {
        if (!cancelled) setAiAdviceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiAdviceOpen, selectedWarehouse?.id]);

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
    );
  }

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Monitoring</h1>
            <p className="mt-1 text-muted-foreground">
              Track inventory, product flow, and value across your warehouses
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAiAdviceOpen(true)}
            disabled={!selectedWarehouse}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            AI Advice
          </button>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search warehouses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filteredWarehouses.map((warehouse) => (
              <button
                key={warehouse.id}
                onClick={() => setSelectedWarehouse(warehouse)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedWarehouse?.id === warehouse.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                {warehouse.name}
              </button>
            ))}
          </div>
        </div>

        {warehouses.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No warehouses yet</h3>
            <p className="mt-2 text-muted-foreground">
              Create warehouses on the map to see monitoring data here
            </p>
          </div>
        ) : !selectedWarehouse ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">
              Select a warehouse to view data
            </p>
          </div>
        ) : analyticsLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-border bg-card">
            <div className="text-center">
              <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="text-muted-foreground">Loading analytics...</p>
            </div>
          </div>
        ) : analyticsError ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <p className="text-destructive">{analyticsError}</p>
          </div>
        ) : analytics ? (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total items
                    </p>
                    <p className="text-2xl font-bold">
                      {analytics.summary.totalItems.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-500/10 p-2">
                    <Layers className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Product types
                    </p>
                    <p className="text-2xl font-bold">
                      {analytics.summary.typeCount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2">
                    <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Incoming value
                    </p>
                    <p className="text-2xl font-bold">
                      $
                      {analytics.summary.totalIncomingValue.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2">
                    <ArrowUpFromLine className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Outgoing value
                    </p>
                    <p className="text-2xl font-bold">
                      $
                      {analytics.summary.totalOutgoingValue.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  Value of loads vs unloads
                </h3>
                {analytics.flowTimeSeries.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                    No flow data in this period
                  </div>
                ) : (
                  <ChartContainer
                    config={valueChartConfig}
                    className="h-[280px] w-full"
                  >
                    <BarChart
                      data={analytics.flowTimeSeries.map((d) => ({
                        periodLabel: d.periodLabel,
                        incomingValue: d.incomingValue,
                        outgoingValue: d.outgoingValue,
                      }))}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="periodLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="incomingValue"
                        fill="var(--color-incomingValue)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="outgoingValue"
                        fill="var(--color-outgoingValue)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Product flow (units)
                </h3>
                {analytics.flowTimeSeries.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                    No flow data in this period
                  </div>
                ) : (
                  <ChartContainer
                    config={quantityChartConfig}
                    className="h-[280px] w-full"
                  >
                    <LineChart
                      data={analytics.flowTimeSeries.map((d) => ({
                        periodLabel: d.periodLabel,
                        incomingCount: d.incomingCount,
                        outgoingCount: d.outgoingCount,
                      }))}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="periodLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="incomingCount"
                        stroke="var(--color-incomingCount)"
                        strokeWidth={2}
                        dot={{ fill: "var(--color-incomingCount)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="outgoingCount"
                        stroke="var(--color-outgoingCount)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: "var(--color-outgoingCount)" }}
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold">
                  Inventory by type
                </h3>
                {analytics.inventoryByType.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                    No inventory data
                  </div>
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const total = analytics.inventoryByType.reduce(
                              (s, i) => s + i.count,
                              0
                            );
                            const p = payload[0];
                            const count = p.payload?.value ?? 0;
                            const pct =
                              total > 0
                                ? ((count / total) * 100).toFixed(1)
                                : "0";
                            return (
                              <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
                                <p className="font-medium">
                                  {p.name}: {Number(count).toLocaleString()} (
                                  {pct}%)
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Pie
                          data={analytics.inventoryByType.map((item, i) => ({
                            name: item.typeName,
                            value: item.count,
                            fill: PIE_COLORS[i % PIE_COLORS.length],
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {analytics.inventoryByType.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <TrendingDown className="h-5 w-5 text-amber-500" />
                  Top moved product types
                </h3>
                {analytics.flowByType.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                    No flow data yet
                  </div>
                ) : (
                  <ChartContainer
                    config={flowByTypeChartConfig}
                    className="h-[280px] w-full"
                  >
                    <BarChart
                      data={analytics.flowByType.map((d) => ({
                        typeName:
                          d.typeName.length > 14
                            ? d.typeName.slice(0, 12) + "…"
                            : d.typeName,
                        fullName: d.typeName,
                        loaded: d.loaded,
                        unloaded: d.unloaded,
                      }))}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        type="category"
                        dataKey="typeName"
                        width={80}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
                              <p className="font-medium">{row.fullName}</p>
                              <p className="text-sm text-muted-foreground">
                                Loaded: {row.loaded.toLocaleString()} ·
                                Unloaded: {row.unloaded.toLocaleString()}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="loaded"
                        fill="var(--color-loaded)"
                        radius={[0, 4, 4, 0]}
                        stackId="flow"
                      />
                      <Bar
                        dataKey="unloaded"
                        fill="var(--color-unloaded)"
                        radius={[0, 4, 4, 0]}
                        stackId="flow"
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <Sheet open={aiAdviceOpen} onOpenChange={setAiAdviceOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col overflow-y-auto sm:max-w-xl"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                AI Advice
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-1 flex-col gap-6">
              {aiAdviceLoading && (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing warehouse data…
                  </p>
                </div>
              )}
              {!aiAdviceLoading && aiAdviceError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
                  <p className="text-sm text-destructive">{aiAdviceError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAiAdviceError(null);
                      setAiAdvice(null);
                      setAiAdviceLoading(true);
                      if (selectedWarehouse)
                        warehouseApi
                          .getAiAdvice(selectedWarehouse.id)
                          .then(setAiAdvice)
                          .catch((err) =>
                            setAiAdviceError(
                              err instanceof Error
                                ? err.message
                                : "Failed to load AI advice"
                            )
                          )
                          .finally(() => setAiAdviceLoading(false));
                    }}
                    className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!aiAdviceLoading && !aiAdviceError && aiAdvice && (
                <>
                  <p className="text-sm leading-relaxed">{aiAdvice.summary}</p>
                  {aiAdvice.recommendations.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">
                        Recommendations
                      </h4>
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {aiAdvice.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAdvice.tables.map((table, idx) => (
                    <div key={idx}>
                      {table.title && (
                        <h4 className="mb-2 text-sm font-semibold">
                          {table.title}
                        </h4>
                      )}
                      <div className="overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {table.headers.map((h, i) => (
                                <TableHead key={i}>{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {table.rows.map((row, ri) => (
                              <TableRow key={ri}>
                                {row.map((cell, ci) => (
                                  <TableCell key={ci}>{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                  {aiAdvice.chartSuggestions.map((chart, idx) => {
                    const labels = chart.data.labels;
                    const series = chart.data.series;
                    const chartData = labels.map((name, i) => ({
                      name: name.length > 12 ? name.slice(0, 10) + "…" : name,
                      fullName: name,
                      ...Object.fromEntries(
                        series.map((s, si) => [
                          `series_${si}`,
                          s.values[i] ?? 0,
                        ])
                      ),
                    }));
                    const config = Object.fromEntries(
                      series.map((s, i) => [
                        `series_${i}`,
                        {
                          label: s.name,
                          color: PIE_COLORS[i % PIE_COLORS.length],
                        },
                      ])
                    ) as ChartConfig;
                    return (
                      <div key={idx} className="space-y-2">
                        <h4 className="text-sm font-semibold">{chart.title}</h4>
                        <ChartContainer
                          config={config}
                          className="h-[220px] w-full"
                        >
                          {chart.type === "line" ? (
                            <LineChart
                              data={chartData}
                              margin={{
                                top: 10,
                                right: 10,
                                left: 0,
                                bottom: 0,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                              />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              {series.map((s, si) => (
                                <Line
                                  key={si}
                                  type="monotone"
                                  dataKey={`series_${si}`}
                                  stroke={`var(--color-series_${si})`}
                                  strokeWidth={2}
                                  dot={{
                                    fill: PIE_COLORS[si % PIE_COLORS.length],
                                  }}
                                />
                              ))}
                            </LineChart>
                          ) : (
                            <BarChart
                              data={chartData}
                              margin={{
                                top: 10,
                                right: 10,
                                left: 0,
                                bottom: 0,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                              />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              {series.map((s, si) => (
                                <Bar
                                  key={si}
                                  dataKey={`series_${si}`}
                                  fill={`var(--color-series_${si})`}
                                  radius={[4, 4, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          )}
                        </ChartContainer>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </ProtectedRoute>
  );
}
