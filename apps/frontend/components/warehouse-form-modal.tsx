"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Warehouse } from "@/lib/api"

interface WarehouseFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (warehouse: Omit<Warehouse, "id">) => void
  coordinates: [number, number] | null
}

export function WarehouseFormModal({
  isOpen,
  onClose,
  onSubmit,
  coordinates,
}: WarehouseFormModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [address, setAddress] = useState("")
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)

  useEffect(() => {
    if (!coordinates || !isOpen) return

    setIsLoadingAddress(true)
    const fetchAddress = async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""
        if (!token) {
          setAddress(t("warehouseForm.addressMissingToken"))
          setIsLoadingAddress(false)
          return
        }

        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?access_token=${token}`
        )

        if (!response.ok) {
          throw new Error("Failed to fetch address")
        }

        const data = await response.json()
        if (data.features && data.features.length > 0) {
          setAddress(data.features[0].place_name || t("warehouseForm.addressNotFound"))
        } else {
          setAddress(t("warehouseForm.addressNotFound"))
        }
      } catch (error) {
        console.error("Error fetching address:", error)
        setAddress(t("warehouseForm.addressUnavailable"))
      } finally {
        setIsLoadingAddress(false)
      }
    }

    fetchAddress()
  }, [coordinates, isOpen, t])

  useEffect(() => {
    if (!isOpen) {
      setName("")
      setDescription("")
      setAddress("")
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!coordinates || !name.trim()) return

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      address: address || t("warehouseForm.addressUnavailable"),
      coordinates,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("warehouseForm.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("warehouseForm.createDesc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t("warehouseForm.warehouseName")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("warehouseForm.warehouseNamePlaceholder")}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{t("warehouseForm.description")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("warehouseForm.descriptionPlaceholder")}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">{t("warehouseForm.address")}</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isLoadingAddress ? t("warehouseForm.loadingAddress") : t("warehouseForm.addressAutoFill")}
                disabled={isLoadingAddress}
              />
              {isLoadingAddress && (
                <p className="text-xs text-muted-foreground">{t("warehouseForm.fetchingAddress")}</p>
              )}
            </div>
            {coordinates && (
              <div className="text-xs text-muted-foreground">
                {t("warehouseForm.coordinates")}: {coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("warehouseForm.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoadingAddress}>
              {t("warehouseForm.createWarehouse")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
