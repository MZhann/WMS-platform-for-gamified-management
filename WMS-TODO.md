# TODO: WMS Platform – Warehouse Manager Analysis

Tracked items from the warehouse manager analysis. Prioritize based on business needs.

---

## 1. Adding Orders

**Current state:** No purchase orders, sales orders, or shipments. Load/unload is manual, not tied to orders.

**To implement:**
- [x] Purchase orders (PO) – create, approve, receive against PO
- [x] Sales orders – create, fulfill, ship
- [x] Shipments – link to sales orders, track status
- [x] Connect load/unload operations to order lines (receive → load, ship → unload)
- [x] Order status workflow (draft → confirmed → in progress → completed/cancelled)
- [x] Order history and audit trail

---

## 2. Locations / Zones

**Current state:** Inventory is at warehouse level only. No bins, aisles, zones, or putaway strategies.

**To implement:**
- [x] Zone model (e.g. receiving, storage, shipping)
- [x] Aisle/rack structure
- [x] Bin/location model (e.g. A-01-02-03)
- [x] Inventory allocation to locations (what is where)
- [ ] Putaway strategies (random, fixed, ABC)
- [x] Location capacity and utilization

---

## 3. SKU / Barcode

**Current state:** Only `typeName`; no SKU, barcode, or UPC. Hard to integrate with scanners and other systems.

**To implement:**
- [ ] Product/SKU entity with canonical identifier
- [ ] Barcode (EAN-13, UPC, Code128, etc.) and scanning support
- [ ] UPC / external product IDs for integrations
- [ ] Map `typeName` to SKU (migration path)
- [ ] Scanner-friendly APIs (lookup by barcode)
- [ ] Barcode generation for internal products

---

## 4. Lot / Serial Traceability

**Current state:** No expiry, batch, or serial numbers. Risky for food, pharma, and recalls.

**To implement:**
- [ ] Lot/batch numbers per inventory record
- [ ] Serial numbers for high-value items
- [ ] Expiry dates (FEFO support)
- [ ] Lot tracking in flows (load/unload by lot)
- [ ] Recall workflow (identify affected lots, block, report)
- [ ] Traceability report (lot → source → destination)

---

## 5. Picking / Packing Workflows

**Current state:** No pick lists, wave picking, or packing slips.

**To implement:**
- [x] Pick lists – generate from sales orders
- [x] Wave picking – batch multiple orders
- [x] Pick paths – optimize route (when locations exist)
- [x] Packing slips – printable, with order details
- [x] Pick confirmation – validate picked qty vs ordered
- [x] Pack verification and shipping label integration

---

## 6. Unit of Measure (UoM)

**Current state:** Only `count`. No boxes, pallets, kg, etc.

**To implement:**
- [ ] UoM model (each, box, case, pallet, kg, liter, etc.)
- [ ] Product-level UoM and conversion factors (e.g. 1 pallet = 24 boxes)
- [ ] Flow operations in multiple UoMs
- [ ] Inventory display and reports in preferred UoM
- [ ] UoM validation on load/unload

---

## Notes

- Order of implementation should follow dependencies (e.g. SKU before lot traceability, locations before putaway).
- Each section may require schema changes, API changes, and frontend updates.
