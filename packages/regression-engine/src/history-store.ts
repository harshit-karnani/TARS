import { DatabaseSync } from 'node:sqlite';
import type { ReplayRunSummary, CategoryMetricScore } from './types.ts';
import { STANDARD_ATTACK_SUITE } from './attack-catalog.ts';
import { ReplayRunner } from './replay-runner.ts';

export interface DashboardRegressionSummary {
  totalRuns: number;
  latestRun?: ReplayRunSummary;
  overallPassRate: number;
  averageLatencyMs: number;
  categoryBreakdown: CategoryMetricScore[];
  generatedAt: string;
}

/**
 * Durable or ephemeral store for historical attack replay execution runs.
 */
export class ReplayHistoryStore {
  private db: DatabaseSync;
  private runner: ReplayRunner;

  constructor(databasePath: string = ':memory:') {
    this.db = new DatabaseSync(databasePath);
    this.runner = new ReplayRunner();
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS replay_runs (
        run_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        total_cases INTEGER NOT NULL,
        passed_cases INTEGER NOT NULL,
        failed_cases INTEGER NOT NULL,
        pass_rate REAL NOT NULL,
        average_latency_ms REAL NOT NULL,
        raw_json TEXT NOT NULL
      );
    `);
  }

  async saveRun(summary: ReplayRunSummary): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO replay_runs (
        run_id, timestamp, policy_version, total_cases,
        passed_cases, failed_cases, pass_rate, average_latency_ms, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      summary.runId,
      summary.timestamp,
      summary.policyVersion,
      summary.totalCases,
      summary.passedCases,
      summary.failedCases,
      summary.passRate,
      summary.averageLatencyMs,
      JSON.stringify(summary)
    );
  }

  async listRuns(limit: number = 20): Promise<ReplayRunSummary[]> {
    const stmt = this.db.prepare(`
      SELECT raw_json FROM replay_runs
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as unknown as Array<{ raw_json: string }>;
    return rows.map((r) => JSON.parse(r.raw_json) as ReplayRunSummary);
  }

  async getRunById(runId: string): Promise<ReplayRunSummary | null> {
    const stmt = this.db.prepare(`
      SELECT raw_json FROM replay_runs
      WHERE run_id = ?
    `);
    const row = stmt.get(runId) as { raw_json: string } | undefined;
    return row ? (JSON.parse(row.raw_json) as ReplayRunSummary) : null;
  }

  async getDashboardSummary(): Promise<DashboardRegressionSummary> {
    const runs = await this.listRuns(1);
    const latestRun = runs[0];

    const categoryBreakdown = latestRun
      ? this.runner.computeCategoryScores(latestRun, STANDARD_ATTACK_SUITE)
      : [];

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM replay_runs`);
    const countRow = countStmt.get() as { count: number } | undefined;
    const totalRuns = countRow?.count ?? 0;

    return {
      totalRuns,
      latestRun,
      overallPassRate: latestRun?.passRate ?? 1.0,
      averageLatencyMs: latestRun?.averageLatencyMs ?? 0,
      categoryBreakdown,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Seeds demo replay runs for hackathon dashboard presentation.
   * Clearly marked as demo/simulated data.
   */
  async seedDemoRuns(): Promise<void> {
    const demoBaselineRun: ReplayRunSummary = {
      runId: 'demo-run-baseline-01',
      timestamp: '2026-10-14T09:00:00.000Z',
      policyVersion: '1.0.0-baseline',
      totalCases: STANDARD_ATTACK_SUITE.length,
      passedCases: STANDARD_ATTACK_SUITE.length,
      failedCases: 0,
      passRate: 1.0,
      averageLatencyMs: 2.15,
      results: STANDARD_ATTACK_SUITE.map((tc) => ({
        runId: 'demo-run-baseline-01',
        caseId: tc.caseId,
        expectedAction: tc.expectedAction,
        actualAction: tc.expectedAction,
        passed: true,
        latencyMs: 1.8,
        policyVersion: '1.0.0-baseline',
        timestamp: '2026-10-14T09:00:00.000Z',
        reasonCode: tc.expectedReasonCode
      }))
    };

    await this.saveRun(demoBaselineRun);
  }

  close(): void {
    this.db.close();
  }
}
