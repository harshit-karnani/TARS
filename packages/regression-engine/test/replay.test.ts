import test from 'node:test';
import assert from 'node:assert';
import { ReplayRunner } from '../src/replay-runner.ts';
import { STANDARD_ATTACK_SUITE } from '../src/attack-catalog.ts';
import { createSimulatedGateway } from '../src/simulated-gateway.ts';

test('ReplayRunner executes full attack suite against simulated gateway with 100% pass rate', async () => {
  const runner = new ReplayRunner('1.0.0');
  const { evaluator, registry } = await createSimulatedGateway();

  const summary = await runner.runSuite(STANDARD_ATTACK_SUITE, evaluator, {
    runId: 'test-run-suite-01',
    policyVersion: '1.0.0'
  });

  assert.strictEqual(summary.totalCases, STANDARD_ATTACK_SUITE.length);
  assert.strictEqual(summary.passedCases, STANDARD_ATTACK_SUITE.length);
  assert.strictEqual(summary.failedCases, 0);
  assert.strictEqual(summary.passRate, 1.0);
  assert.ok(summary.averageLatencyMs >= 0);

  // Verify all result objects have proper structure
  for (const res of summary.results) {
    assert.strictEqual(res.passed, true);
    assert.ok(res.latencyMs >= 0);
    assert.ok(res.timestamp);
    assert.ok(res.actualAction);
  }

  // Category breakdown
  const categoryScores = runner.computeCategoryScores(summary, STANDARD_ATTACK_SUITE);
  assert.ok(categoryScores.length >= 5);
  for (const score of categoryScores) {
    assert.strictEqual(score.passRate, 1.0);
  }

  registry.close();
});

test('ReplayRunner accurately records failure details when policy is bypassed', async () => {
  const runner = new ReplayRunner('1.0.0');

  // Permissive evaluator that allows everything (vulnerable gateway)
  const permissiveEvaluator = async () => ({
    action: 'ALLOW' as const,
    reasonCode: 'POLICY_ALLOW'
  });

  const attackCase = STANDARD_ATTACK_SUITE.find((c) => c.expectedAction === 'BLOCK');
  assert.ok(attackCase);

  const result = await runner.executeCase(attackCase, permissiveEvaluator);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.actualAction, 'ALLOW');
  assert.strictEqual(result.expectedAction, 'BLOCK');
  assert.ok(result.failureDetails?.includes('Expected action BLOCK'));
});
