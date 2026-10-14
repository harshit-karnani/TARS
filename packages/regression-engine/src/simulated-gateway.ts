import type { GatewayEvaluator } from './types.ts';
import { ContractFirewall } from '../../tool-contracts/src/firewall.ts';
import { SqliteContractRegistry } from '../../tool-contracts/src/sqlite-registry.ts';
import { seedStandardContracts } from '../../tool-contracts/src/seeder.ts';

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,
  /%2e%2e/i,
  /\/etc\//i,
  /\\windows\\system32/i,
  /c:\\windows/i
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /output all.*credentials/i,
  /!\[.*\]\(http/i, // Markdown exfiltration
  /(?:\n|\\n){2}Human:.*(?:\n|\\n)Assistant:/is, // Context turn injection
  /Human:.*reveal.*token/i,
  /system prompt/i
];

const COMMAND_INJECTION_PATTERNS = [
  /;[\s\w]/,
  /\$\(/,
  /`[\s\w]+`/,
  /\|\s*bash/i,
  /&&\s*\w+/
];

function extractStringValues(obj: unknown): string[] {
  const strings: string[] = [];
  if (typeof obj === 'string') {
    strings.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) strings.push(...extractStringValues(item));
  } else if (obj !== null && typeof obj === 'object') {
    for (const val of Object.values(obj)) strings.push(...extractStringValues(val));
  }
  return strings;
}

/**
 * Creates a deterministic simulated gateway evaluator for regression test replay.
 * Combines ContractFirewall schema/status checks with heuristic attack pattern inspection.
 */
export async function createSimulatedGateway(): Promise<{
  evaluator: GatewayEvaluator;
  registry: SqliteContractRegistry;
  firewall: ContractFirewall;
}> {
  const registry = new SqliteContractRegistry(':memory:');
  await seedStandardContracts(registry);
  const firewall = new ContractFirewall(registry);

  const evaluator: GatewayEvaluator = async (request) => {
    const serverId = request.serverId ?? 'filesystem-server';
    const toolName = request.toolName;
    const args = request.arguments ?? {};

    // 1. Contract Firewall Evaluation (lifecycle status + schema conformance)
    const firewallDecision = await firewall.evaluateToolCall({
      serverId,
      toolName,
      arguments: args
    });

    if (firewallDecision.action !== 'ALLOW') {
      return {
        action: firewallDecision.action,
        reasonCode: firewallDecision.reasonCode,
        notes: firewallDecision.evidence.notes
      };
    }

    // 2. Deep Payload Inspection across all extracted parameter strings
    const stringValues = extractStringValues(args);
    const payloadText = stringValues.join(' \n ');

    // Check Path Traversal
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(payloadText)) {
        return {
          action: 'BLOCK',
          reasonCode: 'SENSITIVE_PATH_ACCESS',
          notes: `Path traversal pattern detected matching: ${pattern}`
        };
      }
    }

    // Check Prompt Injection
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(payloadText)) {
        return {
          action: 'BLOCK',
          reasonCode: 'PROMPT_INJECTION_RISK',
          notes: `Prompt injection attack signature identified: ${pattern}`
        };
      }
    }

    // Check Command Injection
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(payloadText)) {
        return {
          action: 'BLOCK',
          reasonCode: 'POLICY_BLOCK',
          notes: `Shell command injection sequence detected: ${pattern}`
        };
      }
    }

    // 3. Permitted Request
    return {
      action: 'ALLOW',
      reasonCode: 'POLICY_ALLOW',
      notes: 'Passed contract schema verification and security pattern inspection'
    };
  };

  return { evaluator, registry, firewall };
}
