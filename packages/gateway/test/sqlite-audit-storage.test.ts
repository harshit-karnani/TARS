import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAuditStorage } from '../src/storage/sqlite-audit-storage.js';
import type { AuditEvent } from '@tars/shared-types';

describe('SqliteAuditStorage', () => {
  let storage: SqliteAuditStorage;

  beforeEach(async () => {
    storage = new SqliteAuditStorage(':memory:');
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  it('records and queries audit events with filters and pagination', async () => {
    const event1: AuditEvent = {
      id: 'evt-1',
      requestId: 'req-1',
      timestamp: '2026-10-14T12:00:00.000Z',
      tool: 'read_file',
      action: 'ALLOW',
      reasonCode: 'POLICY_ALLOW',
      executionStatus: 'SUCCESS',
      policyVersion: '1.0.0',
      parameters: { path: 'test.txt' },
      redacted: false,
      latencyMs: 15.2,
    };

    const event2: AuditEvent = {
      id: 'evt-2',
      requestId: 'req-2',
      timestamp: '2026-10-14T12:05:00.000Z',
      tool: 'execute_command',
      action: 'BLOCK',
      reasonCode: 'SENSITIVE_PATH_ACCESS',
      executionStatus: 'BLOCKED',
      policyVersion: '1.0.0',
      parameters: { cmd: 'rm -rf' },
      redacted: false,
      latencyMs: 1.1,
    };

    await storage.recordEvent(event1);
    await storage.recordEvent(event2);

    const total = await storage.countEvents();
    expect(total).toBe(2);

    const blockedEvents = await storage.queryEvents({ action: 'BLOCK' });
    expect(blockedEvents.length).toBe(1);
    expect(blockedEvents[0].id).toBe('evt-2');
    expect(blockedEvents[0].action).toBe('BLOCK');

    const byId = await storage.getEventById('evt-1');
    expect(byId).not.toBeNull();
    expect(byId?.tool).toBe('read_file');
    expect(byId?.parameters).toEqual({ path: 'test.txt' });
  });
});
