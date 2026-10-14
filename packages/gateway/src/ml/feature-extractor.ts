import type { ToolCallRequest, ToolContract } from '@tars/shared-types';
import { validateArgumentsAgainstSchema } from '../policy/schema-validator.js';
import { inspectArgumentsForPathViolations } from '../security/path-checker.js';
import { inspectArgumentsForInjection } from '../security/injection-detector.js';

export interface MlScoringFeatures {
  tool_name: string;
  tool_category: string;
  is_mutation: number;
  schema_valid: number;
  path_traversal: number;
  prompt_injection: number;
  suspicious_command: number;
  unknown_tool: number;
  contract_drift: number;
  payload_size: number;
}

export interface FeatureExtractionContext {
  matchedContract?: ToolContract;
  allowedRoot?: string;
}

const SUSPICIOUS_COMMAND_TOOLS = new Set([
  'execute_system_command',
  'shell_exec',
  'exec_command',
  'bash',
  'terminal',
  'system_exec',
  'cmd',
  'powershell',
]);

const MUTATION_TOOLS = new Set([
  'write_file',
  'delete_file',
  'update_database',
  'send_email',
  'execute_system_command',
  'shell_exec',
  'exec_command',
  'bash',
  'terminal',
]);

const MUTATION_PREFIXES = ['write_', 'delete_', 'update_', 'modify_', 'create_', 'set_', 'remove_', 'drop_'];

/**
 * Determines whether a tool invocation represents a mutating state change.
 */
export function isMutationTool(toolName: string): number {
  const lower = toolName.toLowerCase();
  if (MUTATION_TOOLS.has(lower)) {
    return 1;
  }
  for (const prefix of MUTATION_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return 1;
    }
  }
  return 0;
}

/**
 * Determines whether a tool invocation represents a shell or system command execution.
 */
export function isSuspiciousCommand(toolName: string, args?: Record<string, unknown>): number {
  if (SUSPICIOUS_COMMAND_TOOLS.has(toolName.toLowerCase())) {
    return 1;
  }
  if (args && typeof args === 'object') {
    if (typeof args.command === 'string' && args.command.trim().length > 0) {
      return 1;
    }
    if (typeof args.cmd === 'string' && args.cmd.trim().length > 0) {
      return 1;
    }
  }
  return 0;
}

/**
 * Categorizes a tool based on its name and server identity.
 */
export function inferToolCategory(toolName: string, serverId?: string): string {
  const lower = toolName.toLowerCase();
  const lowerServer = (serverId || '').toLowerCase();

  if (
    lower.includes('file') ||
    lower.includes('dir') ||
    lower.includes('fs') ||
    lowerServer.includes('fs')
  ) {
    return 'filesystem';
  }
  if (
    lower.includes('command') ||
    lower.includes('exec') ||
    lower.includes('shell') ||
    lower.includes('bash') ||
    lower.includes('terminal') ||
    lowerServer.includes('system')
  ) {
    return 'system';
  }
  if (
    lower.includes('database') ||
    lower.includes('sql') ||
    lower.includes('query') ||
    lower.includes('db') ||
    lowerServer.includes('db') ||
    lowerServer.includes('database')
  ) {
    return 'database';
  }
  if (lower.includes('search') || lower.includes('index')) {
    return 'search';
  }
  if (lower.includes('weather') || lower.includes('api') || lower.includes('http')) {
    return 'api';
  }
  if (lower.includes('email') || lower.includes('mail') || lower.includes('message') || lower.includes('notify')) {
    return 'communication';
  }
  return 'unknown';
}

/**
 * Extracts the 10 numerical and categorical features required by the TARS ML risk classifier.
 * Never includes raw file content, credentials, or arbitrary argument values.
 */
export function extractMlFeatures(
  request: ToolCallRequest,
  context: FeatureExtractionContext = {}
): MlScoringFeatures {
  const args = request.arguments || {};
  const serialized = JSON.stringify(args);
  const payloadSize = Buffer.byteLength(serialized, 'utf8');

  const toolCategory = inferToolCategory(request.toolName, request.serverId);
  const isMutation = isMutationTool(request.toolName);

  // Path traversal check
  const pathCheck = inspectArgumentsForPathViolations(args, context.allowedRoot);
  const pathTraversal = pathCheck.isSafe ? 0 : 1;

  // Prompt injection check
  const injection = inspectArgumentsForInjection(args);
  const promptInjection = (injection.hasRisk || injection.riskScore >= 30) ? 1 : 0;

  // Suspicious command check
  const suspiciousCommand = isSuspiciousCommand(request.toolName, args);

  // Unknown tool check
  const unknownTool = context.matchedContract ? 0 : 1;

  // Schema validation against contract if registered
  let schemaValid = 1;
  if (context.matchedContract?.inputSchema) {
    const schemaCheck = validateArgumentsAgainstSchema(args, context.matchedContract.inputSchema);
    schemaValid = schemaCheck.isValid ? 1 : 0;
  }

  // Contract drift check
  const contractDrift = context.matchedContract?.status === 'DRIFTED' ? 1 : 0;

  return {
    tool_name: request.toolName,
    tool_category: toolCategory,
    is_mutation: isMutation,
    schema_valid: schemaValid,
    path_traversal: pathTraversal,
    prompt_injection: promptInjection,
    suspicious_command: suspiciousCommand,
    unknown_tool: unknownTool,
    contract_drift: contractDrift,
    payload_size: payloadSize,
  };
}
