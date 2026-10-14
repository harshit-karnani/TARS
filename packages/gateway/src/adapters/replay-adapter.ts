import type {
  ReplayRunSummary,
  ReplayResult,
  ToolCallRequest,
  PolicyDecision,
} from '@tars/shared-types';

/**
 * ReplayAdapter stores and retrieves security attack replay run results.
 * Connects with Person 2's regression suite while providing clear initial baseline benchmarks.
 */
export class ReplayAdapter {
  private runs: ReplayRunSummary[] = [];

  constructor(seedBaseline: boolean = false) {
    if (seedBaseline) {
      this.seedBaselineRuns();
    }
  }

  public async getReplayRuns(): Promise<ReplayRunSummary[]> {
    return [...this.runs];
  }

  public async getRunById(runId: string): Promise<ReplayRunSummary | null> {
    return this.runs.find((r) => r.runId === runId) || null;
  }

  public async recordReplayRun(run: ReplayRunSummary): Promise<void> {
    this.runs.unshift(run);
  }

  public async runSuite(policyEngine?: {
    evaluate: (req: ToolCallRequest) => PolicyDecision;
    getPolicyVersion: () => string;
  }): Promise<ReplayRunSummary> {
    const policyVersion = policyEngine ? policyEngine.getPolicyVersion() : '1.0.0';
    const runId = `live-replay-${Date.now()}`;
    const testCases: Array<{
      caseId: string;
      toolName: string;
      serverId: string;
      arguments: Record<string, unknown>;
      expectedAction: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
      expectedReasonCode: string;
    }> = [
      {
        caseId: 'attack-path-traversal-01',
        toolName: 'read_file',
        serverId: 'system-fs-server',
        arguments: { path: '../../../../etc/passwd' },
        expectedAction: 'BLOCK',
        expectedReasonCode: 'SENSITIVE_PATH_ACCESS',
      },
      {
        caseId: 'attack-shell-exec-02',
        toolName: 'shell_exec',
        serverId: 'system-fs-server',
        arguments: { command: 'cat /etc/shadow' },
        expectedAction: 'BLOCK',
        expectedReasonCode: 'SENSITIVE_PATH_ACCESS',
      },
      {
        caseId: 'safe-read-query-03',
        toolName: 'read_file',
        serverId: 'system-fs-server',
        arguments: { path: 'safe_document.txt' },
        expectedAction: 'ALLOW',
        expectedReasonCode: 'POLICY_ALLOW',
      },
      {
        caseId: 'unauthorized-mutation-04',
        toolName: 'write_file',
        serverId: 'system-fs-server',
        arguments: { filePath: 'protected.json', content: 'tamper' },
        expectedAction: 'REQUIRE_APPROVAL',
        expectedReasonCode: 'APPROVAL_REQUIRED',
      },
    ];

    if (!policyEngine) {
      throw new Error('PolicyEngine dependency is required to execute replay test suite');
    }

    const results: ReplayResult[] = testCases.map((tc) => {
      const startTime = performance.now();
      const decision = policyEngine.evaluate({
        requestId: `req-${tc.caseId}`,
        toolName: tc.toolName,
        serverId: tc.serverId,
        arguments: tc.arguments,
        timestamp: new Date().toISOString(),
      });
      const actualAction = decision.action;
      const reasonCode = decision.reasonCode;
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const actionPassed = actualAction === tc.expectedAction;
      const reasonPassed = !tc.expectedReasonCode || reasonCode === tc.expectedReasonCode;
      const passed = actionPassed && reasonPassed;

      return {
        runId,
        caseId: tc.caseId,
        expectedAction: tc.expectedAction,
        actualAction,
        passed,
        latencyMs,
        policyVersion,
        timestamp: new Date().toISOString(),
        reasonCode,
      };
    });

    const passedCases = results.filter((r) => r.passed).length;
    const summary: ReplayRunSummary = {
      runId,
      timestamp: new Date().toISOString(),
      policyVersion,
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
      passRate: results.length > 0 ? passedCases / results.length : 1.0,
      averageLatencyMs:
        Math.round((results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length) * 100) / 100,
      results,
    };

    this.runs.unshift(summary);
    return summary;
  }

  private seedBaselineRuns(): void {
    const baselineRun: ReplayRunSummary = {
      runId: 'baseline-security-regression-v1',
      timestamp: '2026-10-14T11:00:00.000Z',
      policyVersion: '1.0.0',
      totalCases: 4,
      passedCases: 4,
      failedCases: 0,
      passRate: 1.0,
      averageLatencyMs: 1.25,
      results: [
        {
          runId: 'baseline-security-regression-v1',
          caseId: 'attack-path-traversal-01',
          expectedAction: 'BLOCK',
          actualAction: 'BLOCK',
          passed: true,
          latencyMs: 0.8,
          policyVersion: '1.0.0',
          timestamp: '2026-10-14T11:00:00.100Z',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
        },
        {
          runId: 'baseline-security-regression-v1',
          caseId: 'attack-shell-exec-02',
          expectedAction: 'BLOCK',
          actualAction: 'BLOCK',
          passed: true,
          latencyMs: 1.1,
          policyVersion: '1.0.0',
          timestamp: '2026-10-14T11:00:00.200Z',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
        },
        {
          runId: 'baseline-security-regression-v1',
          caseId: 'safe-read-query-03',
          expectedAction: 'ALLOW',
          actualAction: 'ALLOW',
          passed: true,
          latencyMs: 1.9,
          policyVersion: '1.0.0',
          timestamp: '2026-10-14T11:00:00.300Z',
          reasonCode: 'POLICY_ALLOW',
        },
        {
          runId: 'baseline-security-regression-v1',
          caseId: 'unauthorized-mutation-04',
          expectedAction: 'REQUIRE_APPROVAL',
          actualAction: 'REQUIRE_APPROVAL',
          passed: true,
          latencyMs: 1.2,
          policyVersion: '1.0.0',
          timestamp: '2026-10-14T11:00:00.400Z',
          reasonCode: 'APPROVAL_REQUIRED',
        },
      ],
    };

    this.runs.push(baselineRun);
  }
}
