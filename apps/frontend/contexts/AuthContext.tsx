"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { User, authApi, getToken, setToken, removeToken } from "@/lib/api"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await authApi.getMe()
        setUser(response.user)
      } catch (error) {
        // Token is invalid, remove it
        removeToken()
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password })
      setToken(response.token)
      setUser(response.user)
      router.push("/")
    } catch (error: any) {
      throw new Error(error.message || "Login failed")
    }
  }

  const register = async (email: string, password: string, name: string) => {
    try {
      const response = await authApi.register({ email, password, name })
      setToken(response.token)
      setUser(response.user)
      router.push("/")
    } catch (error: any) {
      throw new Error(error.message || "Registration failed")
    }
  }

  const logout = () => {
    removeToken()
    setUser(null)
    router.push("/login")
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
