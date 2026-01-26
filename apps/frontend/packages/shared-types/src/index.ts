export interface Warehouse {
  id: string
  name: string
  description: string
  lat: number
  lng: number
}

export interface Product {
  id: string
  name: string
  quantity: number
  buyPrice: number
  sellPrice: number
}
