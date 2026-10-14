import { describe, it, expect } from 'vitest';
import { McpForwarder } from '../src/forwarding/mcp-forwarder.js';
import { TarsGateway } from '../src/gateway.js';
import { resolveGatewayConfig } from '../src/config.js';
import type { ToolCallRequest } from '@tars/shared-types';

describe('McpForwarder Upstream Tool Error Handling & Audit Integration', () => {
  const baseConfig = resolveGatewayConfig({
    port: 0,
    dbPath: ':memory:',
    enableRedaction: true,
  });

  it('a successful MCP result returns success: true', async () => {
    const mockClient = {
      callTool: async () => ({
        content: [{ type: 'text', text: 'File contents safely read' }],
        isError: false,
      }),
      close: async () => {},
    };

    const forwarder = new McpForwarder(baseConfig, { client: mockClient });
    await forwarder.initialize();

    const request: ToolCallRequest = {
      requestId: 'req-success-1',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const response = await forwarder.forwardToolCall(request);
    expect(response.action).toBe('ALLOW');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
    expect(response.content).toEqual({
      content: [{ type: 'text', text: 'File contents safely read' }],
      isError: false,
    });
  });

  it('an MCP result with isError: true returns success: false', async () => {
    const mockClient = {
      callTool: async () => ({
        content: [{ type: 'text', text: 'ENOENT: no such file or directory, open safe.txt' }],
        isError: true,
      }),
      close: async () => {},
    };

    const forwarder = new McpForwarder(baseConfig, { client: mockClient });
    await forwarder.initialize();

    const request: ToolCallRequest = {
      requestId: 'req-error-1',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const response = await forwarder.forwardToolCall(request);
    expect(response.action).toBe('ALLOW'); // Policy allowed it
    expect(response.success).toBe(false);  // Upstream tool failed
    expect(response.error).toContain('ENOENT: no such file or directory');
    expect(response.content).toEqual({
      content: [{ type: 'text', text: 'ENOENT: no such file or directory, open safe.txt' }],
      isError: true,
    });
  });

  it('an upstream exception returns success: false', async () => {
    const mockClient = {
      callTool: async () => {
        throw new Error('Connection to upstream stdio server terminated unexpectedly');
      },
      close: async () => {},
    };

    const forwarder = new McpForwarder(baseConfig, { client: mockClient });
    await forwarder.initialize();

    const request: ToolCallRequest = {
      requestId: 'req-exc-1',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const response = await forwarder.forwardToolCall(request);
    expect(response.action).toBe('ALLOW'); // Policy allowed it
    expect(response.success).toBe(false);  // Execution crashed
    expect(response.error).toContain('Connection to upstream stdio server terminated unexpectedly');
  });

  it('response redaction applies to MCP error content without leaking secrets in error message', async () => {
    const mockClient = {
      callTool: async () => ({
        content: [{ type: 'text', text: 'Failed authorization with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890' }],
        isError: true,
      }),
      close: async () => {},
    };

    const forwarder = new McpForwarder(baseConfig, { client: mockClient });
    await forwarder.initialize();

    const request: ToolCallRequest = {
      requestId: 'req-redact-err-1',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const response = await forwarder.forwardToolCall(request);
    expect(response.action).toBe('ALLOW');
    expect(response.success).toBe(false);
    expect(response.redacted).toBe(true);
    expect(response.error).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(response.error).toContain('[REDACTED_ANTHROPIC_API_KEY]');
  });

  it('the audit event for an MCP tool-level error is not recorded as SUCCESS', async () => {
    const mockClient = {
      callTool: async () => ({
        content: [{ type: 'text', text: 'EACCES: permission denied, open /restricted/data.json' }],
        isError: true,
      }),
      close: async () => {},
    };

    const forwarder = new McpForwarder(baseConfig, { client: mockClient });

    const gateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-audit-err-check',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe_notes.txt' },
      timestamp: new Date().toISOString(),
    };

    const response = await gateway.handleToolCall(request);
    expect(response.action).toBe('ALLOW');
    expect(response.success).toBe(false);
    expect(response.error).toContain('permission denied');

    // Audit verification
    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents({ requestId: 'req-audit-err-check' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('ALLOW'); // Policy allowed it
    expect(events[0].executionStatus).not.toBe('SUCCESS'); // Specifically NOT SUCCESS
    expect(events[0].executionStatus).toBe('ERROR');
    expect(events[0].errorMessage).toContain('permission denied');

    await gateway.shutdown();
  });
});
