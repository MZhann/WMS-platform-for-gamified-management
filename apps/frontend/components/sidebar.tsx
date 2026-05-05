"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { 
  LayoutDashboard, 
  User, 
  BarChart3, 
  Settings, 
  HelpCircle,
  MapPin,
  LogOut,
  Shield,
  Warehouse,
  ClipboardList,
  MapPinned,
  Truck,
  PackageSearch,
  Globe,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"

const navigation = [
  { nameKey: "nav.map", href: "/", icon: MapPin },
  { nameKey: "nav.warehouses", href: "/warehouses", icon: Warehouse },
  { nameKey: "nav.orders", href: "/orders", icon: ClipboardList },
  { nameKey: "nav.shipments", href: "/shipments", icon: Truck },
  { nameKey: "nav.picking", href: "/picking", icon: PackageSearch },
  { nameKey: "nav.locations", href: "/locations", icon: MapPinned },
  { nameKey: "nav.profile", href: "/profile", icon: User },
  { nameKey: "nav.monitoring", href: "/monitoring", icon: LayoutDashboard },
  { nameKey: "nav.analytics", href: "/analytics", icon: BarChart3 },
  { nameKey: "nav.settings", href: "/settings", icon: Settings },
  { nameKey: "nav.support", href: "/support", icon: HelpCircle },
  { nameKey: "nav.admin", href: "/admin", icon: Shield, adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    const nextLang = i18n.language === "ru" ? "en" : "ru"
    i18n.changeLanguage(nextLang)
  }

  return (
    <div className="flex h-screen w-64 flex-col bg-card border-r border-border">
      <div className="flex h-16 items-center border-b border-border px-6">
        <h1 className="text-xl font-bold text-foreground">{t("app.title")}</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          if ("adminOnly" in item && item.adminOnly && !user?.isAdmin) return null
          const isActive = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.nameKey}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {t(item.nameKey)}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="flex-1 justify-start"
            onClick={logout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("nav.logout")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleLanguage}
            title={i18n.language === "ru" ? "Switch to English" : "Переключить на русский"}
            className="shrink-0"
          >
            <Globe className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
