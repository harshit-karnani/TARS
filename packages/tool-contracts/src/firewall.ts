import type {
  IContractRegistry,
  ToolContract,
  ContractStatus
} from './types.ts';

export type FirewallAction = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

export interface FirewallDecision {
  action: FirewallAction;
  reasonCode: string;
  contractVersion?: string;
  contractStatus?: ContractStatus;
  contract?: ToolContract;
  evidence: {
    contractVerified: boolean;
    driftDetected: boolean;
    evaluatedChecks: string[];
    schemaViolations?: string[];
    notes?: string;
  };
}

/**
 * Validates whether argument values conform to JSON schema parameter expectations.
 */
export function validateArguments(
  schema: Record<string, unknown>,
  args: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const properties = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const required = (schema.required ?? []) as string[];
  const additionalProperties = schema.additionalProperties;

  // 1. Required fields check
  for (const reqField of required) {
    if (args[reqField] === undefined || args[reqField] === null) {
      errors.push(`Missing required parameter: "${reqField}"`);
    }
  }

  // 2. Type checking for provided fields
  for (const [key, value] of Object.entries(args)) {
    const propDef = properties[key];

    if (!propDef) {
      if (additionalProperties === false) {
        errors.push(`Disallowed additional parameter: "${key}"`);
      }
      continue;
    }

    if (value === undefined || value === null) continue;

    const expectedType = propDef.type;
    if (!expectedType) continue;

    if (expectedType === 'string' && typeof value !== 'string') {
      errors.push(`Parameter "${key}" must be string, received ${typeof value}`);
    } else if (expectedType === 'number' && typeof value !== 'number') {
      errors.push(`Parameter "${key}" must be number, received ${typeof value}`);
    } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Parameter "${key}" must be boolean, received ${typeof value}`);
    } else if (expectedType === 'array' && !Array.isArray(value)) {
      errors.push(`Parameter "${key}" must be an array`);
    } else if (
      expectedType === 'object' &&
      (typeof value !== 'object' || Array.isArray(value))
    ) {
      errors.push(`Parameter "${key}" must be an object`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * ContractFirewall enforces runtime contract policy on incoming MCP tool calls.
 * Verifies tool registration, lifecycle status, and input schema conformance.
 */
export class ContractFirewall {
  private registry: IContractRegistry;

  constructor(registry: IContractRegistry) {
    this.registry = registry;
  }

  async evaluateToolCall(params: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }): Promise<FirewallDecision> {
    const evaluatedChecks: string[] = ['contract_existence_check'];
    const contract = await this.registry.getContract(params.serverId, params.toolName);

    // 1. Check if tool is registered
    if (!contract) {
      return {
        action: 'REQUIRE_APPROVAL',
        reasonCode: 'UNKNOWN_TOOL',
        evidence: {
          contractVerified: false,
          driftDetected: false,
          evaluatedChecks,
          notes: `Tool "${params.toolName}" on server "${params.serverId}" is not registered in contract baseline`
        }
      };
    }

    evaluatedChecks.push('contract_status_check');

    // 2. Check contract lifecycle status
    if (contract.status === 'BLOCKED') {
      return {
        action: 'BLOCK',
        reasonCode: 'POLICY_BLOCK',
        contractVersion: contract.version,
        contractStatus: contract.status,
        contract,
        evidence: {
          contractVerified: true,
          driftDetected: false,
          evaluatedChecks,
          notes: contract.notes
            ? `Execution blocked: Contract status is BLOCKED (${contract.notes})`
            : 'Execution blocked: Contract status is BLOCKED'
        }
      };
    }

    if (contract.status === 'DRIFTED') {
      return {
        action: 'BLOCK',
        reasonCode: 'SCHEMA_DRIFT_DETECTED',
        contractVersion: contract.version,
        contractStatus: contract.status,
        contract,
        evidence: {
          contractVerified: true,
          driftDetected: true,
          evaluatedChecks,
          notes: 'Tool definition has drifted from approved baseline contract'
        }
      };
    }

    if (contract.status === 'PENDING_REVIEW') {
      return {
        action: 'REQUIRE_APPROVAL',
        reasonCode: 'APPROVAL_REQUIRED',
        contractVersion: contract.version,
        contractStatus: contract.status,
        contract,
        evidence: {
          contractVerified: true,
          driftDetected: false,
          evaluatedChecks,
          notes: 'Tool contract is currently pending administrative review'
        }
      };
    }

    if (contract.status === 'DEPRECATED') {
      return {
        action: 'REQUIRE_APPROVAL',
        reasonCode: 'APPROVAL_REQUIRED',
        contractVersion: contract.version,
        contractStatus: contract.status,
        contract,
        evidence: {
          contractVerified: true,
          driftDetected: false,
          evaluatedChecks,
          notes: 'Tool contract has been deprecated'
        }
      };
    }

    // 3. Status is ACTIVE: Validate tool arguments against registered inputSchema
    evaluatedChecks.push('schema_arguments_validation');
    const argValidation = validateArguments(contract.inputSchema, params.arguments ?? {});

    if (!argValidation.valid) {
      return {
        action: 'BLOCK',
        reasonCode: 'SCHEMA_MISMATCH',
        contractVersion: contract.version,
        contractStatus: contract.status,
        contract,
        evidence: {
          contractVerified: true,
          driftDetected: false,
          evaluatedChecks,
          schemaViolations: argValidation.errors,
          notes: `Input arguments violated contract schema: ${argValidation.errors.join('; ')}`
        }
      };
    }

    // 4. All checks passed
    evaluatedChecks.push('contract_policy_passed');
    return {
      action: 'ALLOW',
      reasonCode: 'POLICY_ALLOW',
      contractVersion: contract.version,
      contractStatus: contract.status,
      contract,
      evidence: {
        contractVerified: true,
        driftDetected: false,
        evaluatedChecks,
        notes: `Contract verified against version ${contract.version} (${contract.status})`
      }
    };
  }
}
