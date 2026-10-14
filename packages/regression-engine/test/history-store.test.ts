import test from 'node:test';
import assert from 'node:assert';
import { ReplayHistoryStore } from '../src/history-store.ts';
import { STANDARD_ATTACK_SUITE } from '../src/attack-catalog.ts';
import { ReplayRunner } from '../src/replay-runner.ts';
import { createSimulatedGateway } from '../src/simulated-gateway.ts';

test('ReplayHistoryStore saves, lists, retrieves runs, and provides dashboard metrics', async () => {
  const store = new ReplayHistoryStore(':memory:');
  const runner = new ReplayRunner('1.0.0');
  const { evaluator, registry } = await createSimulatedGateway();

  const summary = await runner.runSuite(STANDARD_ATTACK_SUITE, evaluator, {
    runId: 'history-test-run-001',
    policyVersion: '1.0.0'
  });

  await store.saveRun(summary);

  // List runs
  const runs = await store.listRuns();
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].runId, 'history-test-run-001');

  // Retrieve by ID
  const fetched = await store.getRunById('history-test-run-001');
  assert.ok(fetched);
  assert.strictEqual(fetched.passRate, 1.0);

  // Dashboard summary
  const dashboardMetrics = await store.getDashboardSummary();
  assert.strictEqual(dashboardMetrics.totalRuns, 1);
  assert.strictEqual(dashboardMetrics.overallPassRate, 1.0);
  assert.ok(dashboardMetrics.categoryBreakdown.length >= 5);

  store.close();
  registry.close();
});

test('ReplayHistoryStore seedDemoRuns accurately populates demo baseline run', async () => {
  const store = new ReplayHistoryStore(':memory:');
  await store.seedDemoRuns();

  const runs = await store.listRuns();
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].runId, 'demo-run-baseline-01');

  store.close();
});
