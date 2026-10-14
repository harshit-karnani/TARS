import { createHash } from 'node:crypto';
import type { ToolContract, SchemaDifference } from './types.ts';
import { isContractStatus } from './types.ts';

const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|credential|auth|cert|private|api[-_]?key)/i;
const SENSITIVE_VALUE_PATTERN = /^(?:sk-[a-zA-Z0-9_\-]{16,}|ghp_[a-zA-Z0-9]{16,}|bearer\s+[a-zA-Z0-9._\-]+)/i;

/**
 * Sanitizes a value for safe inclusion in audit logs and drift diff reports.
 * Prevents inadvertent secret leakage.
 */
export function sanitizeDiffValue(path: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY_PATTERN.test(path)) {
    return '[REDACTED_SECRET]';
  }
  if (typeof value === 'string' && SENSITIVE_VALUE_PATTERN.test(value)) {
    return '[REDACTED_SECRET]';
  }
  return value;
}

/**
 * Deterministically serializes any JavaScript value into canonical JSON.
 * - Object keys are sorted lexicographically at every recursive depth.
 * - Array element ordering is strictly preserved.
 * - Undefined values in objects are omitted.
 * - Whitespace is normalized (no extra spacing).
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const elements = value.map((item) => canonicalizeJson(item));
    return `[${elements.join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalizeJson(val)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

/**
 * Computes a deterministic SHA-256 hash for a tool definition.
 * Strictly hashes over:
 * 1. serverId (server identity)
 * 2. toolName (normalizes MCP `name` field if provided)
 * 3. description (normalized and trimmed)
 * 4. inputSchema (recursively key-sorted)
 */
export function computeDefinitionHash(definition: {
  serverId?: string;
  toolName?: string;
  name?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}): string {
  const resolvedToolName = (definition.toolName ?? definition.name ?? '').trim();
  const normalized = {
    serverId: (definition.serverId ?? '').trim(),
    toolName: resolvedToolName,
    description: (definition.description ?? '').trim(),
    inputSchema: definition.inputSchema ?? { type: 'object' }
  };

  const canonicalString = canonicalizeJson(normalized);
  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

/**
 * Verifies that a contract's definitionHash strictly matches the computed canonical hash.
 */
export function verifyContractHash(contract: ToolContract): boolean {
  const computed = computeDefinitionHash({
    serverId: contract.serverId,
    toolName: contract.toolName,
    description: contract.description,
    inputSchema: contract.inputSchema
  });
  return contract.definitionHash === computed;
}

/**
 * Performs a deep recursive schema difference analysis between expected and actual schemas.
 * Returns granular SchemaDifference records for contract drift analysis.
 * Automatically redacts sensitive tokens or secrets from diff reports.
 */
export function diffSchemas(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  basePath = 'inputSchema'
): SchemaDifference[] {
  const differences: SchemaDifference[] = [];

  const expectedKeys = new Set(Object.keys(expected ?? {}));
  const actualKeys = new Set(Object.keys(actual ?? {}));

  // Detect added properties
  for (const key of actualKeys) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (!expectedKeys.has(key)) {
      const safeActual = sanitizeDiffValue(path, actual[key]);
      differences.push({
        path,
        changeType: 'ADDED',
        actual: safeActual,
        description: `New parameter or constraint "${path}" was added to tool definition`
      });
    }
  }

  // Detect removed properties
  for (const key of expectedKeys) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (!actualKeys.has(key)) {
      const safeExpected = sanitizeDiffValue(path, expected[key]);
      differences.push({
        path,
        changeType: 'REMOVED',
        expected: safeExpected,
        description: `Expected parameter or constraint "${path}" was removed from tool definition`
      });
    }
  }

  // Detect modified properties
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) continue;

    const path = basePath ? `${basePath}.${key}` : key;
    const expVal = expected[key];
    const actVal = actual[key];

    if (
      expVal !== null &&
      actVal !== null &&
      typeof expVal === 'object' &&
      typeof actVal === 'object' &&
      !Array.isArray(expVal) &&
      !Array.isArray(actVal)
    ) {
      differences.push(
        ...diffSchemas(
          expVal as Record<string, unknown>,
          actVal as Record<string, unknown>,
          path
        )
      );
    } else {
      const expCanonical = canonicalizeJson(expVal);
      const actCanonical = canonicalizeJson(actVal);
      if (expCanonical !== actCanonical) {
        const safeExpected = sanitizeDiffValue(path, expVal);
        const safeActual = sanitizeDiffValue(path, actVal);
        differences.push({
          path,
          changeType: 'MODIFIED',
          expected: safeExpected,
          actual: safeActual,
          description: `Value of "${path}" changed from ${canonicalizeJson(safeExpected)} to ${canonicalizeJson(safeActual)}`
        });
      }
    }
  }

  return differences;
}

/**
 * Validates whether an object strictly conforms to Person 1's canonical ToolContract specification.
 */
export function validateContract(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Contract must be an object'] };
  }

  const contract = data as Partial<ToolContract>;

  if (!contract.serverId || typeof contract.serverId !== 'string') {
    errors.push('serverId is required and must be a non-empty string');
  }

  if (!contract.toolName || typeof contract.toolName !== 'string') {
    errors.push('toolName is required and must be a non-empty string');
  }

  if (contract.description !== undefined && typeof contract.description !== 'string') {
    errors.push('description must be a string if provided');
  }

  if (!contract.inputSchema || typeof contract.inputSchema !== 'object') {
    errors.push('inputSchema is required and must be an object');
  }

  if (
    !contract.definitionHash ||
    typeof contract.definitionHash !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(contract.definitionHash)
  ) {
    errors.push('definitionHash must be a 64-character SHA-256 hex string');
  }

  if (!contract.version || typeof contract.version !== 'string') {
    errors.push('version is required and must be a string (e.g. "1.0.0")');
  }

  if (!contract.status || !isContractStatus(contract.status)) {
    errors.push(`status must be one of: ACTIVE, DRIFTED, DEPRECATED, BLOCKED, PENDING_REVIEW`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
