/**
 * Secret and sensitive data redactor.
 * Inspects parameters and responses, masking API keys, credentials, and tokens.
 */

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // Anthropic API keys
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  // OpenAI API keys
  { name: 'OpenAI API Key', regex: /sk-(?!ant-)[a-zA-Z0-9_-]{20,}/g },
  // GitHub Personal Access Tokens
  { name: 'GitHub Token', regex: /gh[pousr]-[a-zA-Z0-9]{36}/g },
  // Bearer Tokens
  { name: 'Bearer Token', regex: /Bearer\s+[a-zA-Z0-9._~+/-]{16,}/gi },
  // AWS Access Key IDs
  { name: 'AWS Access Key', regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  // Private Key Headers
  { name: 'Private Key', regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
  // Generic password in connection string or URL
  { name: 'Password in URI', regex: /:\/\/[^:]+:([^@]+)@/g },
];

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'private_key',
  'privatekey',
  'access_token',
  'client_secret',
]);

export interface RedactionResult<T> {
  sanitized: T;
  wasRedacted: boolean;
  redactedFields: string[];
}

/**
 * Redacts sensitive tokens from a string.
 */
export function redactString(input: string): { output: string; redactedTypes: string[] } {
  let output = input;
  const redactedTypes: string[] = [];

  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(output)) {
      redactedTypes.push(name);
      output = output.replace(regex, `[REDACTED_${name.toUpperCase().replace(/\s+/g, '_')}]`);
    }
  }

  return { output, redactedTypes };
}

/**
 * Recursively inspects and redacts secrets from arbitrary JSON-serializable payloads.
 */
export function redactPayload<T>(payload: T): RedactionResult<T> {
  const redactedFields: string[] = [];
  let wasRedacted = false;

  function traverse(value: unknown, currentPath: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      const { output, redactedTypes } = redactString(value);
      if (redactedTypes.length > 0) {
        wasRedacted = true;
        redactedFields.push(...redactedTypes.map((t) => `${currentPath} (${t})`));
        return output;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item, idx) => traverse(item, `${currentPath}[${idx}]`));
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [k, v] of Object.entries(obj)) {
        const nextPath = currentPath ? `${currentPath}.${k}` : k;
        const normalizedKey = k.toLowerCase().replace(/[-_]/g, '');

        if (SENSITIVE_KEY_NAMES.has(normalizedKey) && typeof v === 'string') {
          wasRedacted = true;
          redactedFields.push(nextPath);
          result[k] = '[REDACTED]';
        } else {
          result[k] = traverse(v, nextPath);
        }
      }
      return result;
    }

    return value;
  }

  const sanitized = traverse(payload, '') as T;

  return {
    sanitized,
    wasRedacted,
    redactedFields: [...new Set(redactedFields)],
  };
}
