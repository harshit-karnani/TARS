import type {
  SecurityAction,
  SecurityPolicy,
  PolicyRule,
  ToolCallRequest,
  PolicyDecision,
} from '@tars/shared-types';

export class PolicyEngine {
  private policy: SecurityPolicy;

  constructor(policy?: SecurityPolicy) {
    this.policy = policy ?? PolicyEngine.createDefaultPolicy();
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

  /**
   * Deterministically evaluates a tool call request against configured rules.
   */
  public evaluate(request: ToolCallRequest): PolicyDecision {
    const checks: string[] = ['rule_matcher'];

    for (const rule of this.policy.rules) {
      if (this.matchesRule(rule, request)) {
        return {
          action: rule.action,
          reasonCode: rule.reasonCode,
          policyVersion: this.policy.version,
          evidence: {
            matchedRuleId: rule.id,
            matchedRuleName: rule.name,
            evaluatedChecks: checks,
          },
          sanitizedArguments: request.arguments,
        };
      }
    }

    // Default fallback action
    return {
      action: this.policy.defaultAction,
      reasonCode: this.policy.defaultAction === 'ALLOW' ? 'POLICY_ALLOW' : 'POLICY_BLOCK',
      policyVersion: this.policy.version,
      evidence: {
        matchedRuleId: 'default-fallback',
        evaluatedChecks: checks,
      },
      sanitizedArguments: request.arguments,
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

    return true;
  }

  public static createDefaultPolicy(): SecurityPolicy {
    return {
      id: 'default-security-policy',
      version: '1.0.0',
      name: 'Default Strict Gateway Policy',
      description: 'Default baseline policy for TARS runtime gateway',
      defaultAction: 'REQUIRE_APPROVAL',
      rules: [
        {
          id: 'rule-block-dangerous-system',
          name: 'Block Dangerous System Commands',
          action: 'BLOCK',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
          condition: {
            toolNames: ['execute_system_command', 'shell_exec'],
          },
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }
}
