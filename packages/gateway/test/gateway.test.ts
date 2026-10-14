import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TarsGateway } from '../src/gateway.js';
import type { ToolCallRequest } from '@tars/shared-types';

describe('TarsGateway Core & Security Suite', () => {
  let gateway: TarsGateway;

  beforeEach(async () => {
    gateway = new TarsGateway({
      port: 0, // ephemeral port for testing
      dbPath: ':memory:',
    });
    await gateway.initialize(false);
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  it('initializes gateway components successfully', () => {
    const status = gateway.getStatus();
    expect(status.isRunning).toBe(true);
    expect(status.config.policyVersion).toBe('1.0.0');
    expect(status.config.enableRedaction).toBe(true);
  });

  it('blocks dangerous system command and creates BLOCKED audit record', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-sys-block',
      toolName: 'execute_system_command',
      arguments: { command: 'cat /etc/passwd' },
      timestamp: new Date().toISOString(),
    };

    const response = await gateway.handleToolCall(request);
    expect(response.action).toBe('BLOCK');
    expect(response.success).toBe(false);
    expect(response.error).toContain('blocked by TARS security policy');

    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents({ tool: 'execute_system_command' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('BLOCK');
    expect(events[0].executionStatus).toBe('BLOCKED');
  });

  it('blocks path traversal attempt in arguments', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-traversal-block',
      toolName: 'read_file',
      arguments: { filePath: '../../etc/shadow' },
      timestamp: new Date().toISOString(),
    };

    const response = await gateway.handleToolCall(request);
    expect(response.action).toBe('BLOCK');
    expect(response.error).toContain('SENSITIVE_PATH_ACCESS');

    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents({ tool: 'read_file' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('BLOCK');
  });

  it('allows safe tool call, forwards to upstream, redacts secrets, and logs SUCCESS', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-safe-allow',
      toolName: 'read_file',
      arguments: {
        filePath: 'safe_document.txt',
        apiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
      },
      timestamp: new Date().toISOString(),
    };

    const response = await gateway.handleToolCall(request);
    expect(response.action).toBe('ALLOW');
    expect(response.success).toBe(true);
    expect(response.content).toBeDefined();

    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents({ tool: 'read_file' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].executionStatus).toBe('SUCCESS');
    // Ensure arguments were redacted in audit storage
    expect(events[0].parameters?.apiKey).toBe('[REDACTED]');
  });

  it('suspends mutating tool calls requiring approval', async () => {
    const request: ToolCallRequest = {
      requestId: 'req-approval-test',
      toolName: 'write_file',
      arguments: { filePath: 'output.txt', content: 'new data' },
      timestamp: new Date().toISOString(),
    };

    const response = await gateway.handleToolCall(request);
    expect(response.action).toBe('REQUIRE_APPROVAL');
    expect(response.success).toBe(false);

    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents({ tool: 'write_file' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('REQUIRE_APPROVAL');
    expect(events[0].executionStatus).toBe('PENDING');
  });
});
