"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Zone, ZONE_TYPE_LABELS } from "@/lib/api"

const CELL_SIZE = 38
const MIN_COLS = 20
const MIN_ROWS = 14

interface FloorPlanProps {
  zones: Zone[]
  selectedZoneId: string | null
  onCellClick: (col: number, row: number, zoneId: string | null) => void
}

export function WarehouseFloorPlan({ zones, selectedZoneId, onCellClick }: FloorPlanProps) {
  const { t } = useTranslation()
  const { cols, rows, grid, zoneCenters } = useMemo(() => {
    let maxCol = MIN_COLS
    let maxRow = MIN_ROWS
    for (const z of zones) {
      maxCol = Math.max(maxCol, z.x + z.w + 1)
      maxRow = Math.max(maxRow, z.y + z.h + 1)
    }

    const c = maxCol
    const r = maxRow

    const g: (Zone | null)[][] = Array.from({ length: r }, () => Array(c).fill(null))
    for (const z of zones) {
      for (let dy = 0; dy < z.h; dy++) {
        for (let dx = 0; dx < z.w; dx++) {
          const gy = z.y + dy
          const gx = z.x + dx
          if (gy < r && gx < c) g[gy][gx] = z
        }
      }
    }

    const centers = zones.map((z) => ({
      id: z.id,
      label: z.name,
      subLabel: t("zoneTypes." + z.type),
      stats:
        z.locationCount != null
          ? t("floorPlan.slots", { count: z.locationCount ?? 0 })
          : "",
      cx: z.x * CELL_SIZE + (z.w * CELL_SIZE) / 2,
      cy: z.y * CELL_SIZE + (z.h * CELL_SIZE) / 2,
    }))

    return { cols: c, rows: r, grid: g, zoneCenters: centers }
  }, [zones, t])

  return (
    <div className="overflow-auto rounded-lg border border-border bg-muted/30 p-3">
      <div className="relative" style={{ width: cols * CELL_SIZE, height: rows * CELL_SIZE }}>
        {/* Grid cells */}
        <div
          className="grid gap-[1px]"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE - 1}px)`,
            gridTemplateRows: `repeat(${rows}, ${CELL_SIZE - 1}px)`,
          }}
        >
          {Array.from({ length: rows * cols }).map((_, idx) => {
            const row = Math.floor(idx / cols)
            const col = idx % cols
            const zone = grid[row][col]
            const isSelected = zone?.id === selectedZoneId

            return (
              <div
                key={idx}
                className="cursor-pointer transition-all duration-100"
                style={{
                  width: CELL_SIZE - 1,
                  height: CELL_SIZE - 1,
                  borderRadius: 3,
                  backgroundColor: zone
                    ? isSelected
                      ? zone.color
                      : `${zone.color}99`
                    : "transparent",
                  border: zone
                    ? isSelected
                      ? `2px solid ${zone.color}`
                      : `1px solid ${zone.color}66`
                    : "1px solid hsl(var(--border) / 0.3)",
                  boxShadow: isSelected ? `0 0 0 2px ${zone?.color}44` : "none",
                }}
                onClick={() => onCellClick(col, row, zone?.id ?? null)}
                title={
                  zone
                    ? `${zone.name} (${t("zoneTypes." + zone.type)})`
                    : t("floorPlan.emptyCell", { col, row })
                }
              />
            )
          })}
        </div>

        {/* Zone labels overlay */}
        {zoneCenters.map((zc) => (
          <div
            key={zc.id}
            className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
            style={{
              left: zones.find((z) => z.id === zc.id)!.x * CELL_SIZE,
              top: zones.find((z) => z.id === zc.id)!.y * CELL_SIZE,
              width: zones.find((z) => z.id === zc.id)!.w * CELL_SIZE,
              height: zones.find((z) => z.id === zc.id)!.h * CELL_SIZE,
            }}
          >
            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {zc.label}
            </span>
            <span className="text-[10px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {zc.subLabel}
            </span>
            {zc.stats && (
              <span className="mt-0.5 text-[10px] text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {zc.stats}
              </span>
            )}
          </div>
        ))}

        {/* Axis labels */}
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={`col-${c}`}
            className="pointer-events-none absolute text-[9px] text-muted-foreground/50 text-center"
            style={{ left: c * CELL_SIZE, top: -14, width: CELL_SIZE }}
          >
            {c}
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`row-${r}`}
            className="pointer-events-none absolute text-[9px] text-muted-foreground/50"
            style={{ left: -16, top: r * CELL_SIZE + CELL_SIZE / 2 - 6, width: 14, textAlign: "right" }}
          >
            {r}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FloorPlanLegend() {
  const { t } = useTranslation()
  const typeKeys = Object.keys(ZONE_TYPE_LABELS) as (keyof typeof ZONE_TYPE_LABELS)[]
  const colors: Record<string, string> = {
    receiving: "#3b82f6",
    storage: "#22c55e",
    shipping: "#f97316",
    staging: "#eab308",
    cold_storage: "#06b6d4",
    returns: "#ef4444",
  }

  return (
    <div className="flex flex-wrap gap-3">
      {typeKeys.map((key) => (
        <div key={key} className="flex items-center gap-1.5">
          <div
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: colors[key] }}
          />
          <span className="text-xs text-muted-foreground">
            {t("zoneTypes." + key)}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-sm border border-border bg-transparent" />
        <span className="text-xs text-muted-foreground">{t("locations.empty")}</span>
      </div>
    </div>
  )
}
