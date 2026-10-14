# @tars/tool-contracts

The **TARS Tool Contract Firewall & Registry** provides contract-aware security enforcement for Model Context Protocol (MCP) tool executions.

## Key Capabilities

1. **Deterministic Canonical Hashing:**
   Computes reproducible SHA-256 digests over:
   - Server Identity (`serverId`)
   - Tool Name (`toolName` / normalized MCP `name`)
   - Normalized Functional Description (`description`)
   - Recursively Key-Sorted Input Schema (`inputSchema`)

2. **Durable & Ephemeral Registry:**
   - `SqliteContractRegistry`: Built upon native Node.js 24 `node:sqlite` (`DatabaseSync`), offering durable disk or in-memory persistence without npm dependencies.
   - `InMemoryContractRegistry`: Ultra-fast map-based reference implementation for tests and ephemeral runs.

3. **Granular Drift Detection:**
   `checkDrift` compares live/advertised definitions against the registered contract baseline:
   - Identifies description tampering (prompt injection attack vector).
   - Recursively isolates schema differences (`ADDED`, `REMOVED`, `MODIFIED`).
   - Automatically redacts credentials or secrets from diff reports.
   - Automatically transitions active tools into `DRIFTED` state.

4. **Runtime Contract Firewall:**
   `ContractFirewall` evaluates incoming MCP tool calls:
   - Blocks unauthorized or revoked tools (`POLICY_BLOCK`).
   - Rejects calls with schema parameter violations or type confusion (`SCHEMA_MISMATCH`).
   - Requires operator approval for unregistered tools (`UNKNOWN_TOOL`).

## Usage

```typescript
import { SqliteContractRegistry, ContractFirewall, seedStandardContracts } from '@tars/tool-contracts';

// Initialize SQLite registry (disk or memory)
const registry = new SqliteContractRegistry('./tars_contracts.db');

// Seed standard baseline contracts
await seedStandardContracts(registry);

// Check runtime drift on upstream tool discovery
const driftResult = await registry.checkDrift('filesystem-server', 'read_file', {
  description: 'Read file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
});

// Evaluate tool call in Gateway middleware
const firewall = new ContractFirewall(registry);
const decision = await firewall.evaluateToolCall({
  serverId: 'filesystem-server',
  toolName: 'read_file',
  arguments: { path: 'allowed/file.txt' }
});

console.log(decision.action); // 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL'
```
