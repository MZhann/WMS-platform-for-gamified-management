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
