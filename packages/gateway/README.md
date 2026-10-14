# @tars/gateway — MCP Runtime Security Gateway

Part of **TARS**: A contract-aware runtime security gateway for Model Context Protocol (MCP).

## Architecture & Runtime Flow

```
MCP Client (Claude, Cursor, AGY)
             │
             ▼
     ┌────────────────┐
     │  TARS Gateway  │ ◄─── REST & SSE API (Dashboard / Person 3)
     └───────┬────────┘
             │
     1. Policy Engine ──────► Fail-closed checks:
             │                 • Max payload size (PAYLOAD_TOO_LARGE)
             │                 • Client authorization (UNAUTHORIZED_CLIENT)
             │                 • Path traversal & system paths (SENSITIVE_PATH_ACCESS)
             │                 • Schema & parameter bounds (SCHEMA_MISMATCH / PARAMETER_OUT_OF_BOUNDS)
             │                 • Prompt injection risk signal (heuristics)
             │                 • Explicit allowlists / denylists / approval
             │
     2. Upstream MCP ───────► Dispatched via Stdio transport (Official MCP SDK)
             │
     3. Response Guard ─────► Inspects upstream output, redacts credentials/tokens
             │
     4. SQLite Audit Storage ► Records immutable AuditEvent with latency & evidence
             │
             ▼
     Client Response
```

## Quick Start & Demo

### 1. Build and Run Local Tests
```bash
npm run build
npm run typecheck
npx vitest run
```

### 2. Run the End-to-End Demo
Executes 5 live test scenarios (safe read, path traversal block, dangerous command block, secret redaction, injection heuristic):
```bash
npm --workspace=@tars/gateway run demo
```

### 3. Start the Gateway API Server
```bash
npm --workspace=@tars/gateway run start
```

## Configuration & Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8443` | Gateway HTTP/SSE server port |
| `HOST` | `127.0.0.1` | Local bind address |
| `DB_PATH` | `./tars_audit.sqlite` | SQLite database file path (`:memory:` for transient) |
| `UPSTREAM_COMMAND` | `undefined` | Path to upstream MCP executable (uses simulated handler if empty) |
| `UPSTREAM_ARGS` | `undefined` | Space-separated arguments for upstream command |
| `ENABLE_REDACTION` | `true` | Automatic credential & secret redaction in params and responses |
| `ALLOW_UNKNOWN_TOOLS` | `false` | Fail closed if a tool is not in contracts or policy allowlist |
| `MCP_STDIO_MODE` | `false` | When `true`, runs the gateway over stdio for MCP clients |

## API Routes & Endpoints

All REST responses conform to `ApiResponse<T>`:

- `GET /api/health` — Gateway status, version, and active SSE client count.
- `GET /api/events` — Paginated audit events (`PaginatedResponse<AuditEvent>`).
  - Query parameters: `?tool=read_file&action=ALLOW&limit=50&offset=0`
- `GET /api/events/stream` — Server-Sent Events (SSE) streaming live audit events.
- `GET /api/contracts` — Registered tool contracts list.
- `GET /api/contracts/:serverId/:toolName/drift` — Contract drift verification for a tool.
- `GET /api/replay/runs` — Security attack replay test runs and regression benchmarks.
- `GET /api/policy` — Current active deterministic security policy.
- `POST /api/policy` — Update or toggle security policy rules.
- `POST /api/intercept` — Direct tool call evaluation and execution endpoint.

## Transport Support & Limitations

1. **Supported Transports**:
   - Upstream: Stdio transport using `@modelcontextprotocol/sdk`.
   - Inbound client: Stdio transport (via `McpGatewayServer`) and HTTP/REST (`GatewayApiServer`).
   - Dashboard: Server-Sent Events (SSE) at `/api/events/stream`.
2. **Prompt Injection Risk Signal**:
   - Heuristic risk signal analysis flags high-risk injection patterns and calculates risk scores (0–100) recorded in `DecisionEvidence`. In accordance with security guidelines, this is treated as a risk indicator, not an absolute guarantee.
3. **Approval Flow**:
   - Tool calls requiring human approval (`REQUIRE_APPROVAL`) are suspended and return a non-executing approval challenge until interactive approval is resolved.
