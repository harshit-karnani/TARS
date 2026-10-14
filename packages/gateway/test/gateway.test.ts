import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TarsGateway } from '../src/gateway.js';
import type { ToolCallRequest } from '@tars/shared-types';

describe('TarsGateway Core & Security Suite', () => {
  let gateway: TarsGateway;

  beforeEach(async () => {
    gateway = new TarsGateway(
      {
        port: 0, // ephemeral port for testing
        dbPath: ':memory:',
      },
      {
        enableSimulationFallback: true,
      }
    );
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
      arguments: { path: '../../etc/shadow' },
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
        path: 'safe_document.txt',
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

  it('normal gateway startup starts with empty audit events and empty replay runs', async () => {
    const storage = gateway.getAuditStorage();
    const events = await storage.queryEvents();
    expect(events.length).toBe(0);

    const replayRuns = await gateway.getReplayAdapter().getReplayRuns();
    expect(replayRuns.length).toBe(0);
  });

  it('blocked tool calls and approval-required calls never invoke upstream forwarder', async () => {
    let forwarderCalled = 0;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled++;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const isolatedGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: mockForwarder }
    );
    await isolatedGateway.initialize(false);

    // 1. Blocked call
    await isolatedGateway.handleToolCall({
      requestId: 'req-block-test',
      toolName: 'execute_system_command',
      arguments: { command: 'rm -rf /' },
      timestamp: new Date().toISOString(),
    });
    expect(forwarderCalled).toBe(0);

    // 2. Approval-required call
    await isolatedGateway.handleToolCall({
      requestId: 'req-approval-test',
      toolName: 'write_file',
      arguments: { filePath: 'foo.txt', content: 'bar' },
      timestamp: new Date().toISOString(),
    });
    expect(forwarderCalled).toBe(0);

    await isolatedGateway.shutdown();
  });

  it('replay suite throws if PolicyEngine is missing and cannot fabricate passing results', async () => {
    const adapter = gateway.getReplayAdapter();
    await expect(adapter.runSuite(undefined)).rejects.toThrow(/PolicyEngine dependency is required/);
  });

  it('production gateway with unconfigured upstream stdio transport returns honest unconfigured state', async () => {
    const unconfiguredGateway = new TarsGateway({
      port: 0,
      dbPath: ':memory:',
      upstreamTransport: 'stdio', // no UPSTREAM_COMMAND set
    });
    await unconfiguredGateway.initialize(false);

    const res = await unconfiguredGateway.handleToolCall({
      requestId: 'req-unconfigured',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    });

    expect(res.action).toBe('ALLOW'); // Policy allowed it
    expect(res.success).toBe(false); // Execution did not succeed
    expect(res.error).toContain('No upstream MCP server configured');
    expect((res.content as any)?.status).toBe('UNCONFIGURED_UPSTREAM');

    await unconfiguredGateway.shutdown();
  });

  it('accepts read_file request with path argument via contract validation and forwards to configured forwarder', async () => {
    let capturedForwardRequest: ToolCallRequest | null = null;
    const mockForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        capturedForwardRequest = req;
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: true,
          content: { text: 'mock file content' },
          latencyMs: 2,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: mockForwarder }
    );
    await testGateway.initialize(false);

    // 1. Valid request with 'path' is accepted by contract validation and reaches forwarder
    const validRequest: ToolCallRequest = {
      requestId: 'req-contract-path-valid',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'docs/architecture.md' },
      timestamp: new Date().toISOString(),
    };

    const validResponse = await testGateway.handleToolCall(validRequest);
    expect(validResponse.action).toBe('ALLOW');
    expect(validResponse.success).toBe(true);
    expect(capturedForwardRequest).not.toBeNull();
    expect(capturedForwardRequest?.arguments?.path).toBe('docs/architecture.md');

    // Verify audit event recorded with SUCCESS
    const storage = testGateway.getAuditStorage();
    const allowedEvents = await storage.queryEvents({ requestId: 'req-contract-path-valid' });
    expect(allowedEvents.length).toBe(1);
    expect(allowedEvents[0].action).toBe('ALLOW');
    expect(allowedEvents[0].executionStatus).toBe('SUCCESS');
    expect(allowedEvents[0].parameters?.path).toBe('docs/architecture.md');

    // 2. Request with legacy 'filePath' (missing required 'path') is blocked by contract schema validation
    capturedForwardRequest = null;
    const invalidRequest: ToolCallRequest = {
      requestId: 'req-contract-legacy-invalid',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'docs/architecture.md' },
      timestamp: new Date().toISOString(),
    };

    const invalidResponse = await testGateway.handleToolCall(invalidRequest);
    expect(invalidResponse.action).toBe('BLOCK');
    expect(invalidResponse.success).toBe(false);
    expect(invalidResponse.error).toContain('SCHEMA_MISMATCH');
    expect(capturedForwardRequest).toBeNull();

    await testGateway.shutdown();
  });

  it('records execution failure as ERROR instead of SUCCESS when upstream returns MCP tool error', async () => {
    const errorForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: false,
          error: 'Upstream tool execution error: File not found',
          content: {
            content: [{ type: 'text', text: 'File not found' }],
            isError: true,
          },
          latencyMs: 3,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: errorForwarder }
    );
    await testGateway.initialize(false);

    const res = await testGateway.handleToolCall({
      requestId: 'req-mcp-err-audit',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'nonexistent.txt' },
      timestamp: new Date().toISOString(),
    });

    expect(res.action).toBe('ALLOW'); // Policy allowed it
    expect(res.success).toBe(false);  // Execution failed
    expect(res.error).toContain('File not found');

    const storage = testGateway.getAuditStorage();
    const events = await storage.queryEvents({ requestId: 'req-mcp-err-audit' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].executionStatus).not.toBe('SUCCESS');
    expect(events[0].executionStatus).toBe('ERROR');
    expect(events[0].errorMessage).toContain('File not found');

    await testGateway.shutdown();
  });
});
