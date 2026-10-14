import { randomUUID } from 'node:crypto';
import type {
  ReplayTestCase,
  ReplayResult,
  ReplayRunSummary,
  GatewayEvaluator,
  CategoryMetricScore
} from './types.ts';

export class ReplayRunner {
  private defaultPolicyVersion: string;

  constructor(defaultPolicyVersion: string = '1.0.0') {
    this.defaultPolicyVersion = defaultPolicyVersion;
  }

  async executeCase(
    testCase: ReplayTestCase,
    evaluator: GatewayEvaluator,
    runId: string = randomUUID(),
    policyVersion: string = this.defaultPolicyVersion
  ): Promise<ReplayResult> {
    const start = performance.now();
    let actualAction: ReplayResult['actualAction'] = 'BLOCK';
    let reasonCode: string | undefined;
    let failureDetails: string | undefined;

    try {
      const decision = await evaluator({
        serverId: testCase.serverId,
        toolName: testCase.toolName,
        arguments: testCase.inputPayload
      });
      actualAction = decision.action;
      reasonCode = decision.reasonCode;
    } catch (err: unknown) {
      actualAction = 'BLOCK';
      reasonCode = 'UPSTREAM_ERROR';
      failureDetails = `Evaluator threw error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const latencyMs = Number((performance.now() - start).toFixed(2));
    const actionPassed = actualAction === testCase.expectedAction;

    let reasonPassed = true;
    if (testCase.expectedReasonCode && reasonCode) {
      reasonPassed =
        reasonCode === testCase.expectedReasonCode ||
        reasonCode.startsWith(testCase.expectedReasonCode) ||
        (testCase.expectedAction === 'BLOCK' && reasonCode.includes('BLOCK'));
    }

    const passed = actionPassed && reasonPassed;

    if (!passed && !failureDetails) {
      failureDetails = `Expected action ${testCase.expectedAction} (${testCase.expectedReasonCode ?? 'any'}) but received ${actualAction} (${reasonCode ?? 'none'})`;
    }

    return {
      runId,
      caseId: testCase.caseId,
      expectedAction: testCase.expectedAction,
      actualAction,
      passed,
      latencyMs,
      policyVersion,
      timestamp: new Date().toISOString(),
      reasonCode,
      failureDetails
    };
  }

  async runSuite(
    testCases: ReplayTestCase[],
    evaluator: GatewayEvaluator,
    options?: { runId?: string; policyVersion?: string }
  ): Promise<ReplayRunSummary> {
    const runId = options?.runId ?? `run-${Date.now()}`;
    const policyVersion = options?.policyVersion ?? this.defaultPolicyVersion;
    const results: ReplayResult[] = [];

    for (const tc of testCases) {
      const result = await this.executeCase(tc, evaluator, runId, policyVersion);
      results.push(result);
    }

    const totalCases = results.length;
    const passedCases = results.filter((r) => r.passed).length;
    const failedCases = totalCases - passedCases;
    const passRate = totalCases > 0 ? Number((passedCases / totalCases).toFixed(4)) : 1.0;
    const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
    const averageLatencyMs = totalCases > 0 ? Number((totalLatency / totalCases).toFixed(2)) : 0;

    return {
      runId,
      timestamp: new Date().toISOString(),
      policyVersion,
      totalCases,
      passedCases,
      failedCases,
      passRate,
      averageLatencyMs,
      results
    };
  }

  computeCategoryScores(
    summary: ReplayRunSummary,
    testCases: ReplayTestCase[]
  ): CategoryMetricScore[] {
    const caseMap = new Map<string, ReplayTestCase>();
    for (const tc of testCases) {
      caseMap.set(tc.caseId, tc);
    }

    const categoryStats = new Map<
      ReplayTestCase['category'],
      { total: number; passed: number; failed: number }
    >();

    for (const res of summary.results) {
      const tc = caseMap.get(res.caseId);
      const cat = tc ? tc.category : 'REGRESSION';

      const stats = categoryStats.get(cat) ?? { total: 0, passed: 0, failed: 0 };
      stats.total += 1;
      if (res.passed) {
        stats.passed += 1;
      } else {
        stats.failed += 1;
      }
      categoryStats.set(cat, stats);
    }

    const scores: CategoryMetricScore[] = [];
    for (const [category, stats] of categoryStats.entries()) {
      scores.push({
        category,
        total: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        passRate: stats.total > 0 ? Number((stats.passed / stats.total).toFixed(4)) : 1.0
      });
    }

    return scores.sort((a, b) => a.category.localeCompare(b.category));
  }
}
