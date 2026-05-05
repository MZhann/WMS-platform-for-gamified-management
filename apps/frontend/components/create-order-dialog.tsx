"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  orderApi,
  warehouseApi,
  Warehouse,
  OrderType,
  CreateOrderData,
} from "@/lib/api"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { InventoryCombobox } from "@/components/inventory-combobox"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

interface ItemRow {
  typeName: string
  quantity: string
  unitPrice: string
}

const emptyItem = (): ItemRow => ({ typeName: "", quantity: "", unitPrice: "" })

export function CreateOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [orderType, setOrderType] = useState<OrderType>("purchase")
  const [warehouseId, setWarehouseId] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      warehouseApi.getAll().then((r) => {
        setWarehouses(r.warehouses)
        if (r.warehouses.length > 0 && !warehouseId) {
          setWarehouseId(r.warehouses[0].id)
        }
      })
    }
  }, [open])

  function reset() {
    setOrderType("purchase")
    setWarehouseId("")
    setCounterparty("")
    setNotes("")
    setItems([emptyItem()])
    setError(null)
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!warehouseId) { setError(t("createOrder.selectWarehouseError")); return }
    if (!counterparty.trim()) { setError(t("createOrder.counterpartyRequired")); return }

    const parsedItems: CreateOrderData["items"] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.typeName.trim()) { setError(t("createOrder.productNameRequired", { row: i + 1 })); return }
      const qty = parseInt(it.quantity, 10)
      if (!qty || qty < 1) { setError(t("createOrder.quantityMinimum", { row: i + 1 })); return }
      const price = parseFloat(it.unitPrice)
      if (isNaN(price) || price < 0) { setError(t("createOrder.priceMinimum", { row: i + 1 })); return }
      parsedItems.push({ typeName: it.typeName.trim(), quantity: qty, unitPrice: price })
    }

    try {
      setSubmitting(true)
      await orderApi.create({ orderType, warehouseId, counterparty: counterparty.trim(), items: parsedItems, notes })
      reset()
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createOrder.failedToCreate"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createOrder.title")}</DialogTitle>
          <DialogDescription>
            {t("createOrder.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-2">
            {(["purchase", "sales"] as const).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setOrderType(tp)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  orderType === tp
                    ? "border-primary bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent"
                }`}
              >
                {tp === "purchase" ? t("createOrder.purchaseOrder") : t("createOrder.salesOrder")}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>{t("createOrder.warehouse")}</Label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">{t("createOrder.selectWarehouse")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>{orderType === "purchase" ? t("createOrder.supplier") : t("createOrder.customer")}</Label>
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={orderType === "purchase" ? t("createOrder.supplierPlaceholder") : t("createOrder.customerPlaceholder")}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("createOrder.items")}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" /> {t("createOrder.addItem")}
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex gap-2 items-start animate-in fade-in-0 slide-in-from-top-2 duration-200"
                >
                  <InventoryCombobox
                    value={item.typeName}
                    onValueChange={(v) => updateItem(idx, "typeName", v)}
                    placeholder={t("createOrder.selectProduct")}
                    className="flex-[2] h-10"
                    warehouseId={orderType === "sales" ? warehouseId : undefined}
                    restrictToExisting={orderType === "sales"}
                  />
                  <Input
                    type="number"
                    placeholder={t("createOrder.qtyPlaceholder")}
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder={t("createOrder.pricePlaceholder")}
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("createOrder.notesLabel")}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("createOrder.notesPlaceholder")}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive animate-in fade-in-0 duration-150">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("createOrder.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createOrder.createOrder")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
