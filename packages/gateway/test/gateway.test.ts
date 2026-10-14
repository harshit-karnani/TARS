import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TarsGateway } from '../src/gateway.js';
import { PolicyEngine } from '../src/policy/policy-engine.js';
import { InMemoryAuditStorage } from '../src/storage/audit-storage.js';
import type { ToolCallRequest } from '@tars/shared-types';

describe('TarsGateway Foundation', () => {
  let gateway: TarsGateway;

  beforeEach(async () => {
    gateway = new TarsGateway();
    await gateway.initialize();
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  it('initializes with default configuration', () => {
    const config = gateway.getConfig();
    expect(config.port).toBe(8443);
    expect(config.policyVersion).toBe('1.0.0');
    expect(config.enableRedaction).toBe(true);

    const status = gateway.getStatus();
    expect(status.isRunning).toBe(true);
  });

  it('intercepts tool call and blocks dangerous system execution according to policy', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-block-test',
      toolName: 'execute_system_command',
      arguments: { cmd: 'rm -rf /' },
      timestamp: new Date().toISOString(),
    };

    const decision = await gateway.interceptToolCall(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('SENSITIVE_PATH_ACCESS');

    // Verify audit record was created
    const auditStorage = gateway.getAuditStorage();
    const events = await auditStorage.queryEvents({ tool: 'execute_system_command' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('BLOCK');
    expect(events[0].executionStatus).toBe('BLOCKED');
  });

  it('falls back to defaultAction REQUIRE_APPROVAL for unknown tool', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-fallback-test',
      toolName: 'some_arbitrary_unregistered_tool',
      arguments: { param: 'test' },
      timestamp: new Date().toISOString(),
    };

    const decision = await gateway.interceptToolCall(request);
    expect(decision.action).toBe('REQUIRE_APPROVAL');

    const auditStorage = gateway.getAuditStorage();
    const events = await auditStorage.queryEvents({ tool: 'some_arbitrary_unregistered_tool' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('REQUIRE_APPROVAL');
  });
});
