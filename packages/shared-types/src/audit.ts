import type { SecurityAction, SecurityReasonCode } from './security.js';

/**
 * Execution status of an intercepted tool invocation.
 */
export type AuditExecutionStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'ERROR'
  | 'BLOCKED';

export const AUDIT_EXECUTION_STATUSES: readonly AuditExecutionStatus[] = [
  'PENDING',
  'EXECUTING',
  'SUCCESS',
  'ERROR',
  'BLOCKED',
] as const;

export type MlRiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface MlShadowPrediction {
  predictedRisk: MlRiskLabel | string;
  confidence?: number;
  classProbabilities?: Record<string, number>;
  model: string;
  mode: 'shadow';
  success: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Detailed evidence explaining why a security action was taken.
 */
export interface DecisionEvidence {
  matchedRuleId?: string;
  matchedRuleName?: string;
  contractVerified?: boolean;
  driftDetected?: boolean;
  sensitivePatternsFound?: string[];
  riskScore?: number;
  evaluatedChecks: string[];
  notes?: string;
  mlShadow?: MlShadowPrediction;
}

/**
 * AuditEvent records every intercepted request, policy decision, and execution result.
 * Stored in SQLite and visualized in the dashboard.
 */
export interface AuditEvent {
  /** Unique audit event ID (UUID or ULID) */
  id: string;

  /** Correlation ID for tracing client requests */
  requestId: string;

  /** ISO 8601 UTC timestamp */
  timestamp: string;

  /** Upstream server identifier */
  serverId?: string;

  /** Name of the tool invoked */
  tool: string;

  /** Security policy action taken */
  action: SecurityAction;

  /** Deterministic reason code for the action */
  reasonCode: SecurityReasonCode;

  /** Execution state of the request */
  executionStatus: AuditExecutionStatus;

  /** Version of the active security policy applied */
  policyVersion: string;

  /** Optional contract version matched or verified */
  contractVersion?: string;

  /** Optional client identity / IP or identifier */
  clientIdentity?: string;

  /** Tool call parameters (with secrets/sensitive fields redacted) */
  parameters?: Record<string, unknown>;

  /** Whether sensitive data redaction was performed on params or response */
  redacted?: boolean;

  /** Execution duration in milliseconds */
  latencyMs?: number;

  /** Auditable rationale and evidence details */
  decisionEvidence?: DecisionEvidence;

  /** Error message if execution or validation failed */
  errorMessage?: string;
}

/**
 * Query filter criteria for querying the audit log via API or storage.
 */
export interface AuditLogQueryFilter {
  tool?: string;
  action?: SecurityAction;
  executionStatus?: AuditExecutionStatus;
  policyVersion?: string;
  contractVersion?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}
