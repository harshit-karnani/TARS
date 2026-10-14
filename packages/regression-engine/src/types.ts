/**
 * TARS Regression Engine - Package Types
 * Re-exports canonical replay and security types from @tars/shared-types
 * Owned by: Person 2 (Tool Contract Firewall & Regression Engine)
 */

export type {
  SecurityAction,
  SecurityReasonCode
} from '../../shared-types/src/security.ts';

export type {
  ReplayTestCase,
  ReplayResult,
  ReplayRunSummary
} from '../../shared-types/src/replay.ts';

import type { SecurityAction } from '../../shared-types/src/security.ts';
import type { ReplayTestCase, ReplayResult, ReplayRunSummary } from '../../shared-types/src/replay.ts';

/**
 * Gateway invocation handler or client interface evaluated by ReplayRunner.
 */
export type GatewayEvaluator = (request: {
  serverId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) => Promise<{
  action: SecurityAction;
  reasonCode?: string;
  notes?: string;
}>;

/**
 * Granular metric score for a specific attack category.
 */
export interface CategoryMetricScore {
  category: ReplayTestCase['category'];
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/**
 * Comprehensive regression analysis report comparing historical replay runs.
 */
export interface RegressionAnalysisReport {
  currentRun: ReplayRunSummary;
  previousRun?: ReplayRunSummary;
  categoryBreakdown: CategoryMetricScore[];
  regressionsDetected: Array<{
    caseId: string;
    name: string;
    category: string;
    previousPassed: boolean;
    currentPassed: boolean;
    reason: string;
  }>;
  overallStatus: 'PASS' | 'REGRESSION_DETECTED' | 'WARNING';
}
