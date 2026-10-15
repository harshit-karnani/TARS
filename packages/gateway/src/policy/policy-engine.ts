import type {
  SecurityPolicy,
  PolicyRule,
  ToolCallRequest,
  PolicyDecision,
  DecisionEvidence,
  ToolContract,
} from '@tars/shared-types';
import { redactPayload } from '../security/redactor.js';
import { inspectArgumentsForPathViolations } from '../security/path-checker.js';
import { inspectArgumentsForInjection } from '../security/injection-detector.js';
import { validateArgumentsAgainstSchema } from './schema-validator.js';

export interface PolicyEngineOptions {
  allowedRoot?: string;
  enableRedaction?: boolean;
  maxPayloadSizeBytes?: number;
  allowUnknownTools?: boolean;
  authorizedClients?: string[];
}

export class PolicyEngine {
  private policy: SecurityPolicy;
  private options: Required<PolicyEngineOptions>;
  private contractRegistryMap: Map<string, ToolContract> = new Map();

  constructor(policy?: SecurityPolicy, options: PolicyEngineOptions = {}) {
    this.policy = policy ?? PolicyEngine.createDefaultPolicy();
    this.options = {
      allowedRoot: options.allowedRoot || '',
      enableRedaction: options.enableRedaction ?? true,
      maxPayloadSizeBytes: options.maxPayloadSizeBytes ?? 1024 * 1024, // 1MB default
      allowUnknownTools: options.allowUnknownTools ?? false,
      authorizedClients: options.authorizedClients || [],
    };
  }

  public getPolicyVersion(): string {
    return this.policy.version;
  }

  public getPolicy(): SecurityPolicy {
    return this.policy;
  }

  public setPolicy(policy: SecurityPolicy): void {
    this.policy = policy;
  }

  public registerContract(contract: ToolContract): void {
    this.contractRegistryMap.set(contract.toolName, contract);
    if (contract.serverId) {
      this.contractRegistryMap.set(`${contract.serverId}:${contract.toolName}`, contract);
    }
  }

  public getContract(toolName: string, serverId?: string): ToolContract | undefined {
    if (serverId) {
      const byServer = this.contractRegistryMap.get(`${serverId}:${toolName}`);
      if (byServer) return byServer;
    }
    return this.contractRegistryMap.get(toolName);
  }

  /**
   * Deterministically evaluates an incoming MCP tool call request using strict rule priority:
   * 1. Payload size check (PAYLOAD_TOO_LARGE)
   * 2. Client authorization check (UNAUTHORIZED_CLIENT)
   * 3. Path traversal check (SENSITIVE_PATH_ACCESS)
   * 4. Schema & parameter bounds check (SCHEMA_MISMATCH / PARAMETER_OUT_OF_BOUNDS)
   * 5. Explicit Policy Rules (order of configuration)
   * 6. Unknown tool check (UNKNOWN_TOOL)
   * 7. Default fallback action (Fail-closed)
   */
  public evaluate(request: ToolCallRequest): PolicyDecision {
    const checks: string[] = [];

    // Redaction of sensitive fields in arguments (prevent logging secrets)
    let sanitizedArguments = request.arguments;
    let redactedFields: string[] = [];
    if (this.options.enableRedaction) {
      checks.push('credential_redaction');
      const redaction = redactPayload(request.arguments);
      sanitizedArguments = redaction.sanitized;
      redactedFields = redaction.redactedFields;
    }

    // Heuristic prompt injection risk signal (Rule 5: limited risk signal, not guarantee)
    checks.push('injection_risk_signal');
    const injectionSignal = inspectArgumentsForInjection(request.arguments);

    // 1. Payload Size Check
    checks.push('payload_size_check');
    const serializedArgs = JSON.stringify(request.arguments ?? {});
    const payloadBytes = Buffer.byteLength(serializedArgs, 'utf8');
    if (payloadBytes > this.options.maxPayloadSizeBytes) {
      return {
        action: 'BLOCK',
        reasonCode: 'PAYLOAD_TOO_LARGE',
        policyVersion: this.policy.version,
        evidence: {
          matchedRuleId: 'builtin-payload-size-guard',
          matchedRuleName: 'Enforce Max Payload Size',
          evaluatedChecks: checks,
          riskScore: injectionSignal.riskScore,
          sensitivePatternsFound: redactedFields,
          notes: `Payload size (${payloadBytes} bytes) exceeds maximum allowed (${this.options.maxPayloadSizeBytes} bytes)`,
        },
        sanitizedArguments,
      };
    }

    // 2. Client Authorization Check
    checks.push('client_authorization_check');
    if (this.options.authorizedClients.length > 0) {
      if (!request.clientIdentity || !this.options.authorizedClients.includes(request.clientIdentity)) {
        return {
          action: 'BLOCK',
          reasonCode: 'UNAUTHORIZED_CLIENT',
          policyVersion: this.policy.version,
          evidence: {
            matchedRuleId: 'builtin-client-auth-guard',
            matchedRuleName: 'Enforce Client Allowlist',
            evaluatedChecks: checks,
            riskScore: injectionSignal.riskScore,
            sensitivePatternsFound: redactedFields,
            notes: `Client '${request.clientIdentity || 'anonymous'}' is not in authorized clients allowlist`,
          },
          sanitizedArguments,
        };
      }
    }

    // 3. Safe Filesystem / Path Traversal Check
    checks.push('path_traversal_check');
    const pathCheck = inspectArgumentsForPathViolations(request.arguments, this.options.allowedRoot || undefined);
    if (!pathCheck.isSafe) {
      return {
        action: 'BLOCK',
        reasonCode: 'SENSITIVE_PATH_ACCESS',
        policyVersion: this.policy.version,
        evidence: {
          matchedRuleId: 'builtin-path-traversal-guard',
          matchedRuleName: 'Prevent Path Traversal and Sensitive System Access',
          evaluatedChecks: checks,
          riskScore: injectionSignal.riskScore,
          sensitivePatternsFound: redactedFields,
          notes: pathCheck.violationReason,
        },
        sanitizedArguments,
      };
    }

    // 4. Schema & Parameter Bounds Check (against registered contract if available)
    const matchedContract = this.getContract(request.toolName, request.serverId);
    if (matchedContract && matchedContract.inputSchema) {
      checks.push('schema_and_bounds_validation');
      const schemaCheck = validateArgumentsAgainstSchema(request.arguments, matchedContract.inputSchema);
      if (!schemaCheck.isValid) {
        return {
          action: 'BLOCK',
          reasonCode: schemaCheck.reasonCode || 'SCHEMA_MISMATCH',
          policyVersion: this.policy.version,
          contractVersion: matchedContract.version,
          evidence: {
            matchedRuleId: 'builtin-contract-schema-guard',
            matchedRuleName: 'Contract Schema & Parameter Bounds Validation',
            evaluatedChecks: checks,
            contractVerified: false,
            riskScore: injectionSignal.riskScore,
            sensitivePatternsFound: redactedFields,
            notes: schemaCheck.errorMessage,
          },
          sanitizedArguments,
        };
      }
    }

    // 5. Explicit Policy Rules (Deterministic evaluation in configured order)
    checks.push('policy_rule_matcher');
    for (const rule of this.policy.rules) {
      if (this.matchesRule(rule, request)) {
        return {
          action: rule.action,
          reasonCode: rule.reasonCode,
          policyVersion: this.policy.version,
          contractVersion: matchedContract?.version,
          evidence: {
            matchedRuleId: rule.id,
            matchedRuleName: rule.name,
            contractVerified: matchedContract !== undefined,
            evaluatedChecks: checks,
            riskScore: injectionSignal.riskScore,
            sensitivePatternsFound: [
              ...redactedFields,
              ...injectionSignal.matchedPatterns,
            ],
            notes: rule.description,
          },
          sanitizedArguments,
        };
      }
    }

    // 6. Unknown Tool Check
    checks.push('known_tool_check');
    const isKnown =
      matchedContract !== undefined ||
      this.policy.rules.some((r) => r.condition?.toolNames?.includes(request.toolName));

    if (!isKnown && !this.options.allowUnknownTools) {
      return {
        action: 'BLOCK',
        reasonCode: 'UNKNOWN_TOOL',
        policyVersion: this.policy.version,
        evidence: {
          matchedRuleId: 'builtin-unknown-tool-guard',
          matchedRuleName: 'Enforce Known Tool Allowlist',
          evaluatedChecks: checks,
          riskScore: injectionSignal.riskScore,
          sensitivePatternsFound: redactedFields,
          notes: `Tool '${request.toolName}' is not registered and allowUnknownTools is disabled`,
        },
        sanitizedArguments,
      };
    }

    // 7. Deterministic Default Fallback Action (Fail-Closed)
    return {
      action: this.policy.defaultAction,
      reasonCode: this.policy.defaultAction === 'ALLOW' ? 'POLICY_ALLOW' : 'POLICY_BLOCK',
      policyVersion: this.policy.version,
      contractVersion: matchedContract?.version,
      evidence: {
        matchedRuleId: 'default-fallback',
        matchedRuleName: `Default Fallback Policy (${this.policy.defaultAction})`,
        evaluatedChecks: checks,
        contractVerified: matchedContract !== undefined,
        riskScore: injectionSignal.riskScore,
        sensitivePatternsFound: [
          ...redactedFields,
          ...injectionSignal.matchedPatterns,
        ],
        notes: 'No specific matching rule found; applied default action.',
      },
      sanitizedArguments,
    };
  }

  private matchesRule(rule: PolicyRule, request: ToolCallRequest): boolean {
    if (!rule.condition) {
      return true;
    }

    if (rule.condition.toolNames && rule.condition.toolNames.length > 0) {
      if (!rule.condition.toolNames.includes(request.toolName)) {
        return false;
      }
    }

    if (rule.condition.serverIds && rule.condition.serverIds.length > 0) {
      if (!request.serverId || !rule.condition.serverIds.includes(request.serverId)) {
        return false;
      }
    }

    if (rule.condition.blockedPatterns && rule.condition.blockedPatterns.length > 0) {
      const serialized = JSON.stringify(request.arguments);
      const matchesBlocked = rule.condition.blockedPatterns.some((pattern) =>
        serialized.toLowerCase().includes(pattern.toLowerCase())
      );
      if (!matchesBlocked) {
        return false;
      }
    }

    return true;
  }

  public static createDefaultPolicy(): SecurityPolicy {
    return {
      id: 'tars-default-security-policy',
      version: '1.0.0',
      name: 'TARS Production Baseline Security Policy',
      description: 'Deterministic security policy enforcing least privilege, command blocks, and path isolation.',
      defaultAction: 'REQUIRE_APPROVAL',
      rules: [
        {
          id: 'rule-block-dangerous-exec',
          name: 'Block Dangerous System Commands',
          action: 'BLOCK',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
          description: 'Prevents direct execution of shell or system commands.',
          condition: {
            toolNames: ['execute_system_command', 'shell_exec', 'exec_command', 'bash', 'terminal'],
          },
        },
        {
          id: 'rule-block-sensitive-files',
          name: 'Block Reads of Protected Sensitive Files',
          action: 'BLOCK',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
          description: 'Blocks reading protected sensitive files including sensitive.txt, credentials, and secrets.',
          condition: {
            toolNames: ['read_file', 'read_doc'],
            blockedPatterns: ['sensitive.txt', '.env', 'id_rsa', 'id_ed25519', 'credentials.json', 'secrets.json'],
          },
        },
        {
          id: 'rule-allow-safe-read',
          name: 'Allow Safe Read Tools',
          action: 'ALLOW',
          reasonCode: 'POLICY_ALLOW',
          description: 'Allows verified read-only operations.',
          condition: {
            toolNames: ['read_file', 'query_database', 'read_doc', 'get_weather', 'search_index'],
          },
        },
        {
          id: 'rule-require-approval-for-mutations',
          name: 'Require Approval for Mutation Tools',
          action: 'REQUIRE_APPROVAL',
          reasonCode: 'APPROVAL_REQUIRED',
          description: 'Requires human approval before modifying files or database entries.',
          condition: {
            toolNames: ['write_file', 'delete_file', 'update_database', 'send_email'],
          },
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }
}
