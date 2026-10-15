import * as path from 'node:path';

export interface PathCheckResult {
  isSafe: boolean;
  normalizedPath?: string;
  violationReason?: string;
}

const SENSITIVE_SYSTEM_PREFIXES = [
  '/etc',
  '/var/run',
  '/root',
  '/proc',
  '/sys',
  'c:\\windows',
  'c:\\windows\\system32',
  'c:\\program files',
  '~/.ssh',
  '~/.aws',
  '~/.gnupg',
];

const SENSITIVE_FILE_PATTERNS = [
  'sensitive.txt',
  '.env',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
  'passwd',
  'shadow',
];

/**
 * Checks a path argument against traversal patterns and restricted system locations.
 */
export function checkFilePath(filePath: string, allowedRoot?: string): PathCheckResult {
  if (!filePath || typeof filePath !== 'string') {
    return { isSafe: true };
  }

  // Traversal pattern check
  if (filePath.includes('../') || filePath.includes('..\\') || filePath === '..') {
    return {
      isSafe: false,
      violationReason: 'Path traversal sequence (..) detected',
    };
  }

  const normalized = path.normalize(filePath);

  // Sensitive directory checks
  const lower = normalized.toLowerCase().replace(/\\/g, '/');
  for (const prefix of SENSITIVE_SYSTEM_PREFIXES) {
    const normPrefix = prefix.toLowerCase().replace(/\\/g, '/');
    if (lower.startsWith(normPrefix)) {
      return {
        isSafe: false,
        violationReason: `Access to sensitive system path restricted (${prefix})`,
      };
    }
  }

  // Sensitive protected file checks (e.g. sensitive.txt, .env)
  const baseName = path.basename(normalized).toLowerCase();
  for (const sensitiveFile of SENSITIVE_FILE_PATTERNS) {
    if (baseName === sensitiveFile.toLowerCase() || baseName.endsWith(sensitiveFile.toLowerCase())) {
      return {
        isSafe: false,
        violationReason: `Access to protected sensitive file restricted (${baseName})`,
      };
    }
  }

  // Check if within allowed root if provided
  if (allowedRoot) {
    const resolvedRoot = path.resolve(allowedRoot);
    const resolvedTarget = path.resolve(allowedRoot, filePath);
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      return {
        isSafe: false,
        violationReason: 'Path escapes configured allowed root directory',
      };
    }
    return {
      isSafe: true,
      normalizedPath: resolvedTarget,
    };
  }

  return {
    isSafe: true,
    normalizedPath: normalized,
  };
}

/**
 * Recursively inspects object properties for path-like fields and verifies safety.
 */
export function inspectArgumentsForPathViolations(
  args: Record<string, unknown>,
  allowedRoot?: string
): PathCheckResult {
  const pathKeys = ['path', 'filepath', 'dir', 'directory', 'filename', 'file'];

  for (const [key, value] of Object.entries(args)) {
    const normKey = key.toLowerCase().replace(/[-_]/g, '');
    if (pathKeys.includes(normKey) && typeof value === 'string') {
      const check = checkFilePath(value, allowedRoot);
      if (!check.isSafe) {
        return check;
      }
    }
    if (typeof value === 'object' && value !== null) {
      const nestedCheck = inspectArgumentsForPathViolations(
        value as Record<string, unknown>,
        allowedRoot
      );
      if (!nestedCheck.isSafe) {
        return nestedCheck;
      }
    }
  }

  return { isSafe: true };
}
