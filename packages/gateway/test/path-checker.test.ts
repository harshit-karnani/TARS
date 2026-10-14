import { describe, it, expect } from 'vitest';
import { checkFilePath, inspectArgumentsForPathViolations } from '../src/security/path-checker.js';

describe('Path Traversal Checker', () => {
  it('detects parent directory traversal attempt', () => {
    const res1 = checkFilePath('../secret.env');
    expect(res1.isSafe).toBe(false);
    expect(res1.violationReason).toContain('Path traversal');

    const res2 = checkFilePath('dir/../../etc/passwd');
    expect(res2.isSafe).toBe(false);
  });

  it('detects sensitive system paths', () => {
    const res = checkFilePath('/etc/shadow');
    expect(res.isSafe).toBe(false);
    expect(res.violationReason).toContain('sensitive system path');
  });

  it('allows safe relative and normalized file paths', () => {
    const res = checkFilePath('safe_data/records.json');
    expect(res.isSafe).toBe(true);
    expect(res.normalizedPath).toBeDefined();
  });

  it('inspects argument objects recursively for path violations', () => {
    const dangerousArgs = {
      action: 'read',
      options: {
        filePath: '../../root/id_rsa',
      },
    };

    const check = inspectArgumentsForPathViolations(dangerousArgs);
    expect(check.isSafe).toBe(false);
  });
});
