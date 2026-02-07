"use client"

import { useEffect, useState, useMemo } from "react"
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
} from "recharts"
import { ProtectedRoute } from "@/components/protected-route"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { warehouseApi, Warehouse } from "@/lib/api"
import {
  Search,
  TrendingUp,
  TrendingDown,
  Package,
  MessageSquare,
  DollarSign,
} from "lucide-react"

// Generate mock data for a warehouse
function generateMockWarehouseData(warehouseId: string, warehouseName: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
  const incomeData = months.map((month, i) => ({
    month,
    income: Math.floor(15000 + Math.random() * 20000 + i * 3000),
    loss: Math.floor(500 + Math.random() * 2000 + i * 200),
  }))

  const quantityData = months.map((month, i) => ({
    month,
    products: Math.floor(500 + Math.random() * 800 + i * 100),
    incoming: Math.floor(100 + Math.random() * 300),
    outgoing: Math.floor(80 + Math.random() * 250),
  }))

  const categoryData = [
    { name: "Electronics", value: 35, fill: "hsl(220, 70%, 50%)" },
    { name: "Clothing", value: 25, fill: "hsl(160, 60%, 45%)" },
    { name: "Food", value: 20, fill: "hsl(30, 80%, 55%)" },
    { name: "Furniture", value: 15, fill: "hsl(280, 65%, 60%)" },
    { name: "Other", value: 5, fill: "hsl(340, 75%, 55%)" },
  ]

  const reviewsData = months.map((month, i) => ({
    month,
    positive: Math.floor(20 + Math.random() * 30 + i * 5),
    negative: Math.floor(2 + Math.random() * 8),
    neutral: Math.floor(5 + Math.random() * 15),
  }))

  return {
    incomeData,
    quantityData,
    categoryData,
    reviewsData,
    stats: {
      totalIncome: incomeData.reduce((acc, d) => acc + d.income, 0),
      totalLoss: incomeData.reduce((acc, d) => acc + d.loss, 0),
      avgProducts: Math.floor(
        quantityData.reduce((acc, d) => acc + d.products, 0) / months.length
      ),
      totalReviews: reviewsData.reduce(
        (acc, d) => acc + d.positive + d.negative + d.neutral,
        0
      ),
      rating: (4.2 + Math.random() * 0.7).toFixed(1),
    },
  }
}

const incomeChartConfig = {
  income: {
    label: "Income",
    color: "hsl(220, 70%, 50%)",
  },
  loss: {
    label: "Loss",
    color: "hsl(0, 84%, 60%)",
  },
} satisfies ChartConfig

const quantityChartConfig = {
  products: {
    label: "Products",
    color: "hsl(160, 60%, 45%)",
  },
  incoming: {
    label: "Incoming",
    color: "hsl(30, 80%, 55%)",
  },
  outgoing: {
    label: "Outgoing",
    color: "hsl(280, 65%, 60%)",
  },
} satisfies ChartConfig

const reviewsChartConfig = {
  positive: {
    label: "Positive",
    color: "hsl(142, 76%, 36%)",
  },
  negative: {
    label: "Negative",
    color: "hsl(0, 84%, 60%)",
  },
  neutral: {
    label: "Neutral",
    color: "hsl(215, 16%, 47%)",
  },
} satisfies ChartConfig

export default function MonitoringPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [filteredWarehouses, setFilteredWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(
    null
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setLoading(true)
        const response = await warehouseApi.getAll()
        setWarehouses(response.warehouses)
        setFilteredWarehouses(response.warehouses)
        if (response.warehouses.length > 0 && !selectedWarehouse) {
          setSelectedWarehouse(response.warehouses[0])
        }
      } catch (error) {
        console.error("Failed to load warehouses:", error)
      } finally {
        setLoading(false)
      }
    }

    loadWarehouses()
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredWarehouses(warehouses)
      return
    }
    const query = searchQuery.toLowerCase()
    setFilteredWarehouses(
      warehouses.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.address.toLowerCase().includes(query) ||
          w.description?.toLowerCase().includes(query)
      )
    )
  }, [searchQuery, warehouses])

  const mockData = useMemo(() => {
    if (!selectedWarehouse) return null
    return generateMockWarehouseData(selectedWarehouse.id, selectedWarehouse.name)
  }, [selectedWarehouse])

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
          <h1 className="text-3xl font-bold tracking-tight">Monitoring</h1>
          <p className="mt-1 text-muted-foreground">
            Track income, products, and buyer feedback across your warehouses
          </p>
        </div>

        {/* Warehouse selector */}
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
          <div className="flex flex-wrap gap-2">
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
            <p className="text-muted-foreground">Select a warehouse to view data</p>
          </div>
        ) : mockData ? (
          <div className="space-y-8">
            {/* Stats cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total Income
                    </p>
                    <p className="text-2xl font-bold">
                      ${mockData.stats.totalIncome.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-500/10 p-2">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total Loss
                    </p>
                    <p className="text-2xl font-bold">
                      ${mockData.stats.totalLoss.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Avg Products
                    </p>
                    <p className="text-2xl font-bold">
                      {mockData.stats.avgProducts.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2">
                    <MessageSquare className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Reviews / Rating
                    </p>
                    <p className="text-2xl font-bold">
                      {mockData.stats.totalReviews}{" "}
                      <span className="text-lg font-normal text-muted-foreground">
                        ({mockData.stats.rating}★)
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Income & Loss chart */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  Income vs Loss
                </h3>
                <ChartContainer
                  config={incomeChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={mockData.incomeData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="income"
                      fill="var(--color-income)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="loss"
                      fill="var(--color-loss)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </div>

              {/* Product quantity chart */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Package className="h-5 w-5 text-blue-500" />
                  Product Flow
                </h3>
                <ChartContainer
                  config={quantityChartConfig}
                  className="h-[280px] w-full"
                >
                  <LineChart
                    data={mockData.quantityData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="products"
                      stroke="var(--color-products)"
                      strokeWidth={2}
                      dot={{ fill: "var(--color-products)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="incoming"
                      stroke="var(--color-incoming)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: "var(--color-incoming)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="outgoing"
                      stroke="var(--color-outgoing)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: "var(--color-outgoing)" }}
                    />
                  </LineChart>
                </ChartContainer>
              </div>

              {/* Category distribution pie */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold">
                  Inventory by Category
                </h3>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <ChartTooltip
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
                              <p className="font-medium">
                                {payload[0].name}: {payload[0].value}%
                              </p>
                            </div>
                          ) : null
                        }
                      />
                      <Pie
                        data={mockData.categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {mockData.categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Buyer reviews chart */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <MessageSquare className="h-5 w-5 text-amber-500" />
                  Buyer Comments (Sentiment)
                </h3>
                <ChartContainer
                  config={reviewsChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={mockData.reviewsData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="positive"
                      fill="var(--color-positive)"
                      radius={[4, 4, 0, 0]}
                      stackId="reviews"
                    />
                    <Bar
                      dataKey="neutral"
                      fill="var(--color-neutral)"
                      radius={[0, 0, 0, 0]}
                      stackId="reviews"
                    />
                    <Bar
                      dataKey="negative"
                      fill="var(--color-negative)"
                      radius={[0, 0, 4, 4]}
                      stackId="reviews"
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  )
}
