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
});
