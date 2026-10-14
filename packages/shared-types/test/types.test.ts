import { describe, it, expect } from 'vitest';
import {
  SECURITY_ACTIONS,
  isSecurityAction,
  CONTRACT_STATUSES,
  isContractStatus,
  AUDIT_EXECUTION_STATUSES,
  SSE_EVENTS_STREAM_PATH,
  type SecurityAction,
  type ToolContract,
  type AuditEvent,
  type ReplayResult,
  type ContractDriftResult,
  type PaginatedResponse,
  type IContractRegistry,
} from '../src/index.js';

describe('Shared Types - Contract & Security Invariants', () => {
  it('validates SecurityAction values and type guard', () => {
    expect(SECURITY_ACTIONS).toEqual(['ALLOW', 'BLOCK', 'REQUIRE_APPROVAL']);
    expect(isSecurityAction('ALLOW')).toBe(true);
    expect(isSecurityAction('BLOCK')).toBe(true);
    expect(isSecurityAction('REQUIRE_APPROVAL')).toBe(true);
    expect(isSecurityAction('UNKNOWN')).toBe(false);
    expect(isSecurityAction(123)).toBe(false);
    expect(isSecurityAction(null)).toBe(false);
  });

  it('validates ContractStatus values and type guard', () => {
    expect(CONTRACT_STATUSES).toEqual([
      'ACTIVE',
      'DRIFTED',
      'DEPRECATED',
      'BLOCKED',
      'PENDING_REVIEW',
    ]);
    expect(isContractStatus('ACTIVE')).toBe(true);
    expect(isContractStatus('DRIFTED')).toBe(true);
    expect(isContractStatus('INVALID')).toBe(false);
  });

  it('validates AuditExecutionStatus constant list', () => {
    expect(AUDIT_EXECUTION_STATUSES).toContain('PENDING');
    expect(AUDIT_EXECUTION_STATUSES).toContain('EXECUTING');
    expect(AUDIT_EXECUTION_STATUSES).toContain('SUCCESS');
    expect(AUDIT_EXECUTION_STATUSES).toContain('ERROR');
    expect(AUDIT_EXECUTION_STATUSES).toContain('BLOCKED');
  });

  it('allows constructing valid ToolContract object with required fields', () => {
    const contract: ToolContract = {
      serverId: 'sqlite-fs-server',
      toolName: 'read_secure_file',
      description: 'Safely reads contents of a file within allowed root directory',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
        },
        required: ['filePath'],
      },
      definitionHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      version: '1.0.0',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(contract.serverId).toBe('sqlite-fs-server');
    expect(contract.toolName).toBe('read_secure_file');
    expect(contract.status).toBe('ACTIVE');
    expect(contract.definitionHash).toHaveLength(64);
  });

  it('allows constructing valid AuditEvent object', () => {
    const event: AuditEvent = {
      id: 'evt-001',
      requestId: 'req-001',
      timestamp: '2026-10-14T11:00:00.000Z',
      serverId: 'sqlite-fs-server',
      tool: 'read_secure_file',
      action: 'ALLOW',
      reasonCode: 'POLICY_ALLOW',
      executionStatus: 'SUCCESS',
      policyVersion: 'v1.0.0',
      contractVersion: '1.0.0',
      clientIdentity: 'agent-cli-1',
      parameters: { filePath: '/allowed/data.txt' },
      redacted: false,
      latencyMs: 12,
      decisionEvidence: {
        matchedRuleId: 'rule-allow-read',
        evaluatedChecks: ['schema_validation', 'path_whitelist'],
      },
    };

    expect(event.action).toBe('ALLOW');
    expect(event.executionStatus).toBe('SUCCESS');
    expect(event.policyVersion).toBe('v1.0.0');
    expect(event.contractVersion).toBe('1.0.0');
  });

  it('allows constructing valid ReplayResult object', () => {
    const result: ReplayResult = {
      runId: 'run-alpha',
      caseId: 'attack-path-traversal-01',
      expectedAction: 'BLOCK',
      actualAction: 'BLOCK',
      passed: true,
      latencyMs: 3.5,
      policyVersion: 'v1.0.0',
      timestamp: '2026-10-14T11:00:00.000Z',
      reasonCode: 'SENSITIVE_PATH_ACCESS',
    };

    expect(result.passed).toBe(true);
    expect(result.expectedAction).toBe(result.actualAction);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('allows constructing valid ContractDriftResult with SchemaDifference', () => {
    const driftResult: ContractDriftResult = {
      serverId: 'sqlite-fs-server',
      toolName: 'read_secure_file',
      contractVersion: '1.0.0',
      hasDrift: true,
      expectedHash: 'hash-expected-1234',
      actualHash: 'hash-actual-5678',
      detectedAt: '2026-10-14T11:50:00.000Z',
      schemaDifferences: [
        {
          path: 'properties.secretKey',
          changeType: 'ADDED',
          description: 'Unexpected new property found in advertised schema',
        },
      ],
    };

    expect(driftResult.hasDrift).toBe(true);
    expect(driftResult.schemaDifferences?.[0].changeType).toBe('ADDED');
  });

  it('validates PaginatedResponse and SSE route constant', () => {
    const response: PaginatedResponse<string> = {
      items: ['item1', 'item2'],
      total: 2,
      limit: 10,
      offset: 0,
      hasMore: false,
    };

    expect(response.items.length).toBe(2);
    expect(SSE_EVENTS_STREAM_PATH).toBe('/api/events/stream');
  });

  it('validates IContractRegistry interface can be cleanly implemented', async () => {
    class MockRegistry implements IContractRegistry {
      async getContract() {
        return null;
      }
      async listContracts() {
        return [];
      }
      async registerContract(contract: any) {
        return { ...contract, createdAt: '', updatedAt: '' };
      }
      async updateContractStatus(serverId: string, toolName: string, status: any) {
        return {} as any;
      }
      async checkDrift(serverId: string, toolName: string) {
        return {
          serverId,
          toolName,
          contractVersion: '1.0.0',
          hasDrift: false,
          expectedHash: 'abc',
          actualHash: 'abc',
          detectedAt: new Date().toISOString(),
        };
      }
      computeDefinitionHash() {
        return 'mock-hash';
      }
    }

    const registry = new MockRegistry();
    const drift = await registry.checkDrift('srv', 'tool');
    expect(drift.hasDrift).toBe(false);
    expect(registry.computeDefinitionHash({ toolName: 't', inputSchema: {} })).toBe('mock-hash');
  });
});
