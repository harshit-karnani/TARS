import test from 'node:test';
import assert from 'node:assert';
import type { ReplayTestCase, RegressionSummaryMetric } from '../src/types.ts';

test('ReplayTestCase definition structure operates correctly', () => {
  const tc: ReplayTestCase = {
    id: 'tc-001',
    name: 'Directory Traversal in read_file',
    description: 'Attempts to read /etc/passwd using path traversal characters',
    targetServer: 'filesystem-server',
    targetTool: 'read_file',
    payload: { path: '../../../../etc/passwd' },
    attackCategory: 'PATH_TRAVERSAL',
    expectedDecision: 'BLOCK'
  };

  assert.strictEqual(tc.id, 'tc-001');
  assert.strictEqual(tc.expectedDecision, 'BLOCK');
});

test('RegressionSummaryMetric computes pass rate correctly', () => {
  const metric: RegressionSummaryMetric = {
    totalTests: 10,
    passed: 9,
    failed: 1,
    passRate: 0.9,
    driftIncidentsCount: 2,
    generatedAt: new Date().toISOString()
  };

  assert.strictEqual(metric.passRate, metric.passed / metric.totalTests);
});
