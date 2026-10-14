/**
 * SecurityAction defines the deterministic enforcement action
 * determined by the TARS gateway for an incoming MCP tool call.
 */
export type SecurityAction = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

export const SECURITY_ACTIONS: readonly SecurityAction[] = [
  'ALLOW',
  'BLOCK',
  'REQUIRE_APPROVAL',
] as const;

export function isSecurityAction(value: unknown): value is SecurityAction {
  return typeof value === 'string' && (SECURITY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Standard Reason Codes for security policy decisions.
 */
export type SecurityReasonCode =
  | 'POLICY_ALLOW'
  | 'POLICY_BLOCK'
  | 'APPROVAL_REQUIRED'
  | 'UNKNOWN_TOOL'
  | 'SCHEMA_MISMATCH'
  | 'SCHEMA_DRIFT_DETECTED'
  | 'PARAMETER_OUT_OF_BOUNDS'
  | 'SENSITIVE_PATH_ACCESS'
  | 'UNAUTHORIZED_CLIENT'
  | 'PROMPT_INJECTION_RISK'
  | 'PAYLOAD_TOO_LARGE'
  | 'UPSTREAM_ERROR'
  | string;

/**
 * Deterministic policy rule representation.
 */
export interface PolicyRule {
  id: string;
  name: string;
  action: SecurityAction;
  reasonCode: SecurityReasonCode;
  description?: string;
  condition?: {
    toolNames?: string[];
    serverIds?: string[];
    allowedPaths?: string[];
    blockedPatterns?: string[];
    maxPayloadSizeBytes?: number;
    requireContractMatch?: boolean;
  };
}

/**
 * Versioned security policy configuration.
 */
export interface SecurityPolicy {
  id: string;
  version: string;
  name: string;
  description?: string;
  defaultAction: SecurityAction;
  rules: PolicyRule[];
  updatedAt: string;
}
