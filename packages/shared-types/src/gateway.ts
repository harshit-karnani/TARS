import type { SecurityAction } from './security.js';
import type { DecisionEvidence } from './audit.js';

/**
 * Transport type used to connect with upstream MCP server or clients.
 */
export type McpTransportType = 'stdio' | 'sse' | 'http';

/**
 * Configuration options for the TARS gateway runtime.
 */
export interface GatewayConfig {
  /** Gateway HTTP / WebSocket / SSE listen port */
  port: number;

  /** Hostname or IP to bind (e.g. 127.0.0.1) */
  host: string;

  /** Primary upstream transport protocol */
  upstreamTransport: McpTransportType;

  /** Command to launch upstream MCP server (for stdio transport) */
  upstreamCommand?: string;

  /** Arguments for upstream command (for stdio transport) */
  upstreamArgs?: string[];

  /** Upstream URL (for sse / http transport) */
  upstreamUrl?: string;

  /** Path to local SQLite audit database */
  dbPath: string;

  /** Active security policy version string */
  policyVersion: string;

  /** Enable automatic redaction of sensitive credentials and PII */
  enableRedaction: boolean;

  /** Whether to allow tools that are not pre-registered in the contract registry */
  allowUnknownTools: boolean;

  /** Enable ML-based adaptive risk classification in shadow mode */
  enableMlShadowScoring?: boolean;

  /** Local endpoint URL for ML risk prediction service (e.g. http://127.0.0.1:8000) */
  mlScoringEndpoint?: string;
}

/**
 * Intercepted tool call request from an MCP client.
 */
export interface ToolCallRequest {
  requestId: string;
  toolName: string;
  serverId?: string;
  arguments: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  clientIdentity?: string;
  timestamp: string;
}

/**
 * Evaluated policy decision from the security engine.
 */
export interface PolicyDecision {
  action: SecurityAction;
  reasonCode: string;
  policyVersion: string;
  contractVersion?: string;
  evidence: DecisionEvidence;
  sanitizedArguments?: Record<string, unknown>;
}

/**
 * Intercepted tool call response returned to the MCP client.
 */
export interface ToolCallResponse {
  requestId: string;
  action: SecurityAction;
  success: boolean;
  content?: unknown;
  error?: string;
  latencyMs: number;
  redacted?: boolean;
}

/**
 * A pending approval request queued in gateway memory awaiting authorized human review.
 */
export interface PendingApproval {
  requestId: string;
  eventId: string;
  toolName: string;
  serverId?: string;
  clientIdentity?: string;
  arguments: Record<string, unknown>;
  sanitizedArguments?: Record<string, unknown>;
  reasonCode: string;
  policyVersion: string;
  contractVersion?: string;
  createdAt: number;
  expiresAt: number;
  decisionEvidence?: DecisionEvidence;
}

/**
 * Payload sent to POST /api/approvals/decision
 */
export interface ApprovalDecisionRequest {
  requestId: string;
  decision: 'APPROVE' | 'REJECT';
  approver?: string;
  reason?: string;
}

/**
 * Result returned by POST /api/approvals/decision
 */
export interface ApprovalDecisionResult {
  requestId: string;
  decision: 'APPROVE' | 'REJECT';
  executionStatus: 'SUCCESS' | 'ERROR' | 'BLOCKED';
  executed: boolean;
  result?: ToolCallResponse;
  auditEventId: string;
  message: string;
}

/**
 * Standard API envelope for REST/SSE communication between Gateway and Dashboard.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * Standard paginated collection envelope for list queries (e.g. audit events, contracts).
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Canonical Server-Sent Events (SSE) route path for streaming live audit events to the dashboard.
 */
export const SSE_EVENTS_STREAM_PATH = '/api/events/stream';
