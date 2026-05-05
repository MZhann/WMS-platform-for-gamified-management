# AI Improvements for WMS Platform

Planned AI enhancements to support warehouse operations and analytics.

---

## 1. Demand Forecasting

**Goal:** Reduce overstock and stockouts.

**Approach:** Time-series from flow history + seasonality → predicted demand per `typeName` for next 7–30 days.

**To implement:**
- [x] Aggregate historical unload/outflow by type and time bucket
- [x] Seasonal decomposition (trend, seasonality, residual)
- [x] Simple baseline: moving average, exponential smoothing
- [ ] Optional: Prophet, ARIMA, or small ML model
- [x] API: predicted demand per product for next N days
- [x] Surface in UI: "Expected demand" in inventory/AI advice

---

## 2. Smart Putaway (once locations exist)

**Goal:** Faster putaway, better space use.

**Approach:** AI suggests optimal bin for each received item based on product affinity, turnover, and space.

**To implement:**
- [x] Location/zone model must exist first (see WMS-TODO.md)
- [x] Features: product type, frequency, size, zone type
- [x] Rules: affinity (frequently picked together), turnover (fast movers near shipping)
- [x] Recommendation API: "Where should I put this item?"
- [ ] Optional: reinforcement learning from pick performance over time

---

## 3. NLP for Documents

**Goal:** Easier data entry.

**Approach:** Parse packing slips, invoices, BOL → extract items and quantities into flows.

**To implement:**
- [ ] Document upload (PDF, image) for receipts/shipments
- [ ] OCR (Tesseract, Google Vision, or similar)
- [ ] LLM or NER to extract: vendor, date, line items (SKU/type, qty, price)
- [ ] Mapping to existing `typeName` or SKU (with confidence)
- [ ] Review UI: user confirms extracted data before creating flow
- [ ] Endpoint: POST document → returns proposed flow items

---

## 4. Natural Language Queries

**Goal:** Easier analytics.

**Approach:** "What sold most last month?", "Which warehouse has lowest stock of laptops?" → SQL/aggregations.

**To implement:**
- [ ] Text-to-query: LLM turns question into structured query or aggregation params
- [ ] Query schema: available tables, fields, filters (warehouse, date range, product)
- [ ] Execution: run against analytics API or read replica
- [ ] Response: table or chart + short explanation
- [ ] Chat UI or search bar with natural language input
- [ ] Guardrails: read-only, no destructive actions

---

## 5. Chatbot for Operations

**Goal:** On-the-job help.

**Approach:** Answer "How do I record a damaged shipment?" or "Show me low stock items" via conversational interface.

**To implement:**
- [ ] Operational knowledge base (FAQs, procedures, links to features)
- [ ] RAG: embed docs, retrieve relevant chunks for user question
- [ ] LLM generates answer with citations
- [ ] Action integration: "Show me low stock" → fetch and display real data
- [ ] Multi-turn conversation with context
- [ ] UI: chat widget or dedicated support/help page

---

## Notes

- AI advice (Gemini) is already implemented; these are extensions.
- Consider rate limiting, caching, and cost controls for LLM/API usage.
- Demand forecasting can run as a background job; others are on-demand.
