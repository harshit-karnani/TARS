import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/policy/policy-engine.js';
import type { ToolCallRequest, ToolContract } from '@tars/shared-types';

describe('Phase 2 — Deterministic Policy Engine', () => {
  it('blocks payload exceeding configured maximum size (PAYLOAD_TOO_LARGE)', () => {
    const engine = new PolicyEngine(undefined, {
      maxPayloadSizeBytes: 100, // tiny limit for test
    });

    const request: ToolCallRequest = {
      requestId: 'req-large-payload',
      toolName: 'read_file',
      arguments: { data: 'a'.repeat(200) },
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('PAYLOAD_TOO_LARGE');
    expect(decision.evidence.matchedRuleId).toBe('builtin-payload-size-guard');
  });

  it('blocks unauthorized clients when client allowlist is enforced (UNAUTHORIZED_CLIENT)', () => {
    const engine = new PolicyEngine(undefined, {
      authorizedClients: ['trusted-client-app', 'audited-agent'],
    });

    const request: ToolCallRequest = {
      requestId: 'req-unauthorized-client',
      toolName: 'read_file',
      arguments: { path: 'test.txt' },
      clientIdentity: 'malicious-script-1',
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('UNAUTHORIZED_CLIENT');
  });

  it('validates schema mismatches against registered contract (SCHEMA_MISMATCH)', () => {
    const engine = new PolicyEngine();
    const contract: ToolContract = {
      serverId: 'srv-1',
      toolName: 'calculate_tax',
      description: 'Calculates tax amount',
      inputSchema: {
        type: 'object',
        properties: {
          income: { type: 'number' },
          state: { type: 'string' },
        },
        required: ['income', 'state'],
      },
      definitionHash: 'hash-calc-1',
      version: '1.0.0',
      status: 'ACTIVE',
    };
    engine.registerContract(contract);

    // Missing required field 'state' and wrong type for 'income'
    const request: ToolCallRequest = {
      requestId: 'req-schema-fail',
      toolName: 'calculate_tax',
      arguments: { income: 'not-a-number' },
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('SCHEMA_MISMATCH');
    expect(decision.evidence.notes).toContain('income');
  });

  it('enforces parameter bounds checks (PARAMETER_OUT_OF_BOUNDS)', () => {
    const engine = new PolicyEngine();
    const contract: ToolContract = {
      serverId: 'srv-1',
      toolName: 'set_threshold',
      description: 'Sets threshold percentage',
      inputSchema: {
        type: 'object',
        properties: {
          percent: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['percent'],
      },
      definitionHash: 'hash-thresh-1',
      version: '1.0.0',
      status: 'ACTIVE',
    };
    engine.registerContract(contract);

    const request: ToolCallRequest = {
      requestId: 'req-bounds-fail',
      toolName: 'set_threshold',
      arguments: { percent: 150 }, // exceeds maximum 100
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('PARAMETER_OUT_OF_BOUNDS');
  });

  it('blocks unknown tools when allowUnknownTools is disabled (UNKNOWN_TOOL)', () => {
    const engine = new PolicyEngine(undefined, {
      allowUnknownTools: false,
    });

    const request: ToolCallRequest = {
      requestId: 'req-unknown-tool',
      toolName: 'completely_unregistered_tool_xyz',
      arguments: {},
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('BLOCK');
    expect(decision.reasonCode).toBe('UNKNOWN_TOOL');
  });

  it('never treats REQUIRE_APPROVAL as ALLOW and includes decision evidence', () => {
    const engine = new PolicyEngine();
    const request: ToolCallRequest = {
      requestId: 'req-approval-check',
      toolName: 'write_file',
      arguments: { filePath: 'data.txt', content: 'new content' },
      timestamp: new Date().toISOString(),
    };

    const decision = engine.evaluate(request);
    expect(decision.action).toBe('REQUIRE_APPROVAL');
    expect(decision.action).not.toBe('ALLOW');
    expect(decision.evidence.matchedRuleId).toBe('rule-require-approval-for-mutations');
    expect(decision.evidence.evaluatedChecks).toContain('path_traversal_check');
  });

  it('deterministically blocks reads of sensitive.txt while allowing safe.txt', () => {
    const engine = new PolicyEngine();

    // Reading sensitive.txt must be blocked
    const sensitiveReq: ToolCallRequest = {
      requestId: 'req-read-sensitive',
      toolName: 'read_file',
      arguments: { path: 'sensitive.txt' },
      timestamp: new Date().toISOString(),
    };
    const sensitiveDecision = engine.evaluate(sensitiveReq);
    expect(sensitiveDecision.action).toBe('BLOCK');
    expect(sensitiveDecision.reasonCode).toBe('SENSITIVE_PATH_ACCESS');

    // Reading safe.txt must be allowed
    const safeReq: ToolCallRequest = {
      requestId: 'req-read-safe',
      toolName: 'read_file',
      arguments: { path: 'safe.txt' },
      timestamp: new Date().toISOString(),
    };
    const safeDecision = engine.evaluate(safeReq);
    expect(safeDecision.action).toBe('ALLOW');
    expect(safeDecision.reasonCode).toBe('POLICY_ALLOW');
  });

  it('ensures shell execution remains blocked', () => {
    const engine = new PolicyEngine();
    const shellReq: ToolCallRequest = {
      requestId: 'req-exec-block',
      toolName: 'execute_system_command',
      arguments: { command: 'whoami' },
      timestamp: new Date().toISOString(),
    };
    const decision = engine.evaluate(shellReq);
    expect(decision.action).toBe('BLOCK');
  });

  it('ensures writes and deletes require approval', () => {
    const engine = new PolicyEngine();

    const writeReq: ToolCallRequest = {
      requestId: 'req-write-approval',
      toolName: 'write_file',
      arguments: { path: 'report.txt', content: 'draft' },
      timestamp: new Date().toISOString(),
    };
    expect(engine.evaluate(writeReq).action).toBe('REQUIRE_APPROVAL');

    const deleteReq: ToolCallRequest = {
      requestId: 'req-delete-approval',
      toolName: 'delete_file',
      arguments: { path: 'old.txt' },
      timestamp: new Date().toISOString(),
    };
    expect(engine.evaluate(deleteReq).action).toBe('REQUIRE_APPROVAL');
  });
});

