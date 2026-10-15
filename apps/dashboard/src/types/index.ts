export type NavTab = 'events' | 'contracts' | 'replay' | 'evidence' | 'mlRisk'

// Agreed Security Action values: ALLOW | BLOCK | REQUIRE_APPROVAL
// (Matching @tars/shared-types SecurityAction)
export type SecurityAction = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL'

// Canonical ContractStatus values: ACTIVE | DRIFTED | DEPRECATED | BLOCKED | PENDING_REVIEW
// (Matching @tars/shared-types ContractStatus)
export type ContractStatus =
  | 'ACTIVE'
  | 'DRIFTED'
  | 'DEPRECATED'
  | 'BLOCKED'
  | 'PENDING_REVIEW'

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'ACTIVE',
  'DRIFTED',
  'DEPRECATED',
  'BLOCKED',
  'PENDING_REVIEW',
] as const

// Standard API Response envelope (Matching @tars/shared-types ApiResponse<T>)
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  timestamp: string
}

// Standard paginated response envelope
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// Audit event representation aligning with @tars/shared-types AuditEvent
export interface AuditEvent {
  id: string
  requestId: string
  timestamp: string
  serverId?: string
  tool: string
  action: SecurityAction
  reasonCode: string
  executionStatus: 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'ERROR' | 'BLOCKED'
  policyVersion: string
  contractVersion?: string
  clientIdentity?: string
  parameters?: Record<string, unknown>
  redacted?: boolean
  latencyMs?: number
  decisionEvidence?: {
    matchedRuleId?: string
    matchedRuleName?: string
    contractVerified?: boolean
    driftDetected?: boolean
    sensitivePatternsFound?: string[]
    riskScore?: number
    evaluatedChecks: string[]
    notes?: string
    mlShadow?: {
      predictedRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' | string
      confidence?: number
      classProbabilities?: Record<string, number>
      model?: string
      mode?: string
      success?: boolean
      latencyMs?: number
      error?: string
    }
  }
  errorMessage?: string
}

// Tool contract representation aligning with @tars/shared-types ToolContract
export interface ToolContract {
  serverId: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
  definitionHash: string
  version: string
  status: ContractStatus
  createdAt?: string
  updatedAt?: string
  notes?: string
}

// Contract drift report aligning with @tars/shared-types ContractDriftResult
export interface SchemaDifference {
  path: string
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED'
  expected?: unknown
  actual?: unknown
  description?: string
}

export interface ContractDriftResult {
  serverId: string
  toolName: string
  contractVersion: string
  hasDrift: boolean
  expectedHash: string
  actualHash: string
  detectedAt: string
  schemaDifferences?: SchemaDifference[]
}

// Replay regression run summary aligning with @tars/shared-types ReplayRunSummary & ReplayResult
export interface ReplayResult {
  runId: string
  caseId: string
  expectedAction: SecurityAction
  actualAction: SecurityAction
  passed: boolean
  latencyMs: number
  policyVersion: string
  timestamp: string
  reasonCode?: string
  failureDetails?: string
}

export interface ReplayRunSummary {
  runId: string
  timestamp: string
  policyVersion: string
  totalCases: number
  passedCases: number
  failedCases: number
  passRate: number
  averageLatencyMs: number
  results: ReplayResult[]
}

// Decision evidence detail structure for dashboard visualization
export interface DecisionEvidenceItem {
  id: string
  eventId: string
  timestamp: string
  toolName: string
  serverId: string
  clientId: string
  finalAction: SecurityAction
  policyEvaluations: {
    policyName: string
    passed: boolean
    description: string
  }[]
  promptInjectionSignal?: {
    detected: boolean
    confidence: number
    note: string
  }
  rawRequestSummary: string
  redactedPayloadPreview?: string
  auditRecordReference: string
}
