/**
 * Secret and sensitive data redactor.
 * Inspects parameters and responses, masking API keys, credentials, and tokens.
 */

export interface SecretPattern {
  name: string;
  regex: RegExp;
  replace?: (match: string, ...args: any[]) => string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // Anthropic API keys
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  // OpenAI API keys
  { name: 'OpenAI API Key', regex: /sk-(?!ant-)[a-zA-Z0-9_-]{20,}/g },
  // GitHub Personal Access Tokens (ghp_, gho_, ghu_, ghs_, ghr_ with _ or -)
  { name: 'GitHub Token', regex: /gh[pousr][-_][a-zA-Z0-9_]{16,}/g },
  // Bearer Tokens
  { name: 'Bearer Token', regex: /Bearer\s+[a-zA-Z0-9._~+/-]{16,}/gi },
  // AWS Access Key IDs
  { name: 'AWS Access Key', regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  // Private Key Headers
  {
    name: 'Private Key',
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  },
  // Generic password in connection string or URL
  { name: 'Password in URI', regex: /:\/\/[^:]+:([^@]+)@/g },
  // AWS Secret Access Key assignment
  {
    name: 'AWS Secret Access Key',
    regex: /\b((?:AWS_SECRET_ACCESS_KEY|AWS_SECRET_KEY)\s*[:=]\s*)(?:(['"])(?!\s*\[REDACTED)([\s\S]*?)\2|(?!\s*\[REDACTED)([^\s\r\n]+))/gi,
    replace: (_match, p1, p2) => (p2 ? `${p1}${p2}[REDACTED_AWS_SECRET_ACCESS_KEY]${p2}` : `${p1}[REDACTED_AWS_SECRET_ACCESS_KEY]`),
  },
  // AWS Access Key ID assignment
  {
    name: 'AWS Access Key',
    regex: /\b(AWS_ACCESS_KEY_ID\s*[:=]\s*)(?:(['"])(?!\s*\[REDACTED)([\s\S]*?)\2|(?!\s*\[REDACTED)([^\s\r\n]+))/gi,
    replace: (_match, p1, p2) => (p2 ? `${p1}${p2}[REDACTED_AWS_ACCESS_KEY]${p2}` : `${p1}[REDACTED_AWS_ACCESS_KEY]`),
  },
  // Database Password assignment
  {
    name: 'Database Password',
    regex: /\b((?:DATABASE_PASSWORD|DB_PASSWORD|DATABASE_PASS|DB_PASS)\s*[:=]\s*)(?:(['"])(?!\s*\[REDACTED)([\s\S]*?)\2|(?!\s*\[REDACTED)([^\s\r\n]+))/gi,
    replace: (_match, p1, p2) => (p2 ? `${p1}${p2}[REDACTED_DATABASE_PASSWORD]${p2}` : `${p1}[REDACTED_DATABASE_PASSWORD]`),
  },
  // GitHub Token assignment
  {
    name: 'GitHub Token',
    regex: /\b((?:GITHUB_TOKEN|GH_TOKEN)\s*[:=]\s*)(?:(['"])(?!\s*\[REDACTED)([\s\S]*?)\2|(?!\s*\[REDACTED)([^\s\r\n]+))/gi,
    replace: (_match, p1, p2) => (p2 ? `${p1}${p2}[REDACTED_GITHUB_TOKEN]${p2}` : `${p1}[REDACTED_GITHUB_TOKEN]`),
  },
  // API Key assignment
  {
    name: 'API Key',
    regex: /\b((?:[a-zA-Z0-9_]*API_KEY|APIKEY)\s*[:=]\s*)(?:(['"])(?!\s*\[REDACTED)([\s\S]*?)\2|(?!\s*\[REDACTED)([^\s\r\n]+))/gi,
    replace: (_match, p1, p2) => (p2 ? `${p1}${p2}[REDACTED_API_KEY]${p2}` : `${p1}[REDACTED_API_KEY]`),
  },
];

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'private_key',
  'privatekey',
  'access_token',
  'client_secret',
  'clientsecret',
  'aws_secret_access_key',
  'awssecretaccesskey',
  'aws_access_key_id',
  'awsaccesskeyid',
  'secretaccesskey',
  'accesskey',
  'database_password',
  'databasepassword',
  'db_password',
  'dbpassword',
  'github_token',
  'githubtoken',
  'ghtoken',
  'secret_key',
  'secretkey',
]);

function isSensitiveKeyName(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  if (SENSITIVE_KEY_NAMES.has(normalizedKey) || SENSITIVE_KEY_NAMES.has(key.toLowerCase())) {
    return true;
  }
  return (
    normalizedKey.endsWith('password') ||
    normalizedKey.endsWith('passwd') ||
    normalizedKey.endsWith('secret') ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('apikey') ||
    normalizedKey.startsWith('apikey') ||
    normalizedKey.includes('secretkey') ||
    normalizedKey.includes('privatekey')
  );
}

export interface RedactionResult<T> {
  sanitized: T;
  wasRedacted: boolean;
  redactedFields: string[];
}

/**
 * Redacts sensitive tokens and credential assignments from a string.
 */
export function redactString(input: string): { output: string; redactedTypes: string[] } {
  let output = input;
  const redactedTypes: string[] = [];

  for (const { name, regex, replace } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(output)) {
      regex.lastIndex = 0;
      redactedTypes.push(name);
      if (replace) {
        output = output.replace(regex, replace);
      } else {
        output = output.replace(regex, `[REDACTED_${name.toUpperCase().replace(/\s+/g, '_')}]`);
      }
    }
  }

  return { output, redactedTypes: [...new Set(redactedTypes)] };
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
        redactedFields.push(...redactedTypes.map((t) => (currentPath ? `${currentPath} (${t})` : t)));
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

        if (isSensitiveKeyName(k)) {
          if (v === '[REDACTED]') {
            result[k] = v;
          } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            wasRedacted = true;
            redactedFields.push(nextPath);
            result[k] = '[REDACTED]';
          } else {
            result[k] = traverse(v, nextPath);
          }
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
