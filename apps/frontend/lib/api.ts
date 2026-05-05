/** Backend base URL from env (e.g. http://localhost:3001/api). Set NEXT_PUBLIC_API_URL in .env */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export interface User {
  id: string
  email: string
  name: string
  isAdmin?: boolean
}

export interface AuthResponse {
  message: string
  token: string
  user: User
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  name: string
}

export interface WarehouseInventoryItem {
  typeName: string
  count: number
}

export interface Warehouse {
  id: string
  name: string
  description: string
  address: string
  coordinates: [number, number]
  createdAt?: string
  updatedAt?: string
  inventory?: WarehouseInventoryItem[]
  totalItems?: number
  typeCount?: number
}

export interface CreateWarehouseData {
  name: string
  description: string
  address: string
  coordinates: [number, number]
}

export interface WarehouseInventoryUpdate {
  inventory: WarehouseInventoryItem[]
}

export type FlowOperation = "load" | "unload"

export interface FlowItem {
  typeName: string
  count: number
  unitPrice: number
}

export interface WarehouseFlowEntry {
  id: string
  warehouseId: string
  operation: FlowOperation
  items: FlowItem[]
  performedBy?: string
  createdAt: string
}

export interface PostFlowData {
  operation: FlowOperation
  items: FlowItem[]
}

export interface GetFlowResponse {
  flows: WarehouseFlowEntry[]
  total: number
  page: number
  limit: number
}

export interface WarehouseAnalyticsSummary {
  totalItems: number
  typeCount: number
  totalIncomingValue: number
  totalOutgoingValue: number
  totalIncomingCount: number
  totalOutgoingCount: number
}

export interface WarehouseFlowTimeSeriesItem {
  period: string
  periodLabel: string
  incomingCount: number
  outgoingCount: number
  incomingValue: number
  outgoingValue: number
}

export interface WarehouseFlowByTypeItem {
  typeName: string
  loaded: number
  unloaded: number
}

export interface WarehouseAnalyticsResponse {
  summary: WarehouseAnalyticsSummary
  inventoryByType: WarehouseInventoryItem[]
  flowTimeSeries: WarehouseFlowTimeSeriesItem[]
  flowByType: WarehouseFlowByTypeItem[]
}

export interface AiAdviceTable {
  title: string
  headers: string[]
  rows: string[][]
}

export interface AiAdviceChartSeries {
  name: string
  values: number[]
}

export interface AiAdviceChartSuggestion {
  type: "bar" | "line"
  title: string
  data: { labels: string[]; series: AiAdviceChartSeries[] }
}

export interface AiAdviceResponse {
  summary: string
  recommendations: string[]
  tables: AiAdviceTable[]
  chartSuggestions: AiAdviceChartSuggestion[]
}

// Get token from localStorage
export const getToken = (): string | null => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("token")
}

// Set token in localStorage
export const setToken = (token: string): void => {
  if (typeof window === "undefined") return
  localStorage.setItem("token", token)
}

// Remove token from localStorage
export const removeToken = (): void => {
  if (typeof window === "undefined") return
  localStorage.removeItem("token")
}

// API call helper
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
    ...(token && { Authorization: `Bearer ${token}` }),
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(error.error || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

// Auth API functions
export const authApi = {
  register: async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    return apiCall<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(credentials),
    })
  },

  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiCall<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    })
  },

  getMe: async (): Promise<{ user: User }> => {
    return apiCall<{ user: User }>("/auth/me", {
      method: "GET",
    })
  },
}

// Warehouse API functions
export const warehouseApi = {
  getAll: async (): Promise<{ warehouses: Warehouse[] }> => {
    return apiCall<{ warehouses: Warehouse[] }>("/warehouses", {
      method: "GET",
    })
  },

  getOne: async (id: string): Promise<{ warehouse: Warehouse }> => {
    return apiCall<{ warehouse: Warehouse }>(`/warehouses/${id}`, {
      method: "GET",
    })
  },

  create: async (data: CreateWarehouseData): Promise<{ warehouse: Warehouse; message: string }> => {
    return apiCall<{ warehouse: Warehouse; message: string }>("/warehouses", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  update: async (id: string, data: Partial<CreateWarehouseData>): Promise<{ warehouse: Warehouse; message: string }> => {
    return apiCall<{ warehouse: Warehouse; message: string }>(`/warehouses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/warehouses/${id}`, {
      method: "DELETE",
    })
  },

  updateInventory: async (
    id: string,
    data: WarehouseInventoryUpdate
  ): Promise<{ warehouse: Warehouse; message: string }> => {
    return apiCall<{ warehouse: Warehouse; message: string }>(`/warehouses/${id}/inventory`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  uploadInventoryCsv: async (
    id: string,
    file: File
  ): Promise<{ warehouse: Warehouse; message: string }> => {
    const token = getToken()
    const formData = new FormData()
    formData.append("file", file)
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    }
    const response = await fetch(`${API_BASE_URL}/warehouses/${id}/inventory/upload`, {
      method: "POST",
      headers,
      body: formData,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }
    return response.json()
  },

  postFlow: async (
    id: string,
    data: PostFlowData
  ): Promise<{ warehouse: Warehouse; flow: WarehouseFlowEntry; message: string }> => {
    return apiCall<{ warehouse: Warehouse; flow: WarehouseFlowEntry; message: string }>(
      `/warehouses/${id}/flow`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    )
  },

  getFlow: async (
    id: string,
    params?: { page?: number; limit?: number }
  ): Promise<GetFlowResponse> => {
    const search = new URLSearchParams()
    if (params?.page != null) search.set("page", String(params.page))
    if (params?.limit != null) search.set("limit", String(params.limit))
    const qs = search.toString()
    return apiCall<GetFlowResponse>(`/warehouses/${id}/flow${qs ? `?${qs}` : ""}`, {
      method: "GET",
    })
  },

  getAnalytics: async (
    id: string,
    params?: { period?: "day" | "week" | "month"; periods?: number }
  ): Promise<WarehouseAnalyticsResponse> => {
    const search = new URLSearchParams()
    if (params?.period != null) search.set("period", params.period)
    if (params?.periods != null) search.set("periods", String(params.periods))
    const qs = search.toString()
    return apiCall<WarehouseAnalyticsResponse>(
      `/warehouses/${id}/analytics${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    )
  },

  getAiAdvice: async (id: string): Promise<AiAdviceResponse> => {
    return apiCall<AiAdviceResponse>(`/warehouses/${id}/ai-advice`, { method: "GET" })
  },
}

// --- Orders ---

export type OrderType = "purchase" | "sales"
export type OrderStatus = "draft" | "confirmed" | "in_progress" | "completed" | "cancelled"

export interface OrderItem {
  typeName: string
  quantity: number
  unitPrice: number
  fulfilledQty: number
}

export interface OrderAuditEntry {
  action: string
  fromStatus?: string
  toStatus?: string
  performedBy?: string
  timestamp: string
  note?: string
}

export interface Order {
  id: string
  orderNumber: string
  orderType: OrderType
  status: OrderStatus
  warehouseId: string
  userId: string
  counterparty: string
  items: OrderItem[]
  notes: string
  audit: OrderAuditEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateOrderData {
  orderType: OrderType
  warehouseId: string
  counterparty: string
  items: { typeName: string; quantity: number; unitPrice: number }[]
  notes?: string
}

export interface OrdersListResponse {
  orders: Order[]
  total: number
  page: number
  limit: number
}

export const orderApi = {
  getAll: async (params?: {
    type?: OrderType
    status?: OrderStatus
    warehouseId?: string
    page?: number
    limit?: number
  }): Promise<OrdersListResponse> => {
    const search = new URLSearchParams()
    if (params?.type) search.set("type", params.type)
    if (params?.status) search.set("status", params.status)
    if (params?.warehouseId) search.set("warehouseId", params.warehouseId)
    if (params?.page != null) search.set("page", String(params.page))
    if (params?.limit != null) search.set("limit", String(params.limit))
    const qs = search.toString()
    return apiCall<OrdersListResponse>(`/orders${qs ? `?${qs}` : ""}`)
  },

  getOne: async (id: string): Promise<{ order: Order }> => {
    return apiCall<{ order: Order }>(`/orders/${id}`)
  },

  create: async (data: CreateOrderData): Promise<{ order: Order; message: string }> => {
    return apiCall<{ order: Order; message: string }>("/orders", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  update: async (
    id: string,
    data: Partial<Pick<CreateOrderData, "counterparty" | "items" | "notes">>
  ): Promise<{ order: Order; message: string }> => {
    return apiCall<{ order: Order; message: string }>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  updateStatus: async (
    id: string,
    status: OrderStatus,
    note?: string
  ): Promise<{ order: Order; message: string }> => {
    return apiCall<{ order: Order; message: string }>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    })
  },

  fulfill: async (id: string): Promise<{ order: Order; message: string }> => {
    return apiCall<{ order: Order; message: string }>(`/orders/${id}/fulfill`, {
      method: "POST",
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/orders/${id}`, { method: "DELETE" })
  },
}

// --- Locations / Zones ---

export type ZoneType = "receiving" | "storage" | "shipping" | "staging" | "cold_storage" | "returns"

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  receiving: "Receiving",
  storage: "Storage",
  shipping: "Shipping",
  staging: "Staging",
  cold_storage: "Cold Storage",
  returns: "Returns",
}

export const ZONE_TYPE_COLORS: Record<ZoneType, string> = {
  receiving: "#3b82f6",
  storage: "#22c55e",
  shipping: "#f97316",
  staging: "#eab308",
  cold_storage: "#06b6d4",
  returns: "#ef4444",
}

export interface Zone {
  id: string
  warehouseId: string
  name: string
  code: string
  type: ZoneType
  color: string
  x: number
  y: number
  w: number
  h: number
  aisles: number
  racksPerAisle: number
  capacityPerSlot: number
  locationCount?: number
  totalItems?: number
  createdAt: string
  updatedAt: string
}

export interface LocationInventoryItem {
  typeName: string
  count: number
}

export interface WarehouseLocation {
  id: string
  warehouseId: string
  zoneId: string
  code: string
  aisle: string
  rack: string
  maxCapacity: number
  currentUtilization: number
  utilizationPercent: number
  inventory: LocationInventoryItem[]
  status: "active" | "inactive"
  createdAt: string
  updatedAt: string
}

export interface CreateZoneData {
  warehouseId: string
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

export interface LocationSummary {
  totalZones: number
  totalLocations: number
  activeLocations: number
  totalCapacity: number
  totalUtilized: number
  utilizationPercent: number
}

export const locationApi = {
  getZones: async (warehouseId: string): Promise<{ zones: Zone[] }> => {
    return apiCall<{ zones: Zone[] }>(`/locations/zones?warehouseId=${warehouseId}`)
  },

  createZone: async (data: CreateZoneData): Promise<{ zone: Zone; locationsCreated: number; message: string }> => {
    return apiCall<{ zone: Zone; locationsCreated: number; message: string }>("/locations/zones", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  getZone: async (zoneId: string): Promise<{ zone: Zone; locations: WarehouseLocation[] }> => {
    return apiCall<{ zone: Zone; locations: WarehouseLocation[] }>(`/locations/zones/${zoneId}`)
  },

  updateZone: async (
    zoneId: string,
    data: Partial<Pick<CreateZoneData, "name" | "type" | "x" | "y" | "w" | "h">>
  ): Promise<{ zone: Zone; message: string }> => {
    return apiCall<{ zone: Zone; message: string }>(`/locations/zones/${zoneId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  deleteZone: async (zoneId: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/locations/zones/${zoneId}`, { method: "DELETE" })
  },

  getLocations: async (params: {
    warehouseId?: string
    zoneId?: string
  }): Promise<{ locations: WarehouseLocation[]; total: number }> => {
    const search = new URLSearchParams()
    if (params.warehouseId) search.set("warehouseId", params.warehouseId)
    if (params.zoneId) search.set("zoneId", params.zoneId)
    const qs = search.toString()
    return apiCall<{ locations: WarehouseLocation[]; total: number }>(`/locations${qs ? `?${qs}` : ""}`)
  },

  getLocation: async (id: string): Promise<{ location: WarehouseLocation }> => {
    return apiCall<{ location: WarehouseLocation }>(`/locations/${id}`)
  },

  updateLocation: async (
    id: string,
    data: { maxCapacity?: number; status?: "active" | "inactive" }
  ): Promise<{ location: WarehouseLocation; message: string }> => {
    return apiCall<{ location: WarehouseLocation; message: string }>(`/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  updateLocationInventory: async (
    id: string,
    inventory: LocationInventoryItem[]
  ): Promise<{ location: WarehouseLocation; message: string }> => {
    return apiCall<{ location: WarehouseLocation; message: string }>(`/locations/${id}/inventory`, {
      method: "PATCH",
      body: JSON.stringify({ inventory }),
    })
  },

  deleteLocation: async (id: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/locations/${id}`, { method: "DELETE" })
  },

  getSummary: async (warehouseId: string): Promise<{ summary: LocationSummary }> => {
    return apiCall<{ summary: LocationSummary }>(`/locations/warehouse/${warehouseId}/summary`)
  },
}

// --- Shipments ---

export type ShipmentStatus =
  | "pending"
  | "picking"
  | "picked"
  | "packing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  picking: "Picking",
  picked: "Picked",
  packing: "Packing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export interface ShipmentItem {
  typeName: string
  quantity: number
  pickedQty: number
  packedQty: number
  locationId: string | null
  locationCode: string | null
}

export interface ShipmentAuditEntry {
  action: string
  fromStatus?: string
  toStatus?: string
  performedBy?: string
  timestamp: string
  note?: string
}

export interface Shipment {
  id: string
  shipmentNumber: string
  orderId: string
  orderNumber: string
  warehouseId: string
  userId: string
  status: ShipmentStatus
  carrier: string
  trackingNumber: string
  items: ShipmentItem[]
  shippedAt: string | null
  deliveredAt: string | null
  notes: string
  audit: ShipmentAuditEntry[]
  createdAt: string
  updatedAt: string
}

export interface ShipmentsListResponse {
  shipments: Shipment[]
  total: number
  page: number
  limit: number
}

export interface PackingSlip {
  shipmentNumber: string
  orderNumber: string
  date: string
  warehouse: { name: string; address: string } | null
  counterparty: string
  carrier: string
  trackingNumber: string
  items: { typeName: string; quantity: number; packedQty: number }[]
  notes: string
  status: string
}

export const shipmentApi = {
  getAll: async (params?: {
    status?: ShipmentStatus
    warehouseId?: string
    orderId?: string
    page?: number
    limit?: number
  }): Promise<ShipmentsListResponse> => {
    const search = new URLSearchParams()
    if (params?.status) search.set("status", params.status)
    if (params?.warehouseId) search.set("warehouseId", params.warehouseId)
    if (params?.orderId) search.set("orderId", params.orderId)
    if (params?.page != null) search.set("page", String(params.page))
    if (params?.limit != null) search.set("limit", String(params.limit))
    const qs = search.toString()
    return apiCall<ShipmentsListResponse>(`/shipments${qs ? `?${qs}` : ""}`)
  },

  getOne: async (id: string): Promise<{ shipment: Shipment }> => {
    return apiCall<{ shipment: Shipment }>(`/shipments/${id}`)
  },

  create: async (data: { orderId: string; carrier?: string; trackingNumber?: string; notes?: string }): Promise<{ shipment: Shipment; message: string }> => {
    return apiCall<{ shipment: Shipment; message: string }>("/shipments", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateStatus: async (
    id: string,
    data: { status: ShipmentStatus; carrier?: string; trackingNumber?: string; note?: string }
  ): Promise<{ shipment: Shipment; message: string }> => {
    return apiCall<{ shipment: Shipment; message: string }>(`/shipments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  pick: async (
    id: string,
    picks: { typeName: string; pickedQty: number }[]
  ): Promise<{ shipment: Shipment; message: string }> => {
    return apiCall<{ shipment: Shipment; message: string }>(`/shipments/${id}/pick`, {
      method: "POST",
      body: JSON.stringify({ picks }),
    })
  },

  pack: async (
    id: string,
    packs: { typeName: string; packedQty: number }[]
  ): Promise<{ shipment: Shipment; message: string }> => {
    return apiCall<{ shipment: Shipment; message: string }>(`/shipments/${id}/pack`, {
      method: "POST",
      body: JSON.stringify({ packs }),
    })
  },

  getPackingSlip: async (id: string): Promise<{ packingSlip: PackingSlip }> => {
    return apiCall<{ packingSlip: PackingSlip }>(`/shipments/${id}/packing-slip`)
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/shipments/${id}`, { method: "DELETE" })
  },
}

// --- Pick Lists ---

export type PickListType = "single" | "wave"
export type PickListStatus = "pending" | "in_progress" | "completed" | "cancelled"
export type PickItemStatus = "pending" | "picked" | "short"

export interface PickItem {
  shipmentId: string
  orderNumber: string
  typeName: string
  quantity: number
  pickedQty: number
  locationId: string | null
  locationCode: string | null
  status: PickItemStatus
}

export interface PickListData {
  id: string
  pickListNumber: string
  warehouseId: string
  userId: string
  type: PickListType
  status: PickListStatus
  shipmentIds: string[]
  items: PickItem[]
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PickListsResponse {
  pickLists: PickListData[]
  total: number
  page: number
  limit: number
}

export const pickingApi = {
  getAll: async (params?: {
    status?: PickListStatus
    warehouseId?: string
    page?: number
    limit?: number
  }): Promise<PickListsResponse> => {
    const search = new URLSearchParams()
    if (params?.status) search.set("status", params.status)
    if (params?.warehouseId) search.set("warehouseId", params.warehouseId)
    if (params?.page != null) search.set("page", String(params.page))
    if (params?.limit != null) search.set("limit", String(params.limit))
    const qs = search.toString()
    return apiCall<PickListsResponse>(`/picking${qs ? `?${qs}` : ""}`)
  },

  getOne: async (id: string): Promise<{ pickList: PickListData }> => {
    return apiCall<{ pickList: PickListData }>(`/picking/${id}`)
  },

  create: async (shipmentIds: string[]): Promise<{ pickList: PickListData; message: string }> => {
    return apiCall<{ pickList: PickListData; message: string }>("/picking", {
      method: "POST",
      body: JSON.stringify({ shipmentIds }),
    })
  },

  confirm: async (
    id: string,
    picks: { typeName: string; orderNumber: string; pickedQty: number }[]
  ): Promise<{ pickList: PickListData; message: string }> => {
    return apiCall<{ pickList: PickListData; message: string }>(`/picking/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ picks }),
    })
  },

  cancel: async (id: string): Promise<{ pickList: PickListData; message: string }> => {
    return apiCall<{ pickList: PickListData; message: string }>(`/picking/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    })
  },
}

// --- AI / Forecasting ---

export interface DemandForecastItem {
  typeName: string
  currentStock: number
  avgDailyDemand: number
  avgDailySupply: number
  forecastedDemand: number[]
  forecastedSupply: number[]
  movingAvgDemand: number[]
  historicalDemand: number[]
  historicalSupply: number[]
  daysUntilStockout: number | null
  riskLevel: "low" | "medium" | "high" | "critical"
  recommendation: string
}

export interface DemandForecastResponse {
  warehouseId: string
  warehouseName: string
  historyDays: number
  forecastDays: number
  historicalDates: string[]
  forecastDates: string[]
  forecasts: DemandForecastItem[]
  generatedAt: string
}

export interface SmartPutawayRecommendation {
  locationId: string
  locationCode: string
  zoneId: string
  zoneName: string
  zoneType: string
  aisle: string
  rack: string
  currentItems: number
  maxCapacity: number
  availableSpace: number
  score: number
  reasons: string[]
}

export interface SmartPutawayResponse {
  typeName: string
  count: number
  isFastMover: boolean
  turnover90d: number
  topAffinities: { typeName: string; coOccurrences: number }[]
  recommendations: SmartPutawayRecommendation[]
  totalLocationsEvaluated: number
}

export interface GeneratedZone {
  name: string
  code: string
  type: ZoneType
  color: string
  x: number
  y: number
  w: number
  h: number
  aisles: number
  racksPerAisle: number
  capacityPerSlot: number
  rationale: string
}

export interface GenerateLayoutResponse {
  warehouseId: string
  warehouseName: string
  gridDimensions: { cols: number; rows: number }
  zones: GeneratedZone[]
  totalLocations: number
  generatedAt: string
}

export interface ApplyLayoutResponse {
  message: string
  zones: { id: string; name: string; code: string; type: string; locationsCreated: number }[]
  totalLocationsCreated: number
}

export const aiApi = {
  getDemandForecast: async (
    warehouseId: string,
    params?: { days?: number }
  ): Promise<DemandForecastResponse> => {
    const search = new URLSearchParams()
    if (params?.days != null) search.set("days", String(params.days))
    const qs = search.toString()
    return apiCall<DemandForecastResponse>(`/ai/${warehouseId}/demand-forecast${qs ? `?${qs}` : ""}`)
  },

  getSmartPutaway: async (
    warehouseId: string,
    data: { typeName: string; count?: number }
  ): Promise<SmartPutawayResponse> => {
    return apiCall<SmartPutawayResponse>(`/ai/${warehouseId}/smart-putaway`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  generateLayout: async (
    warehouseId: string,
    data: { gridCols?: number; gridRows?: number; preferences?: string }
  ): Promise<GenerateLayoutResponse> => {
    return apiCall<GenerateLayoutResponse>(`/ai/${warehouseId}/generate-layout`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  applyLayout: async (
    warehouseId: string,
    data: { zones: GeneratedZone[]; clearExisting?: boolean }
  ): Promise<ApplyLayoutResponse> => {
    return apiCall<ApplyLayoutResponse>(`/ai/${warehouseId}/apply-layout`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },
}

// Support API functions
export interface SupportCommentData {
  name: string
  email: string
  message: string
}

export const supportApi = {
  createComment: async (
    data: SupportCommentData
  ): Promise<{ message: string; comment: { id: string; name: string; email: string; message: string; createdAt: string } }> => {
    return apiCall<{ message: string; comment: { id: string; name: string; email: string; message: string; createdAt: string } }>(
      "/support/comments",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    )
  },
}

// Admin API functions (requires admin user)
export interface SupportCommentItem {
  id: string
  name: string
  email: string
  message: string
  createdAt: string
}

export const adminApi = {
  getComments: async (): Promise<{ comments: SupportCommentItem[] }> => {
    return apiCall<{ comments: SupportCommentItem[] }>("/admin/comments")
  },

  deleteComment: async (id: string): Promise<{ message: string }> => {
    return apiCall<{ message: string }>(`/admin/comments/${id}`, {
      method: "DELETE",
    })
  },
}
