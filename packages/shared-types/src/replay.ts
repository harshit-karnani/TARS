import type { SecurityAction } from './security.js';

/**
 * Definition of a security replay test case (e.g. attack vectors, contract regressions).
 */
export interface ReplayTestCase {
  caseId: string;
  name: string;
  description?: string;
  category: 'INJECTION' | 'PATH_TRAVERSAL' | 'SCHEMA_TAMPER' | 'PRIVILEGE_ESCALATION' | 'REGRESSION';
  toolName: string;
  serverId?: string;
  inputPayload: Record<string, unknown>;
  expectedAction: SecurityAction;
  expectedReasonCode?: string;
}

/**
 * Result of executing a security replay test case against the gateway/firewall.
 */
export interface ReplayResult {
  /** Identifier of the replay execution batch/run */
  runId: string;

  /** Identifier of the specific test case executed */
  caseId: string;

  /** Expected security action configured in the test case */
  expectedAction: SecurityAction;

  /** Actual security action enforced by the gateway */
  actualAction: SecurityAction;

  /** Whether actualAction matched expectedAction (and any expected reason code) */
  passed: boolean;

  /** Enforcement/execution latency in milliseconds */
  latencyMs: number;

  /** Policy version under which the test was evaluated */
  policyVersion: string;

  /** ISO 8601 UTC timestamp of execution */
  timestamp: string;

  /** Deterministic reason code returned by the gateway */
  reasonCode?: string;

  /** Additional diagnostic failure details if assertion failed */
  failureDetails?: string;
}

/**
 * Aggregated summary for a batch replay run.
 */
export interface ReplayRunSummary {
  runId: string;
  timestamp: string;
  policyVersion: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  averageLatencyMs: number;
  results: ReplayResult[];
}
