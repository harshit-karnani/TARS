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

  it('allows safe relative and normalized file paths including safe.txt', () => {
    const res = checkFilePath('safe_data/records.json');
    expect(res.isSafe).toBe(true);
    expect(res.normalizedPath).toBeDefined();

    const safeFile = checkFilePath('safe.txt');
    expect(safeFile.isSafe).toBe(true);
  });

  it('blocks protected sensitive files like sensitive.txt and .env', () => {
    const res1 = checkFilePath('sensitive.txt');
    expect(res1.isSafe).toBe(false);
    expect(res1.violationReason).toContain('protected sensitive file restricted');

    const res2 = checkFilePath('subdir/sensitive.txt');
    expect(res2.isSafe).toBe(false);

    const res3 = checkFilePath('.env');
    expect(res3.isSafe).toBe(false);
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

