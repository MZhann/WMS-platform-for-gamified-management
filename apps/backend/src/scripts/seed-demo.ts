/**
 * Demo data seeder — creates a realistic WMS showcase account.
 *
 * Run:  npx tsx src/scripts/seed-demo.ts
 */

import dotenv from "dotenv"
dotenv.config()

import mongoose from "mongoose"
import { connectDatabase } from "../config/database"
import { User } from "../models/User"
import { Warehouse } from "../models/Warehouse"
import { WarehouseFlow } from "../models/WarehouseFlow"
import { Zone, ZONE_TYPE_COLORS, ZoneType } from "../models/Zone"
import { Location } from "../models/Location"
import { Order, generateOrderNumber } from "../models/Order"
import { Shipment, generateShipmentNumber } from "../models/Shipment"

// ── helpers ──────────────────────────────────────────────────
function rng(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[rng(0, arr.length - 1)]
}
function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(rng(7, 18), rng(0, 59), rng(0, 59), 0)
  return d
}

// ── product catalogue ────────────────────────────────────────
const PRODUCTS = [
  // Fast movers (high turnover)
  { name: "iPhone 15 Pro",       basePrice: 999,  dailyDemand: 25, dailySupply: 20, category: "electronics" },
  { name: "Samsung Galaxy S24",  basePrice: 849,  dailyDemand: 20, dailySupply: 18, category: "electronics" },
  { name: "AirPods Pro",         basePrice: 249,  dailyDemand: 40, dailySupply: 35, category: "electronics" },
  { name: "USB-C Cable 1m",      basePrice: 12,   dailyDemand: 80, dailySupply: 90, category: "accessories" },
  // Medium movers
  { name: "MacBook Air M3",      basePrice: 1299, dailyDemand: 8,  dailySupply: 7,  category: "electronics" },
  { name: "Sony WH-1000XM5",    basePrice: 348,  dailyDemand: 12, dailySupply: 10, category: "electronics" },
  { name: "Logitech MX Master",  basePrice: 99,   dailyDemand: 15, dailySupply: 14, category: "accessories" },
  { name: "Anker PowerBank 20K", basePrice: 45,   dailyDemand: 18, dailySupply: 16, category: "accessories" },
  // Slow movers / seasonal
  { name: "Standing Desk Oak",   basePrice: 599,  dailyDemand: 3,  dailySupply: 5,  category: "furniture" },
  { name: "Ergonomic Chair Pro", basePrice: 449,  dailyDemand: 4,  dailySupply: 6,  category: "furniture" },
  { name: "LED Desk Lamp",       basePrice: 79,   dailyDemand: 6,  dailySupply: 8,  category: "furniture" },
  // Critical risk items (demand >> supply, low stock)
  { name: "iPad Air M2",         basePrice: 599,  dailyDemand: 15, dailySupply: 5,  category: "electronics" },
  { name: "Nintendo Switch OLED",basePrice: 349,  dailyDemand: 18, dailySupply: 6,  category: "electronics" },
  // Overstocked items (supply >> demand)
  { name: "HDMI Cable 2m",       basePrice: 15,   dailyDemand: 5,  dailySupply: 25, category: "accessories" },
  { name: "Screen Protector",    basePrice: 8,    dailyDemand: 10, dailySupply: 30, category: "accessories" },
  { name: "Phone Case Universal",basePrice: 18,   dailyDemand: 8,  dailySupply: 20, category: "accessories" },
]

const SUPPLIERS = ["TechDist Inc.", "GlobalParts Co.", "MegaSupply Ltd.", "DirectSource", "PrimeTech Wholesale"]
const CUSTOMERS = ["BestBuy Online", "Amazon FBA", "TechShop EU", "RetailMax", "Digital World", "GadgetZone", "SmartBuy"]

// ── zone templates for ergonomic layout ──────────────────────
const ZONE_TEMPLATES: { name: string; code: string; type: ZoneType; x: number; y: number; w: number; h: number; aisles: number; racksPerAisle: number; capacityPerSlot: number }[] = [
  { name: "Receiving Dock",    code: "RCV",  type: "receiving",    x: 0,  y: 0,  w: 5,  h: 3, aisles: 2, racksPerAisle: 3, capacityPerSlot: 200 },
  { name: "Returns Processing",code: "RET",  type: "returns",      x: 0,  y: 4,  w: 4,  h: 2, aisles: 2, racksPerAisle: 2, capacityPerSlot: 100 },
  { name: "Cold Storage",      code: "COLD", type: "cold_storage", x: 0,  y: 7,  w: 4,  h: 3, aisles: 2, racksPerAisle: 3, capacityPerSlot: 80 },
  { name: "Main Storage A",    code: "STA",  type: "storage",      x: 6,  y: 0,  w: 5,  h: 5, aisles: 4, racksPerAisle: 5, capacityPerSlot: 150 },
  { name: "Main Storage B",    code: "STB",  type: "storage",      x: 6,  y: 6,  w: 5,  h: 4, aisles: 3, racksPerAisle: 5, capacityPerSlot: 150 },
  { name: "Staging Area",      code: "STG",  type: "staging",      x: 12, y: 0,  w: 4,  h: 3, aisles: 2, racksPerAisle: 3, capacityPerSlot: 120 },
  { name: "Shipping Dock",     code: "SHIP", type: "shipping",     x: 12, y: 4,  w: 5,  h: 4, aisles: 3, racksPerAisle: 4, capacityPerSlot: 180 },
]

// ── main ─────────────────────────────────────────────────────
async function seed() {
  await connectDatabase()
  console.log("🌱 Starting demo data seed...")

  // 1. Create or find user
  const email = "demo@wms.com"
  const password = "Demo1234"
  let user = await User.findOne({ email })
  if (user) {
    console.log("  ↳ User demo@wms.com already exists — wiping old data & resetting password")
    await WarehouseFlow.deleteMany({ performedBy: user._id })
    await Location.deleteMany({ userId: user._id })
    await Zone.deleteMany({ userId: user._id })
    await Shipment.deleteMany({ userId: user._id })
    await Order.deleteMany({ userId: user._id })
    await Warehouse.deleteMany({ userId: user._id })
    const userWithPw = await User.findById(user._id).select("+password")
    if (userWithPw) {
      userWithPw.password = password
      await userWithPw.save()
    }
  } else {
    user = await User.create({ email, password, name: "Demo Manager" })
    console.log(`  ✅ Created user demo@wms.com / ${password}`)
  }

  // 2. Create warehouses
  const wh1 = await Warehouse.create({
    name: "TechHub Central",
    description: "Primary distribution center for electronics and accessories. High-volume fulfillment hub.",
    address: "1200 Commerce Blvd, Austin, TX 78701",
    coordinates: { lat: 30.2672, lng: -97.7431 },
    userId: user._id,
    inventory: [],
  })
  const wh2 = await Warehouse.create({
    name: "WestCoast Fulfillment",
    description: "Secondary warehouse for west coast distribution and overflow storage.",
    address: "500 Harbor Dr, Long Beach, CA 90802",
    coordinates: { lat: 33.7701, lng: -118.1937 },
    userId: user._id,
    inventory: [],
  })
  console.log(`  ✅ Created warehouses: ${wh1.name}, ${wh2.name}`)

  // 3. Create zones + locations for warehouse 1
  const zoneIds: mongoose.Types.ObjectId[] = []
  const allLocationIds: mongoose.Types.ObjectId[] = []

  for (const zt of ZONE_TEMPLATES) {
    const zone = await Zone.create({
      ...zt,
      warehouseId: wh1._id,
      userId: user._id,
      color: ZONE_TYPE_COLORS[zt.type],
    })
    zoneIds.push(zone._id)

    const locs: any[] = []
    for (let a = 1; a <= zt.aisles; a++) {
      for (let r = 1; r <= zt.racksPerAisle; r++) {
        locs.push({
          warehouseId: wh1._id,
          zoneId: zone._id,
          userId: user._id,
          code: `${zt.code}-A${String(a).padStart(2, "0")}-R${String(r).padStart(2, "0")}`,
          aisle: `A${String(a).padStart(2, "0")}`,
          rack: `R${String(r).padStart(2, "0")}`,
          maxCapacity: zt.capacityPerSlot,
          inventory: [],
          status: "active",
        })
      }
    }
    const created = await Location.insertMany(locs)
    allLocationIds.push(...created.map(l => l._id))
  }
  console.log(`  ✅ Created ${ZONE_TEMPLATES.length} zones, ${allLocationIds.length} locations`)

  // 4. Generate 90 days of realistic flow history
  const DAYS = 90
  const inventoryMap = new Map<string, number>()
  const flowDocs: any[] = []

  for (let day = DAYS; day >= 0; day--) {
    const date = daysAgo(day)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const weekMultiplier = isWeekend ? 0.4 : 1.0

    // seasonal: demand spikes in last 30 days (holiday season simulation)
    const seasonMultiplier = day <= 30 ? 1.3 : day <= 60 ? 1.0 : 0.8

    for (const product of PRODUCTS) {
      // Supply (loads) — typically 2-4 times per week per product
      if (Math.random() < (isWeekend ? 0.15 : 0.5)) {
        const variance = 0.5 + Math.random()
        const qty = Math.max(1, Math.round(product.dailySupply * variance * weekMultiplier))
        const price = Math.round(product.basePrice * (0.55 + Math.random() * 0.15) * 100) / 100

        flowDocs.push({
          warehouseId: wh1._id,
          operation: "load" as const,
          items: [{ typeName: product.name, count: qty, unitPrice: price }],
          performedBy: user._id,
          createdAt: new Date(date.getTime() + rng(0, 3) * 3600000),
        })

        inventoryMap.set(product.name, (inventoryMap.get(product.name) ?? 0) + qty)
      }

      // Demand (unloads) — driven by dailyDemand with seasonality
      if (Math.random() < (isWeekend ? 0.3 : 0.65)) {
        const variance = 0.4 + Math.random() * 0.8
        let qty = Math.max(1, Math.round(product.dailyDemand * variance * weekMultiplier * seasonMultiplier))
        const currentStock = inventoryMap.get(product.name) ?? 0
        qty = Math.min(qty, currentStock)
        if (qty <= 0) continue

        const price = Math.round(product.basePrice * (0.9 + Math.random() * 0.2) * 100) / 100

        flowDocs.push({
          warehouseId: wh1._id,
          operation: "unload" as const,
          items: [{ typeName: product.name, count: qty, unitPrice: price }],
          performedBy: user._id,
          createdAt: new Date(date.getTime() + rng(4, 10) * 3600000),
        })

        inventoryMap.set(product.name, currentStock - qty)
      }

      // Multi-item flows (bundles) — ~10% of days
      if (!isWeekend && Math.random() < 0.1) {
        const bundlePartner = pick(PRODUCTS.filter(p => p.category === product.category && p.name !== product.name))
        if (bundlePartner) {
          const qty1 = rng(1, 5)
          const qty2 = rng(1, 5)
          const stock1 = inventoryMap.get(product.name) ?? 0
          const stock2 = inventoryMap.get(bundlePartner.name) ?? 0
          if (stock1 >= qty1 && stock2 >= qty2) {
            flowDocs.push({
              warehouseId: wh1._id,
              operation: "unload" as const,
              items: [
                { typeName: product.name, count: qty1, unitPrice: product.basePrice },
                { typeName: bundlePartner.name, count: qty2, unitPrice: bundlePartner.basePrice },
              ],
              performedBy: user._id,
              createdAt: new Date(date.getTime() + rng(8, 14) * 3600000),
            })
            inventoryMap.set(product.name, stock1 - qty1)
            inventoryMap.set(bundlePartner.name, stock2 - qty2)
          }
        }
      }
    }
  }

  // Batch insert flows
  const BATCH = 500
  for (let i = 0; i < flowDocs.length; i += BATCH) {
    await WarehouseFlow.insertMany(flowDocs.slice(i, i + BATCH))
  }
  console.log(`  ✅ Created ${flowDocs.length} flow operations over ${DAYS} days`)

  // 5. Set final warehouse inventory from computed map
  wh1.inventory = Array.from(inventoryMap.entries())
    .filter(([, count]) => count > 0)
    .map(([typeName, count]) => ({ typeName, count }))
  await wh1.save()
  console.log(`  ✅ Warehouse inventory: ${wh1.inventory.length} types, ${wh1.inventory.reduce((s, i) => s + i.count, 0)} total items`)

  // 6. Distribute inventory to locations
  const locations = await Location.find({ warehouseId: wh1._id, status: "active" }).sort({ code: 1 })
  const storageLocations = locations.filter(l => {
    const zone = ZONE_TEMPLATES.find(zt => l.code.startsWith(zt.code))
    return zone && (zone.type === "storage" || zone.type === "staging")
  })

  for (const item of wh1.inventory) {
    let remaining = item.count
    const locs = [...storageLocations].sort(() => Math.random() - 0.5)
    for (const loc of locs) {
      if (remaining <= 0) break
      const currentItems = (loc.inventory || []).reduce((s, i) => s + i.count, 0)
      const space = loc.maxCapacity - currentItems
      if (space <= 0) continue
      const qty = Math.min(remaining, Math.min(space, rng(5, Math.min(50, space))))
      loc.inventory.push({ typeName: item.typeName, count: qty })
      remaining -= qty
    }
  }
  for (const loc of storageLocations) {
    if (loc.inventory.length > 0) await loc.save()
  }
  console.log(`  ✅ Distributed inventory across ${storageLocations.length} storage locations`)

  // 7. Create realistic orders
  const orderDocs: any[] = []

  // Recent purchase orders
  for (let i = 0; i < 8; i++) {
    const product = pick(PRODUCTS)
    const supplier = pick(SUPPLIERS)
    const qty = rng(20, 100)
    const statuses: ("draft" | "confirmed" | "in_progress" | "completed")[] = ["draft", "confirmed", "in_progress", "completed"]
    const status = pick(statuses)

    const orderNumber = await generateOrderNumber("purchase")
    const createdAt = daysAgo(rng(1, 30))

    orderDocs.push({
      orderNumber,
      orderType: "purchase",
      status,
      warehouseId: wh1._id,
      userId: user._id,
      counterparty: supplier,
      items: [{
        typeName: product.name,
        quantity: qty,
        unitPrice: Math.round(product.basePrice * 0.6 * 100) / 100,
        fulfilledQty: status === "completed" ? qty : status === "in_progress" ? Math.floor(qty * 0.6) : 0,
      }],
      notes: `Restock order for ${product.name}`,
      audit: [{
        action: "created",
        toStatus: "draft",
        performedBy: user._id,
        timestamp: createdAt,
      }],
      createdAt,
    })
  }

  // Recent sales orders
  for (let i = 0; i < 12; i++) {
    const numItems = rng(1, 3)
    const items: any[] = []
    const usedProducts = new Set<string>()
    for (let j = 0; j < numItems; j++) {
      let product = pick(PRODUCTS)
      while (usedProducts.has(product.name)) product = pick(PRODUCTS)
      usedProducts.add(product.name)
      const qty = rng(5, 30)
      const statuses: ("draft" | "confirmed" | "in_progress" | "completed")[] = ["draft", "confirmed", "in_progress", "completed"]
      const status = pick(statuses)
      items.push({
        typeName: product.name,
        quantity: qty,
        unitPrice: product.basePrice,
        fulfilledQty: status === "completed" ? qty : 0,
      })
    }

    const customer = pick(CUSTOMERS)
    const statuses: ("draft" | "confirmed" | "in_progress" | "completed")[] = ["draft", "confirmed", "in_progress", "completed"]
    const status = pick(statuses)
    const orderNumber = await generateOrderNumber("sales")
    const createdAt = daysAgo(rng(1, 20))

    orderDocs.push({
      orderNumber,
      orderType: "sales",
      status,
      warehouseId: wh1._id,
      userId: user._id,
      counterparty: customer,
      items,
      notes: `Fulfillment for ${customer}`,
      audit: [{
        action: "created",
        toStatus: "draft",
        performedBy: user._id,
        timestamp: createdAt,
      }],
      createdAt,
    })
  }

  await Order.insertMany(orderDocs)
  console.log(`  ✅ Created ${orderDocs.length} orders (${orderDocs.filter(o => o.orderType === "purchase").length} PO, ${orderDocs.filter(o => o.orderType === "sales").length} SO)`)

  // 8. Create shipments for some completed/in-progress sales orders
  const salesOrders = await Order.find({ userId: user._id, orderType: "sales", status: { $in: ["in_progress", "completed"] } })
  let shipmentsCreated = 0

  for (const order of salesOrders.slice(0, 6)) {
    const shipmentNumber = await generateShipmentNumber()
    const carriers = ["FedEx", "UPS", "DHL", "USPS"]
    const statusOptions: ("pending" | "picking" | "picked" | "packed" | "shipped" | "delivered")[] =
      ["pending", "picking", "picked", "packed", "shipped", "delivered"]
    const status = pick(statusOptions)

    await Shipment.create({
      shipmentNumber,
      orderId: order._id,
      orderNumber: order.orderNumber,
      warehouseId: wh1._id,
      userId: user._id,
      status,
      carrier: pick(carriers),
      trackingNumber: status !== "pending" ? `${rng(100000, 999999)}${rng(100000, 999999)}` : "",
      items: order.items.map((item: any) => ({
        typeName: item.typeName,
        quantity: item.quantity,
        pickedQty: ["picked", "packed", "shipped", "delivered"].includes(status) ? item.quantity : 0,
        packedQty: ["packed", "shipped", "delivered"].includes(status) ? item.quantity : 0,
      })),
      shippedAt: ["shipped", "delivered"].includes(status) ? daysAgo(rng(1, 5)) : null,
      deliveredAt: status === "delivered" ? daysAgo(rng(0, 2)) : null,
      notes: "",
      audit: [{
        action: "created",
        toStatus: "pending",
        performedBy: user._id,
        timestamp: order.createdAt,
      }],
    })
    shipmentsCreated++
  }
  console.log(`  ✅ Created ${shipmentsCreated} shipments`)

  // 9. Small dataset for warehouse 2
  const wh2Products = PRODUCTS.slice(0, 6)
  const wh2Flows: any[] = []
  const wh2Inv = new Map<string, number>()

  for (let day = 60; day >= 0; day--) {
    for (const p of wh2Products) {
      if (Math.random() < 0.3) {
        const qty = rng(5, 20)
        wh2Flows.push({
          warehouseId: wh2._id,
          operation: "load",
          items: [{ typeName: p.name, count: qty, unitPrice: Math.round(p.basePrice * 0.6 * 100) / 100 }],
          performedBy: user._id,
          createdAt: daysAgo(day),
        })
        wh2Inv.set(p.name, (wh2Inv.get(p.name) ?? 0) + qty)
      }
      if (Math.random() < 0.25) {
        const stock = wh2Inv.get(p.name) ?? 0
        const qty = Math.min(rng(3, 15), stock)
        if (qty > 0) {
          wh2Flows.push({
            warehouseId: wh2._id,
            operation: "unload",
            items: [{ typeName: p.name, count: qty, unitPrice: p.basePrice }],
            performedBy: user._id,
            createdAt: new Date(daysAgo(day).getTime() + 6 * 3600000),
          })
          wh2Inv.set(p.name, stock - qty)
        }
      }
    }
  }

  if (wh2Flows.length > 0) await WarehouseFlow.insertMany(wh2Flows)
  wh2.inventory = Array.from(wh2Inv.entries()).filter(([, c]) => c > 0).map(([typeName, count]) => ({ typeName, count }))
  await wh2.save()
  console.log(`  ✅ Warehouse 2: ${wh2Flows.length} flows, ${wh2.inventory.length} types`)

  // Done
  const totalFlows = flowDocs.length + wh2Flows.length
  console.log("\n🎉 Demo data seeded successfully!")
  console.log("─────────────────────────────────")
  console.log(`   Account:     demo@wms.com / Demo1234`)
  console.log(`   Warehouses:  2`)
  console.log(`   Zones:       ${ZONE_TEMPLATES.length}`)
  console.log(`   Locations:   ${allLocationIds.length}`)
  console.log(`   Flows:       ${totalFlows}`)
  console.log(`   Orders:      ${orderDocs.length}`)
  console.log(`   Shipments:   ${shipmentsCreated}`)
  console.log("─────────────────────────────────")

  await mongoose.disconnect()
  process.exit(0)
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})
