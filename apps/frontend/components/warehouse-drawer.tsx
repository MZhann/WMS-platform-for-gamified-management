"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { Warehouse } from "@/lib/api"

export interface Product {
  id: string
  name: string
  quantity: number
  price: number
}

interface WarehouseDrawerProps {
  isOpen: boolean
  onClose: () => void
  warehouse: Warehouse | null
  products: Product[]
}

export function WarehouseDrawer({
  isOpen,
  onClose,
  warehouse,
  products,
}: WarehouseDrawerProps) {
  if (!warehouse) return null

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="flex h-[90vh] max-h-[90vh] flex-col">
        <DrawerHeader className="flex-shrink-0">
          <DrawerTitle className="text-2xl">{warehouse.name}</DrawerTitle>
          <DrawerDescription className="text-base">
            {warehouse.description || "No description available"}
          </DrawerDescription>
          <div className="mt-2 text-sm text-muted-foreground">
            <p>{warehouse.address}</p>
            <p className="mt-1">
              Coordinates: {warehouse.coordinates[1].toFixed(6)}, {warehouse.coordinates[0].toFixed(6)}
            </p>
          </div>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-3">Products</h3>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products in this warehouse</p>
            ) : (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Quantity: {product.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${product.price.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">per unit</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
