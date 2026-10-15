import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TarsGateway } from '../src/gateway.js';
import { McpGatewayServer } from '../src/forwarding/mcp-gateway-server.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolCallRequest } from '@tars/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const safeDataPath = path.resolve(__dirname, '../../../mcp-test-data/safe.txt');
const safeTestDataContent = fs.readFileSync(safeDataPath, 'utf-8');

const SYNTHETIC_SECRETS = [
  'FAKE_TARS_KEY_123456789',
  'AKIAFAKE123456789012',
  'FAKE_SECRET_NOT_VALID_123456789',
  'FAKE_DB_PASSWORD_ONLY_FOR_TESTING',
  'ghp_FAKE_TOKEN_NOT_VALID_123456789',
];

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

  it('sanitizes mcp-test-data/safe.txt response content and records redacted: true without leaking credentials in audit events', async () => {
    const safeForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: true,
          content: {
            content: [{ type: 'text', text: safeTestDataContent }],
          },
          latencyMs: 5,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: safeForwarder }
    );
    await testGateway.initialize(false);

    const response = await testGateway.handleToolCall({
      requestId: 'req-safe-data-redaction',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'mcp-test-data/safe.txt' },
      timestamp: new Date().toISOString(),
    });

    expect(response.action).toBe('ALLOW');
    expect(response.success).toBe(true);
    expect(response.redacted).toBe(true);

    const contentStr = JSON.stringify(response.content);

    // Verify none of the synthetic secrets appear in the response content
    for (const secret of SYNTHETIC_SECRETS) {
      expect(contentStr).not.toContain(secret);
    }

    // Verify redactions took place
    expect(contentStr).toContain('API_KEY=[REDACTED_API_KEY]');
    expect(contentStr).toContain('AWS_ACCESS_KEY_ID=[REDACTED_AWS_ACCESS_KEY]');
    expect(contentStr).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_SECRET_ACCESS_KEY]');
    expect(contentStr).toContain('DATABASE_PASSWORD=[REDACTED_DATABASE_PASSWORD]');
    expect(contentStr).toContain('GITHUB_TOKEN=[REDACTED_GITHUB_TOKEN]');

    // Verify non-sensitive safe text was preserved
    expect(contentStr).toContain('TARS SECURITY TEST DATA');
    expect(contentStr).toContain('Project: TARS');
    expect(contentStr).toContain('Environment: Local development');
    expect(contentStr).toContain('Demo User');
    expect(contentStr).toContain('demo.user@example.com');
    expect(contentStr).toContain('0000000000');
    expect(contentStr).toContain('TEST-0000-1234');
    expect(contentStr).toContain('Safe read: reading this file should be allowed');
    expect(contentStr).toContain('END OF TEST DATA');

    // Verify audit event records redaction without storing unredacted secrets
    const storage = testGateway.getAuditStorage();
    const events = await storage.queryEvents({ requestId: 'req-safe-data-redaction' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].executionStatus).toBe('SUCCESS');
    expect(events[0].redacted).toBe(true);

    const auditStr = JSON.stringify(events[0]);
    for (const secret of SYNTHETIC_SECRETS) {
      expect(auditStr).not.toContain(secret);
    }

    await testGateway.shutdown();
  });

  it('client-facing Hermes path via McpGatewayServer completely sanitizes safe.txt without leaking credentials', async () => {
    const rawForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: true,
          content: {
            content: [{ type: 'text', text: safeTestDataContent }],
          },
          latencyMs: 4,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: rawForwarder }
    );
    await testGateway.initialize(false);

    const mcpServer = new McpGatewayServer(testGateway);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.getServer().connect(serverTransport);

    const mcpClient = new Client(
      { name: 'hermes-test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await mcpClient.connect(clientTransport);

    const clientResult = await mcpClient.callTool({
      name: 'read_file',
      arguments: { path: 'mcp-test-data/safe.txt' },
    });

    const clientOutputStr = JSON.stringify(clientResult);

    // Assert that NO credential values ever reach the Hermes MCP client
    for (const secret of SYNTHETIC_SECRETS) {
      expect(clientOutputStr).not.toContain(secret);
    }

    // Assert that credentials were properly masked
    expect(clientOutputStr).toContain('API_KEY=[REDACTED_API_KEY]');
    expect(clientOutputStr).toContain('AWS_ACCESS_KEY_ID=[REDACTED_AWS_ACCESS_KEY]');
    expect(clientOutputStr).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_SECRET_ACCESS_KEY]');
    expect(clientOutputStr).toContain('DATABASE_PASSWORD=[REDACTED_DATABASE_PASSWORD]');
    expect(clientOutputStr).toContain('GITHUB_TOKEN=[REDACTED_GITHUB_TOKEN]');

    // Assert that safe public info is preserved
    expect(clientOutputStr).toContain('TARS SECURITY TEST DATA');
    expect(clientOutputStr).toContain('Project: TARS');
    expect(clientOutputStr).toContain('demo.user@example.com');
    expect(clientOutputStr).toContain('END OF TEST DATA');

    await mcpClient.close();
    await mcpServer.close();
    await testGateway.shutdown();
  });

  it('sanitizes upstream error messages containing credentials before returning to client and storing in audit events', async () => {
    const errorWithSecretsForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: false,
          error: 'Connection failed with DATABASE_PASSWORD=raw_secret_pass_123 and API_KEY=raw_api_key_456',
          content: { isError: true },
          latencyMs: 2,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: errorWithSecretsForwarder }
    );
    await testGateway.initialize(false);

    const res = await testGateway.handleToolCall({
      requestId: 'req-secret-in-error',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'db_config.txt' },
      timestamp: new Date().toISOString(),
    });

    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(false);
    expect(res.redacted).toBe(true);
    expect(res.error).not.toContain('raw_secret_pass_123');
    expect(res.error).not.toContain('raw_api_key_456');
    expect(res.error).toContain('DATABASE_PASSWORD=[REDACTED_DATABASE_PASSWORD]');
    expect(res.error).toContain('API_KEY=[REDACTED_API_KEY]');

    const storage = testGateway.getAuditStorage();
    const events = await storage.queryEvents({ requestId: 'req-secret-in-error' });
    expect(events.length).toBe(1);
    expect(events[0].errorMessage).not.toContain('raw_secret_pass_123');
    expect(events[0].errorMessage).not.toContain('raw_api_key_456');
    expect(events[0].errorMessage).toContain('DATABASE_PASSWORD=[REDACTED_DATABASE_PASSWORD]');
    expect(events[0].errorMessage).toContain('API_KEY=[REDACTED_API_KEY]');

    await testGateway.shutdown();
  });

  it('sanitizes nested structured response payloads with sensitive keys and assignments', async () => {
    const structuredForwarder = {
      forwardToolCall: async (req: ToolCallRequest) => {
        return {
          requestId: req.requestId,
          action: 'ALLOW' as const,
          success: true,
          content: {
            database_password: 'super_secret_pwd_999',
            serviceConfig: {
              aws_secret_access_key: 'top_secret_aws_key_000',
              status: 'operational',
              items: ['AWS_ACCESS_KEY_ID=AKIA1234567890123456', 'safe-entry-77'],
            },
            publicMessage: 'System check completed successfully',
          },
          latencyMs: 3,
        };
      },
      close: async () => {},
    };

    const testGateway = new TarsGateway(
      { port: 0, dbPath: ':memory:' },
      { forwarder: structuredForwarder }
    );
    await testGateway.initialize(false);

    const res = await testGateway.handleToolCall({
      requestId: 'req-nested-struct',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'config.json' },
      timestamp: new Date().toISOString(),
    });

    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);
    expect(res.redacted).toBe(true);

    const content = res.content as any;
    expect(content.database_password).toBe('[REDACTED]');
    expect(content.serviceConfig.aws_secret_access_key).toBe('[REDACTED]');
    expect(content.serviceConfig.status).toBe('operational');
    expect(content.serviceConfig.items[0]).toBe('AWS_ACCESS_KEY_ID=[REDACTED_AWS_ACCESS_KEY]');
    expect(content.serviceConfig.items[1]).toBe('safe-entry-77');
    expect(content.publicMessage).toBe('System check completed successfully');

    await testGateway.shutdown();
  });
});
