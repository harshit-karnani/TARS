import type { ReplayRunSummary } from '@tars/shared-types';

/**
 * ReplayAdapter stores and retrieves security attack replay run results.
 * Connects with Person 2's regression suite while providing clear initial baseline benchmarks.
 */
export class ReplayAdapter {
  private runs: ReplayRunSummary[] = [];

  constructor() {
    this.seedBaselineRuns();
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
