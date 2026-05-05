"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { warehouseApi } from "@/lib/api"

interface InventoryComboboxProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Pass extra type names to include (e.g. from a specific warehouse) */
  extraTypeNames?: string[]
  /** Restrict to products available in this warehouse only */
  warehouseId?: string
  /** When true, disables "Create new" option (e.g. for sales orders) */
  restrictToExisting?: boolean
}

let cachedTypeNames: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30_000

async function fetchAllTypeNames(): Promise<string[]> {
  const now = Date.now()
  if (cachedTypeNames && now - cacheTimestamp < CACHE_TTL) {
    return cachedTypeNames
  }
  try {
    const res = await warehouseApi.getAll()
    const names = new Set<string>()
    for (const wh of res.warehouses) {
      for (const item of wh.inventory ?? []) {
        const name = item.typeName.trim()
        if (name) names.add(name)
      }
    }
    cachedTypeNames = Array.from(names).sort()
    cacheTimestamp = now
    return cachedTypeNames
  } catch {
    return cachedTypeNames ?? []
  }
}

export function invalidateTypeNameCache() {
  cachedTypeNames = null
  cacheTimestamp = 0
}

export function InventoryCombobox({
  value,
  onValueChange,
  placeholder = "Select product...",
  className,
  extraTypeNames,
  warehouseId,
  restrictToExisting,
}: InventoryComboboxProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [typeNames, setTypeNames] = useState<string[]>([])
  const [warehouseTypeNames, setWarehouseTypeNames] = useState<string[] | null>(null)
  const [search, setSearch] = useState("")

  const loadTypeNames = useCallback(async () => {
    const names = await fetchAllTypeNames()
    setTypeNames(names)
  }, [])

  useEffect(() => {
    loadTypeNames()
  }, [loadTypeNames])

  useEffect(() => {
    if (!warehouseId) {
      setWarehouseTypeNames(null)
      return
    }
    warehouseApi.getOne(warehouseId).then((res) => {
      const names = (res.warehouse.inventory ?? [])
        .filter((i) => i.count > 0)
        .map((i) => i.typeName.trim())
        .filter(Boolean)
        .sort()
      setWarehouseTypeNames(names)
    }).catch(() => setWarehouseTypeNames(null))
  }, [warehouseId])

  const allNames = (() => {
    const baseNames = warehouseTypeNames !== null ? warehouseTypeNames : typeNames
    const set = new Set(baseNames)
    if (extraTypeNames) {
      for (const n of extraTypeNames) {
        if (n.trim()) set.add(n.trim())
      }
    }
    return Array.from(set).sort()
  })()

  const trimmedSearch = search.trim()
  const showCreateOption =
    !restrictToExisting &&
    trimmedSearch.length > 0 &&
    !allNames.some((n) => n.toLowerCase() === trimmedSearch.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={t("inventory.searchProducts")}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmedSearch
                ? t("inventory.noProductsFound")
                : t("inventory.noProductsAvailable")}
            </CommandEmpty>
            <CommandGroup>
              {allNames.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                  {name}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === name ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
              {showCreateOption && (
                <CommandItem
                  value={trimmedSearch}
                  onSelect={() => {
                    onValueChange(trimmedSearch)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <span className="text-primary font-medium">
                    {t("inventory.createNew", { name: trimmedSearch })}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
