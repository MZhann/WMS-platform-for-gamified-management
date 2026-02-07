"use client"

import { useEffect, useState } from "react"
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
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [address, setAddress] = useState("")
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)

  // Fetch address from coordinates using reverse geocoding
  useEffect(() => {
    if (!coordinates || !isOpen) return

    setIsLoadingAddress(true)
    // Using Mapbox Geocoding API for reverse geocoding
    const fetchAddress = async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""
        if (!token) {
          setAddress("Address unavailable (Mapbox token missing)")
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
          setAddress(data.features[0].place_name || "Address not found")
        } else {
          setAddress("Address not found")
        }
      } catch (error) {
        console.error("Error fetching address:", error)
        setAddress("Address unavailable")
      } finally {
        setIsLoadingAddress(false)
      }
    }

    fetchAddress()
  }, [coordinates, isOpen])

  // Reset form when modal closes
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
      address: address || "Address not available",
      coordinates,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Warehouse</DialogTitle>
          <DialogDescription>
            Add a new warehouse at the selected location on the map.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Warehouse Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter warehouse name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter warehouse description"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isLoadingAddress ? "Loading address..." : "Address will be auto-filled"}
                disabled={isLoadingAddress}
              />
              {isLoadingAddress && (
                <p className="text-xs text-muted-foreground">Fetching address from coordinates...</p>
              )}
            </div>
            {coordinates && (
              <div className="text-xs text-muted-foreground">
                Coordinates: {coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoadingAddress}>
              Create Warehouse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
