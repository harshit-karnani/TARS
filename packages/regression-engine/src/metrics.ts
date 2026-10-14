import type {
  ReplayRunSummary,
  ReplayTestCase,
  CategoryMetricScore,
  RegressionAnalysisReport
} from './types.ts';

/**
 * Analyzes regression trends by comparing two consecutive replay test runs.
 */
export function analyzeRegression(
  currentRun: ReplayRunSummary,
  testCases: ReplayTestCase[],
  previousRun?: ReplayRunSummary
): RegressionAnalysisReport {
  const caseMap = new Map<string, ReplayTestCase>();
  for (const tc of testCases) {
    caseMap.set(tc.caseId, tc);
  }

  // 1. Calculate category breakdown for current run
  const categoryStats = new Map<
    ReplayTestCase['category'],
    { total: number; passed: number; failed: number }
  >();

  for (const res of currentRun.results) {
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

  const categoryBreakdown: CategoryMetricScore[] = [];
  for (const [category, stats] of categoryStats.entries()) {
    categoryBreakdown.push({
      category,
      total: stats.total,
      passed: stats.passed,
      failed: stats.failed,
      passRate: stats.total > 0 ? Number((stats.passed / stats.total).toFixed(4)) : 1.0
    });
  }
  categoryBreakdown.sort((a, b) => a.category.localeCompare(b.category));

  // 2. Detect regressions against previous run
  const regressions: RegressionAnalysisReport['regressionsDetected'] = [];

  if (previousRun) {
    const prevResultsMap = new Map<string, boolean>();
    for (const r of previousRun.results) {
      prevResultsMap.set(r.caseId, r.passed);
    }

    for (const curr of currentRun.results) {
      const prevPassed = prevResultsMap.get(curr.caseId);
      if (prevPassed === true && curr.passed === false) {
        const tc = caseMap.get(curr.caseId);
        regressions.push({
          caseId: curr.caseId,
          name: tc?.name ?? curr.caseId,
          category: tc?.category ?? 'UNKNOWN',
          previousPassed: true,
          currentPassed: false,
          reason: curr.failureDetails ?? 'Policy enforcement failed on previously passing case'
        });
      }
    }
  }

  // 3. Determine overall status
  let overallStatus: RegressionAnalysisReport['overallStatus'] = 'PASS';
  if (regressions.length > 0) {
    overallStatus = 'REGRESSION_DETECTED';
  } else if (currentRun.failedCases > 0) {
    overallStatus = 'WARNING';
  }

  return {
    currentRun,
    previousRun,
    categoryBreakdown,
    regressionsDetected: regressions,
    overallStatus
  };
}

/**
 * Formats a RegressionAnalysisReport into human-readable Markdown.
 */
export function formatReportMarkdown(report: RegressionAnalysisReport): string {
  const { currentRun, categoryBreakdown, regressionsDetected, overallStatus } = report;

  const lines: string[] = [
    `# TARS Regression Engine Report`,
    `**Status:** ${overallStatus} | **Run ID:** ${currentRun.runId} | **Policy:** v${currentRun.policyVersion}`,
    `**Total Cases:** ${currentRun.totalCases} | **Passed:** ${currentRun.passedCases} | **Failed:** ${currentRun.failedCases} | **Pass Rate:** ${(currentRun.passRate * 100).toFixed(1)}% | **Avg Latency:** ${currentRun.averageLatencyMs}ms`,
    '',
    `### Category Breakdown`,
    `| Category | Total | Passed | Failed | Pass Rate |`,
    `| :--- | :--- | :--- | :--- | :--- |`
  ];

  for (const cat of categoryBreakdown) {
    lines.push(
      `| ${cat.category} | ${cat.total} | ${cat.passed} | ${cat.failed} | ${(cat.passRate * 100).toFixed(1)}% |`
    );
  }

  if (regressionsDetected.length > 0) {
    lines.push('', `### Regressions Detected (${regressionsDetected.length})`);
    for (const reg of regressionsDetected) {
      lines.push(`- **[${reg.caseId}] ${reg.name}** (${reg.category}): ${reg.reason}`);
    }
  }

  return lines.join('\n');
}
