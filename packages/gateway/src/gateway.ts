import type {
  GatewayConfig,
  ToolCallRequest,
  PolicyDecision,
  AuditEvent,
} from '@tars/shared-types';
import { DEFAULT_GATEWAY_CONFIG, resolveGatewayConfig } from './config.js';
import { PolicyEngine } from './policy/policy-engine.js';
import { type IAuditStorage, InMemoryAuditStorage } from './storage/audit-storage.js';

export class TarsGateway {
  private config: GatewayConfig;
  private policyEngine: PolicyEngine;
  private auditStorage: IAuditStorage;
  private isRunning: boolean = false;

  constructor(
    config?: Partial<GatewayConfig>,
    policyEngine?: PolicyEngine,
    auditStorage?: IAuditStorage
  ) {
    this.config = resolveGatewayConfig(config);
    this.policyEngine = policyEngine ?? new PolicyEngine();
    this.auditStorage = auditStorage ?? new InMemoryAuditStorage();
  }

  public async initialize(): Promise<void> {
    await this.auditStorage.initialize();
    this.isRunning = true;
  }

  public getConfig(): GatewayConfig {
    return { ...this.config };
  }

  public getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  public getAuditStorage(): IAuditStorage {
    return this.auditStorage;
  }

  public getStatus(): { isRunning: boolean; config: GatewayConfig } {
    return {
      isRunning: this.isRunning,
      config: this.getConfig(),
    };
  }

  /**
   * Intercept and evaluate a tool call request deterministically.
   * Records the evaluation in the audit log.
   */
  public async interceptToolCall(request: ToolCallRequest): Promise<PolicyDecision> {
    const decision = this.policyEngine.evaluate(request);

    const event: AuditEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      serverId: request.serverId,
      tool: request.toolName,
      action: decision.action,
      reasonCode: decision.reasonCode,
      executionStatus: decision.action === 'BLOCK' ? 'BLOCKED' : 'PENDING',
      policyVersion: decision.policyVersion,
      contractVersion: decision.contractVersion,
      clientIdentity: request.clientIdentity,
      parameters: decision.sanitizedArguments,
      decisionEvidence: decision.evidence,
    };

    await this.auditStorage.recordEvent(event);
    return decision;
  }

  public async shutdown(): Promise<void> {
    await this.auditStorage.close();
    this.isRunning = false;
  }
}
