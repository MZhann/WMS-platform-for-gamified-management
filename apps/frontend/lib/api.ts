const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export interface User {
  id: string
  email: string
  name: string
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

export interface Warehouse {
  id: string
  name: string
  description: string
  address: string
  coordinates: [number, number]
  createdAt?: string
  updatedAt?: string
}

export interface CreateWarehouseData {
  name: string
  description: string
  address: string
  coordinates: [number, number]
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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
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
}
