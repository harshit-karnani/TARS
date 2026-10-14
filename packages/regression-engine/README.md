# @tars/regression-engine

The **TARS Regression Engine & Attack Replay Runner** evaluates security policies and contract baselines against realistic adversarial threats and regression test cases.

## Key Capabilities

1. **Standard Attack Suite (`STANDARD_ATTACK_SUITE`):**
   14 realistic attack test cases covering:
   - `PATH_TRAVERSAL`: `/etc/passwd`, Windows `..\\..\\`, percent-encoded traversals.
   - `INJECTION`: System prompt overrides, markdown exfiltration tags, delimiter hijackings.
   - `COMMAND_INJECTION`: Semicolon chaining, subshell execution syntax `$()`.
   - `SCHEMA_TAMPER`: Missing required parameters, injected unapproved parameters, type confusion.
   - `PRIVILEGE_ESCALATION`: Direct calls to revoked `bash_exec` and `drop_database`.
   - `REGRESSION`: Legitimate benign file reads and REST calls (regression controls).

2. **Replay Runner (`ReplayRunner`):**
   - Microsecond latency measurement (`performance.now()`).
   - Assertion checks on `actualAction` vs `expectedAction`.
   - Diagnostic failure evidence logging.
   - Category-wise metric scoring.

3. **Regression Trend Analysis (`analyzeRegression`):**
   - Compares current run with historical runs.
   - Flags regressions when a previously passing case fails (`REGRESSION_DETECTED`).
   - Outputs Markdown reports formatted for CLI or audit trails.

4. **Replay History Store (`ReplayHistoryStore`):**
   - SQLite persistence for replay runs and dashboard metric aggregation.
   - Pre-seeded demo datasets for instant UI presentation.

5. **Simulated Gateway Test Harness (`createSimulatedGateway`):**
   - *[Clearly Labeled Demo / Harness]*: Couples `ContractFirewall` and heuristic string pattern matchers for end-to-end replay simulation without requiring upstream server connectivity.

## Usage

```typescript
import { ReplayRunner, STANDARD_ATTACK_SUITE, createSimulatedGateway, ReplayHistoryStore } from '@tars/regression-engine';

const runner = new ReplayRunner('1.0.0');
const { evaluator } = await createSimulatedGateway();

// Execute full attack replay suite
const summary = await runner.runSuite(STANDARD_ATTACK_SUITE, evaluator);
console.log(`Replay Run: ${summary.runId} - Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);

// Store in replay history
const history = new ReplayHistoryStore('./tars_replay.db');
await history.saveRun(summary);
```
