import { describe, it, expect } from 'vitest';
import { TarsGateway } from '../src/gateway.js';
import { MlShadowClient } from '../src/ml/ml-shadow-client.js';
import {
  extractMlFeatures,
  inferToolCategory,
  isMutationTool,
  isSuspiciousCommand,
} from '../src/ml/feature-extractor.js';
import type { ToolCallRequest, ToolContract } from '@tars/shared-types';

describe('ML-Based Adaptive Risk Scoring in Shadow Mode', () => {
  it('1. A normal read request produces a LOW-risk shadow prediction when the service is available', async () => {
    let capturedBody: any = null;
    const mockFetch: typeof fetch = async (url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          risk: 'LOW',
          confidence: 0.85,
          class_probabilities: { LOW: 0.85, MEDIUM: 0.1, HIGH: 0.05 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const mlClient = new MlShadowClient({
      endpoint: 'http://127.0.0.1:8000',
      fetchFn: mockFetch,
    });

    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        mlShadowClient: mlClient,
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-norm-read',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe_document.txt' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);

    // Verify ML prediction in audit event
    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-norm-read' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].decisionEvidence?.mlShadow).toBeDefined();
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('LOW');
    expect(events[0].decisionEvidence?.mlShadow?.confidence).toBe(0.85);
    expect(events[0].decisionEvidence?.mlShadow?.mode).toBe('shadow');
    expect(events[0].decisionEvidence?.mlShadow?.success).toBe(true);

    expect(capturedBody.tool_name).toBe('read_file');
    expect(capturedBody.tool_category).toBe('filesystem');
    expect(capturedBody.is_mutation).toBe(0);

    await gateway.shutdown();
  });

  it('2. A mutation request produces a shadow prediction without changing the deterministic action', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'MEDIUM',
          confidence: 0.82,
          class_probabilities: { LOW: 0.1, MEDIUM: 0.82, HIGH: 0.08 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-mutation-test',
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'output.txt', content: 'hello' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    // Deterministic action MUST remain REQUIRE_APPROVAL
    expect(res.action).toBe('REQUIRE_APPROVAL');
    expect(res.success).toBe(false);
    expect(forwarderCalled).toBe(false);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-mutation-test' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('REQUIRE_APPROVAL');
    expect(events[0].executionStatus).toBe('PENDING');
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('MEDIUM');
    expect(events[0].decisionEvidence?.mlShadow?.mode).toBe('shadow');

    await gateway.shutdown();
  });

  it('3. A dangerous system-command request remains blocked by deterministic policy regardless of the ML output', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'HIGH',
          confidence: 0.95,
          class_probabilities: { LOW: 0.01, MEDIUM: 0.04, HIGH: 0.95 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-danger-block',
      toolName: 'execute_system_command',
      arguments: { command: 'rm -rf /' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    expect(res.action).toBe('BLOCK');
    expect(res.success).toBe(false);
    expect(forwarderCalled).toBe(false);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-danger-block' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('BLOCK');
    expect(events[0].executionStatus).toBe('BLOCKED');
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('HIGH');

    await gateway.shutdown();
  });

  it('4. An ML HIGH prediction cannot turn an ALLOW decision into an automatic BLOCK', async () => {
    // Model erroneously or conservatively returns HIGH for a safe read
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'HIGH',
          confidence: 0.99,
          class_probabilities: { LOW: 0.01, MEDIUM: 0.0, HIGH: 0.99 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-safe-read-high-ml',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe_document.txt' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    // MUST remain ALLOW! Deterministic policy is authoritative.
    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);
    expect(forwarderCalled).toBe(true);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-safe-read-high-ml' });
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('HIGH');

    await gateway.shutdown();
  });

  it('5. An ML LOW prediction cannot turn a BLOCK decision into ALLOW', async () => {
    // Model erroneously returns LOW for a dangerous shell command
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'LOW',
          confidence: 0.99,
          class_probabilities: { LOW: 0.99, MEDIUM: 0.01, HIGH: 0.0 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-danger-low-ml',
      toolName: 'execute_system_command',
      arguments: { command: 'cat /etc/passwd' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    // MUST remain BLOCK! ML never overrides deterministic security rules.
    expect(res.action).toBe('BLOCK');
    expect(res.success).toBe(false);
    expect(forwarderCalled).toBe(false);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-danger-low-ml' });
    expect(events[0].action).toBe('BLOCK');
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('LOW');

    await gateway.shutdown();
  });

  it('6. An unavailable ML service does not crash TARS or disable deterministic enforcement', async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8000');
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        mlShadowClient: mlClient,
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-service-down',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-service-down' });
    expect(events[0].action).toBe('ALLOW');
    expect(events[0].decisionEvidence?.mlShadow?.success).toBe(false);
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('UNKNOWN');
    expect(events[0].decisionEvidence?.mlShadow?.error).toContain('ECONNREFUSED');

    await gateway.shutdown();
  });

  it('7. A timeout does not prevent policy enforcement', async () => {
    const mockFetch: typeof fetch = async (_url, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const mlClient = new MlShadowClient({
      fetchFn: mockFetch,
      timeoutMs: 30, // very short timeout
    });

    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        mlShadowClient: mlClient,
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-timeout-test',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const start = performance.now();
    const res = await gateway.handleToolCall(request);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500); // completed swiftly without hanging
    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-timeout-test' });
    expect(events[0].decisionEvidence?.mlShadow?.success).toBe(false);
    expect(events[0].decisionEvidence?.mlShadow?.error).toContain('timed out');

    await gateway.shutdown();
  });

  it('8. A malformed ML response is handled safely', async () => {
    const mockFetch: typeof fetch = async () => {
      // Returns 200 but completely invalid JSON payload
      return new Response(JSON.stringify({ unexpectedKey: 12345 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        mlShadowClient: mlClient,
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-malformed-test',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    expect(res.action).toBe('ALLOW');
    expect(res.success).toBe(true);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-malformed-test' });
    expect(events[0].decisionEvidence?.mlShadow?.success).toBe(false);
    expect(events[0].decisionEvidence?.mlShadow?.error).toContain('Malformed response');

    await gateway.shutdown();
  });

  it('9. Raw tool arguments and secrets are not sent to the scoring service', async () => {
    let capturedBodyString = '';
    const mockFetch: typeof fetch = async (_url, init) => {
      capturedBodyString = init?.body as string;
      return new Response(
        JSON.stringify({
          risk: 'LOW',
          confidence: 0.9,
          class_probabilities: { LOW: 0.9, MEDIUM: 0.08, HIGH: 0.02 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        mlShadowClient: mlClient,
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(false);

    const sensitiveApiKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    const confidentialFilePath = 'customer_pii_confidential_records.csv';
    const request: ToolCallRequest = {
      requestId: 'req-leak-test',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: {
        path: confidentialFilePath,
        apiKey: sensitiveApiKey,
        raw_token: 'secret-token-abcdef',
      },
      timestamp: new Date().toISOString(),
    };

    await gateway.handleToolCall(request);

    // Verify raw file path, keys, and tokens were NEVER transmitted in payload to ML service
    expect(capturedBodyString).not.toContain(confidentialFilePath);
    expect(capturedBodyString).not.toContain(sensitiveApiKey);
    expect(capturedBodyString).not.toContain('secret-token-abcdef');
    expect(capturedBodyString).not.toContain('apiKey');
    expect(capturedBodyString).not.toContain('raw_token');

    // Verify only the 10 strictly-typed numerical & categorical features exist
    const parsed = JSON.parse(capturedBodyString);
    const allowedKeys = [
      'tool_name',
      'tool_category',
      'is_mutation',
      'schema_valid',
      'path_traversal',
      'prompt_injection',
      'suspicious_command',
      'unknown_tool',
      'contract_drift',
      'payload_size',
    ];
    expect(Object.keys(parsed).sort()).toEqual(allowedKeys.sort());

    await gateway.shutdown();
  });

  it('10. Feature extractor correctly maps all 10 features', () => {
    const sampleContract: ToolContract = {
      serverId: 'system-fs-server',
      toolName: 'read_file',
      description: 'Reads safe file contents within sandbox',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      definitionHash: 'hash123',
      version: '1.0.0',
      status: 'ACTIVE',
    };

    const req: ToolCallRequest = {
      requestId: 'req-feat-test',
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };

    const features = extractMlFeatures(req, { matchedContract: sampleContract });
    expect(features.tool_name).toBe('read_file');
    expect(features.tool_category).toBe('filesystem');
    expect(features.is_mutation).toBe(0);
    expect(features.schema_valid).toBe(1);
    expect(features.path_traversal).toBe(0);
    expect(features.prompt_injection).toBe(0);
    expect(features.suspicious_command).toBe(0);
    expect(features.unknown_tool).toBe(0);
    expect(features.contract_drift).toBe(0);
    expect(features.payload_size).toBeGreaterThan(0);

    // Category inference tests
    expect(inferToolCategory('read_file')).toBe('filesystem');
    expect(inferToolCategory('execute_system_command')).toBe('system');
    expect(inferToolCategory('query_database')).toBe('database');
    expect(inferToolCategory('search_index')).toBe('search');
    expect(inferToolCategory('get_weather')).toBe('api');
    expect(inferToolCategory('send_email')).toBe('communication');

    // Mutation tests
    expect(isMutationTool('read_file')).toBe(0);
    expect(isMutationTool('write_file')).toBe(1);
    expect(isMutationTool('delete_file')).toBe(1);

    // Command test
    expect(isSuspiciousCommand('execute_system_command')).toBe(1);
    expect(isSuspiciousCommand('read_file')).toBe(0);
  });

  it('11. An ML LOW prediction cannot override BLOCK for protected sensitive files (sensitive.txt)', async () => {
    // Model erroneously returns LOW risk with 99% confidence for sensitive.txt
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'LOW',
          confidence: 0.99,
          class_probabilities: { LOW: 0.99, MEDIUM: 0.01, HIGH: 0.0 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-sensitive-low-ml',
      toolName: 'read_file',
      arguments: { path: 'sensitive.txt' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    // MUST be BLOCK! Deterministic security policy is authoritative and cannot be overridden by ML
    expect(res.action).toBe('BLOCK');
    expect(res.success).toBe(false);
    expect(forwarderCalled).toBe(false);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-sensitive-low-ml' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('BLOCK');
    expect(events[0].executionStatus).toBe('BLOCKED');
    expect(events[0].reasonCode).toBe('SENSITIVE_PATH_ACCESS');
    // Confirm ML shadow prediction is recorded as advisory evidence only
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('LOW');

    await gateway.shutdown();
  });

  it('12. An ML LOW prediction cannot override REQUIRE_APPROVAL for mutations', async () => {
    // Model erroneously returns LOW risk for file write
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          risk: 'LOW',
          confidence: 0.95,
          class_probabilities: { LOW: 0.95, MEDIUM: 0.03, HIGH: 0.02 },
          mode: 'shadow',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    let forwarderCalled = false;
    const mockForwarder = {
      forwardToolCall: async () => {
        forwarderCalled = true;
        return { requestId: 'test', action: 'ALLOW' as const, success: true, latencyMs: 1 };
      },
      close: async () => {},
    };

    const mlClient = new MlShadowClient({ fetchFn: mockFetch });
    const gateway = new TarsGateway(
      {
        port: 0,
        dbPath: ':memory:',
        enableMlShadowScoring: true,
      },
      {
        forwarder: mockForwarder,
        mlShadowClient: mlClient,
      }
    );
    await gateway.initialize(false);

    const request: ToolCallRequest = {
      requestId: 'req-mutation-low-ml',
      toolName: 'write_file',
      arguments: { filePath: 'critical_config.json', content: 'hacked' },
      timestamp: new Date().toISOString(),
    };

    const res = await gateway.handleToolCall(request);
    // MUST remain REQUIRE_APPROVAL! ML cannot turn mutation into automatic ALLOW
    expect(res.action).toBe('REQUIRE_APPROVAL');
    expect(res.success).toBe(false);
    expect(forwarderCalled).toBe(false);

    const events = await gateway.getAuditStorage().queryEvents({ requestId: 'req-mutation-low-ml' });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('REQUIRE_APPROVAL');
    expect(events[0].executionStatus).toBe('PENDING');
    expect(events[0].decisionEvidence?.mlShadow?.predictedRisk).toBe('LOW');

    await gateway.shutdown();
  });
});

