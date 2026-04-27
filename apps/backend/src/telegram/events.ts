import { EventEmitter } from "events"

export const wmsEvents = new EventEmitter()
wmsEvents.setMaxListeners(20)

export interface OrderStatusEvent {
  orderId: string
  orderNumber: string
  userId: string
  fromStatus: string
  toStatus: string
  note?: string
}

export interface ShipmentStatusEvent {
  shipmentId: string
  shipmentNumber: string
  orderNumber: string
  userId: string
  fromStatus: string
  toStatus: string
  carrier?: string
  trackingNumber?: string
}

export interface PickListEvent {
  pickListId: string
  pickListNumber: string
  userId: string
  status: string
  itemCount: number
}

export const WMS_EVENTS = {
  ORDER_STATUS_CHANGED: "order:status_changed",
  SHIPMENT_STATUS_CHANGED: "shipment:status_changed",
  PICK_LIST_COMPLETED: "picklist:completed",
} as const
