import test from 'node:test';
import assert from 'node:assert';
import { analyzeRegression, formatReportMarkdown } from '../src/metrics.ts';
import { STANDARD_ATTACK_SUITE } from '../src/attack-catalog.ts';
import type { ReplayRunSummary } from '../src/types.ts';

test('analyzeRegression detects newly introduced regressions between runs', () => {
  const previousRun: ReplayRunSummary = {
    runId: 'run-1',
    timestamp: '2026-10-14T10:00:00Z',
    policyVersion: '1.0.0',
    totalCases: 2,
    passedCases: 2,
    failedCases: 0,
    passRate: 1.0,
    averageLatencyMs: 2.5,
    results: [
      {
        runId: 'run-1',
        caseId: 'PT-001',
        expectedAction: 'BLOCK',
        actualAction: 'BLOCK',
        passed: true,
        latencyMs: 2.1,
        policyVersion: '1.0.0',
        timestamp: '2026-10-14T10:00:00Z'
      },
      {
        runId: 'run-1',
        caseId: 'REG-001',
        expectedAction: 'ALLOW',
        actualAction: 'ALLOW',
        passed: true,
        latencyMs: 1.5,
        policyVersion: '1.0.0',
        timestamp: '2026-10-14T10:00:01Z'
      }
    ]
  };

  // In run 2, PT-001 fails (bypassed!)
  const currentRun: ReplayRunSummary = {
    runId: 'run-2',
    timestamp: '2026-10-14T11:00:00Z',
    policyVersion: '1.1.0-flawed',
    totalCases: 2,
    passedCases: 1,
    failedCases: 1,
    passRate: 0.5,
    averageLatencyMs: 3.0,
    results: [
      {
        runId: 'run-2',
        caseId: 'PT-001',
        expectedAction: 'BLOCK',
        actualAction: 'ALLOW', // Regression!
        passed: false,
        latencyMs: 3.2,
        policyVersion: '1.1.0-flawed',
        timestamp: '2026-10-14T11:00:00Z',
        failureDetails: 'Expected BLOCK but ALLOW was granted'
      },
      {
        runId: 'run-2',
        caseId: 'REG-001',
        expectedAction: 'ALLOW',
        actualAction: 'ALLOW',
        passed: true,
        latencyMs: 2.8,
        policyVersion: '1.1.0-flawed',
        timestamp: '2026-10-14T11:00:01Z'
      }
    ]
  };

  const report = analyzeRegression(currentRun, STANDARD_ATTACK_SUITE, previousRun);

  assert.strictEqual(report.overallStatus, 'REGRESSION_DETECTED');
  assert.strictEqual(report.regressionsDetected.length, 1);
  assert.strictEqual(report.regressionsDetected[0].caseId, 'PT-001');

  const markdown = formatReportMarkdown(report);
  assert.ok(markdown.includes('REGRESSION_DETECTED'));
  assert.ok(markdown.includes('PT-001'));
  assert.ok(markdown.includes('Category Breakdown'));
});
