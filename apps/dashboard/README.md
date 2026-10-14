# TARS Security Dashboard (`apps/dashboard`)

A React + Vite + TypeScript + Tailwind CSS application providing real-time security observability, tool contract drift detection, attack replay regression metrics, and auditable policy decision evidence for the TARS MCP security runtime gateway.

---

## Quick Start / Local Demo

### 1. Install Dependencies
```bash
cd apps/dashboard
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
The dashboard starts by default at `http://localhost:5173`.

### 3. Environment Configuration
By default, the dashboard points relative to `/api/*` for reverse-proxy setups. To explicitly point to an external gateway runtime (e.g. on port 3000):
```bash
# In .env or terminal
VITE_API_URL=http://localhost:3000 npm run dev
```

---

## Operating Modes

### Live Gateway Mode
When the TARS Gateway backend is running on `http://localhost:3000`, the dashboard automatically:
- Ingests real-time intercepted MCP tool invocations via Server-Sent Events (`SSE /api/events/stream`).
- Fetches active registered contracts from `GET /api/contracts`.
- Compares canonical hashes and visualizes schema differences via `GET /api/contracts/:serverId/:toolName/drift`.
- Queries security test suite outcomes from `GET /api/replay/runs`.
- Triggers live batch regression evaluations via `POST /api/replay/run`.

### Demonstration / Offline Mode
If the backend is not yet started or temporarily unreachable:
- The dashboard automatically activates **Demonstration Mode**.
- Clearly displayed banners (`MOCK REGISTRY`, `DEMO DATA`, `SIMULATED HARNESS`) inform the user that sample vectors are active.
- Allows full interactive testing of the UI, filters, search, timeline pagination, drift diff inspection, and evidence drawers without a running gateway.

---

## Test & Build Scripts

```bash
# Run Vitest test suite
npm test

# Run TypeScript check and production Vite build
npm run build
```
