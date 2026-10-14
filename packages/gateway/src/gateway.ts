import type {
  GatewayConfig,
  ToolCallRequest,
  PolicyDecision,
  ToolCallResponse,
  AuditEvent,
} from '@tars/shared-types';
import { resolveGatewayConfig } from './config.js';
import { PolicyEngine } from './policy/policy-engine.js';
import { type IAuditStorage } from './storage/audit-storage.js';
import { SqliteAuditStorage } from './storage/sqlite-audit-storage.js';
import { McpForwarder, type IMcpForwarder } from './forwarding/mcp-forwarder.js';
import { EventBroadcaster } from './api/event-broadcaster.js';
import { GatewayApiServer } from './api/gateway-api-server.js';
import { ContractRegistryAdapter } from './adapters/contract-registry-adapter.js';
import { ReplayAdapter } from './adapters/replay-adapter.js';

export interface GatewayComponents {
  policyEngine?: PolicyEngine;
  auditStorage?: IAuditStorage;
  forwarder?: IMcpForwarder;
  broadcaster?: EventBroadcaster;
  contractRegistry?: ContractRegistryAdapter;
  replayAdapter?: ReplayAdapter;
  enableSimulationFallback?: boolean;
}

export class TarsGateway {
  private config: GatewayConfig;
  private policyEngine: PolicyEngine;
  private auditStorage: IAuditStorage;
  private forwarder: IMcpForwarder;
  private broadcaster: EventBroadcaster;
  private contractRegistry: ContractRegistryAdapter;
  private replayAdapter: ReplayAdapter;
  private apiServer: GatewayApiServer | null = null;
  private isRunning: boolean = false;

  constructor(
    config?: Partial<GatewayConfig>,
    components: GatewayComponents = {}
  ) {
    this.config = resolveGatewayConfig(config);
    this.policyEngine = components.policyEngine ?? new PolicyEngine();
    this.auditStorage =
      components.auditStorage ??
      new SqliteAuditStorage(this.config.dbPath || ':memory:');
    this.forwarder =
      components.forwarder ??
      new McpForwarder(this.config, {
        enableSimulationFallback: components.enableSimulationFallback ?? false,
      });
    this.broadcaster = components.broadcaster ?? new EventBroadcaster();
    this.contractRegistry = components.contractRegistry ?? new ContractRegistryAdapter();
    this.replayAdapter = components.replayAdapter ?? new ReplayAdapter();
  }

  public async initialize(startApiServer: boolean = false): Promise<void> {
    await this.auditStorage.initialize();

    // Sync active contracts into policy engine for schema and bounds validation
    const registeredContracts = await this.contractRegistry.listContracts();
    for (const contract of registeredContracts) {
      this.policyEngine.registerContract(contract);
    }

    if ('initialize' in this.forwarder && typeof (this.forwarder as any).initialize === 'function') {
      await (this.forwarder as any).initialize();
    }

    this.isRunning = true;

    if (startApiServer) {
      this.apiServer = new GatewayApiServer(
        this,
        this.broadcaster,
        this.config.port,
        this.config.host,
        this.contractRegistry,
        this.replayAdapter
      );
      await this.apiServer.start();
    }
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

  public getBroadcaster(): EventBroadcaster {
    return this.broadcaster;
  }

  public getContractRegistry(): ContractRegistryAdapter {
    return this.contractRegistry;
  }

  public getReplayAdapter(): ReplayAdapter {
    return this.replayAdapter;
  }

  public getApiServer(): GatewayApiServer | null {
    return this.apiServer;
  }

  public getStatus(): { isRunning: boolean; config: GatewayConfig; apiServerRunning: boolean } {
    return {
      isRunning: this.isRunning,
      config: this.getConfig(),
      apiServerRunning: this.apiServer !== null,
    };
  }

  /**
   * Backward-compatible helper method evaluating requests and creating an audit record.
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
    this.broadcaster.broadcast(event);
    return decision;
  }

  /**
   * Complete runtime execution path:
   * MCP client -> TARS gateway -> policy engine -> upstream MCP server -> response guard -> client
   *
   * 1. Evaluates deterministic security policy & parameter bounds.
   * 2. If BLOCK: returns error response immediately, records BLOCKED in SQLite, does not forward to upstream.
   * 3. If REQUIRE_APPROVAL: suspends execution, records PENDING in SQLite, returns approval challenge.
   * 4. If ALLOW: sanitizes arguments, forwards to upstream MCP server, redacts secrets from response, records SUCCESS/ERROR in SQLite.
   */
  public async handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const startTime = performance.now();
    const decision = this.policyEngine.evaluate(request);

    // 1. Policy BLOCK — Upstream execution prevented
    if (decision.action === 'BLOCK') {
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const event: AuditEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        serverId: request.serverId,
        tool: request.toolName,
        action: 'BLOCK',
        reasonCode: decision.reasonCode,
        executionStatus: 'BLOCKED',
        policyVersion: decision.policyVersion,
        contractVersion: decision.contractVersion,
        clientIdentity: request.clientIdentity,
        parameters: decision.sanitizedArguments,
        decisionEvidence: decision.evidence,
        latencyMs,
        errorMessage: `Blocked by policy: ${decision.reasonCode}`,
      };

      await this.auditStorage.recordEvent(event);
      this.broadcaster.broadcast(event);

      return {
        requestId: request.requestId,
        action: 'BLOCK',
        success: false,
        error: `Tool execution blocked by TARS security policy (${decision.reasonCode})`,
        latencyMs,
      };
    }

    // 2. Policy REQUIRE_APPROVAL — Non-executing until approval is implemented
    if (decision.action === 'REQUIRE_APPROVAL') {
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const event: AuditEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        serverId: request.serverId,
        tool: request.toolName,
        action: 'REQUIRE_APPROVAL',
        reasonCode: decision.reasonCode,
        executionStatus: 'PENDING',
        policyVersion: decision.policyVersion,
        contractVersion: decision.contractVersion,
        clientIdentity: request.clientIdentity,
        parameters: decision.sanitizedArguments,
        decisionEvidence: decision.evidence,
        latencyMs,
      };

      await this.auditStorage.recordEvent(event);
      this.broadcaster.broadcast(event);

      return {
        requestId: request.requestId,
        action: 'REQUIRE_APPROVAL',
        success: false,
        error: 'Execution suspended: Approval required by security policy',
        latencyMs,
      };
    }

    // 3. Policy ALLOW — Forward to upstream MCP server & Response Guard
    const forwardedRequest: ToolCallRequest = {
      ...request,
      arguments: decision.sanitizedArguments || request.arguments,
    };

    const response = await this.forwarder.forwardToolCall(forwardedRequest);
    const totalLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    const event: AuditEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      serverId: request.serverId,
      tool: request.toolName,
      action: 'ALLOW',
      reasonCode: decision.reasonCode,
      executionStatus: response.success ? 'SUCCESS' : 'ERROR',
      policyVersion: decision.policyVersion,
      contractVersion: decision.contractVersion,
      clientIdentity: request.clientIdentity,
      parameters: decision.sanitizedArguments,
      redacted: response.redacted,
      latencyMs: totalLatencyMs,
      decisionEvidence: decision.evidence,
      errorMessage: response.error,
    };

    await this.auditStorage.recordEvent(event);
    this.broadcaster.broadcast(event);

    return {
      ...response,
      latencyMs: totalLatencyMs,
    };
  }

  public async shutdown(): Promise<void> {
    if (this.apiServer) {
      await this.apiServer.stop();
      this.apiServer = null;
    }
    this.broadcaster.close();
    await this.forwarder.close();
    await this.auditStorage.close();
    this.isRunning = false;
  }
}
