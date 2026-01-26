"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { WarehouseFormModal } from "@/components/warehouse-form-modal"
import { WarehouseDrawer, Product } from "@/components/warehouse-drawer"
import { ProtectedRoute } from "@/components/protected-route"
import { warehouseApi, Warehouse as ApiWarehouse } from "@/lib/api"

// Alias for compatibility
type Warehouse = ApiWarehouse

// Almaty coordinates
const ALMATY_CENTER: [number, number] = [76.9126, 43.2220]

// Generate fake products for a warehouse
function generateFakeProducts(warehouseId: string): Product[] {
  const productNames = [
    "Laptop Computer",
    "Wireless Mouse",
    "Mechanical Keyboard",
    "USB-C Cable",
    "Monitor 27 inch",
    "Webcam HD",
    "Headphones",
    "External Hard Drive",
    "SSD 1TB",
    "RAM 16GB",
    "Graphics Card",
    "Power Adapter",
  ]

  const count = Math.floor(Math.random() * 8) + 3 // 3-10 products
  const selectedProducts = productNames
    .sort(() => Math.random() - 0.5)
    .slice(0, count)

  return selectedProducts.map((name, index) => ({
    id: `${warehouseId}-product-${index}`,
    name,
    quantity: Math.floor(Math.random() * 500) + 10,
    price: Math.floor(Math.random() * 500) + 20,
  }))
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clickedCoordinates, setClickedCoordinates] = useState<[number, number] | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [warehouseProducts, setWarehouseProducts] = useState<Record<string, Product[]>>({})
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)

  // Load warehouses from backend on mount
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setLoadingWarehouses(true)
        const response = await warehouseApi.getAll()
        setWarehouses(response.warehouses)
      } catch (error) {
        console.error("Failed to load warehouses:", error)
      } finally {
        setLoadingWarehouses(false)
      }
    }

    loadWarehouses()
  }, [])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    // Initialize map
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""
    mapboxgl.accessToken = token
    
    if (!token) {
      setMapError("Mapbox token is missing. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your .env.local file")
      console.error("Mapbox token is missing. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your .env.local file")
      return
    }

    // Wait a bit to ensure container is fully rendered
    const initMap = () => {
      if (!mapContainer.current) return

      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: ALMATY_CENTER,
          zoom: 12,
        })

        // Handle map clicks
        map.current.on("click", (e) => {
          const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          setClickedCoordinates(coords)
          setIsModalOpen(true)
        })

        // Handle map load
        map.current.on("load", () => {
          setMapError(null)
        })

        // Handle map errors
        map.current.on("error", (e) => {
          console.error("Map error:", e)
          setMapError("Failed to load map. Please check your Mapbox token.")
        })
      } catch (error) {
        console.error("Error initializing map:", error)
        setMapError("Failed to initialize map. Please check your Mapbox token.")
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initMap, 100)

    return () => {
      clearTimeout(timer)
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Add markers when warehouses change
  useEffect(() => {
    if (!map.current) return

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Add new markers
    warehouses.forEach((warehouse) => {
      const el = document.createElement("div")
      el.className = "warehouse-marker"
      el.style.width = "30px"
      el.style.height = "30px"
      el.style.borderRadius = "50%"
      el.style.backgroundColor = "#3b82f6"
      el.style.border = "3px solid white"
      el.style.cursor = "pointer"
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)"

      // Generate products for this warehouse if not already generated
      if (!warehouseProducts[warehouse.id]) {
        setWarehouseProducts((prev) => ({
          ...prev,
          [warehouse.id]: generateFakeProducts(warehouse.id),
        }))
      }

      const marker = new mapboxgl.Marker(el)
        .setLngLat(warehouse.coordinates)
        .addTo(map.current!)

      // Handle marker click to open drawer
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelectedWarehouse(warehouse)
        setIsDrawerOpen(true)
      })

      markersRef.current.push(marker)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses])

  const handleWarehouseSubmit = async (warehouse: Omit<Warehouse, "id">) => {
    try {
      // Save to backend
      const response = await warehouseApi.create({
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: warehouse.coordinates,
      })

      // Add to local state
      setWarehouses((prev) => [...prev, response.warehouse])
      
      // Generate products for the new warehouse
      setWarehouseProducts((prev) => ({
        ...prev,
        [response.warehouse.id]: generateFakeProducts(response.warehouse.id),
      }))
      
      setIsModalOpen(false)
      setClickedCoordinates(null)
    } catch (error: any) {
      console.error("Failed to create warehouse:", error)
      alert(error.message || "Failed to create warehouse. Please try again.")
    }
  }

  return (
    <ProtectedRoute>
      <div className="relative w-full" style={{ height: "calc(100vh - 0px)" }}>
        <div ref={mapContainer} className="h-full w-full" />
        {mapError && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-red-500 text-white p-4 rounded-lg shadow-lg max-w-md">
            <p className="font-semibold">Map Error</p>
            <p className="text-sm">{mapError}</p>
          </div>
        )}
        <WarehouseFormModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setClickedCoordinates(null)
          }}
          onSubmit={handleWarehouseSubmit}
          coordinates={clickedCoordinates}
        />
        <WarehouseDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false)
            setSelectedWarehouse(null)
          }}
          warehouse={selectedWarehouse}
          products={selectedWarehouse ? warehouseProducts[selectedWarehouse.id] || [] : []}
        />
      </div>
    </ProtectedRoute>
  )
}
