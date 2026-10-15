import * as http from 'node:http';
import type {
  ApiResponse,
  PaginatedResponse,
  AuditEvent,
  SecurityPolicy,
  ToolCallRequest,
  ToolContract,
  ContractDriftResult,
  ReplayRunSummary,
  PendingApproval,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
} from '@tars/shared-types';
import type { TarsGateway } from '../gateway.js';
import type { EventBroadcaster } from './event-broadcaster.js';
import { ContractRegistryAdapter } from '../adapters/contract-registry-adapter.js';
import { ReplayAdapter } from '../adapters/replay-adapter.js';

export class GatewayApiServer {
  private gateway: TarsGateway;
  private broadcaster: EventBroadcaster;
  private contractRegistry: ContractRegistryAdapter;
  private replayAdapter: ReplayAdapter;
  private server: http.Server | null = null;
  private port: number;
  private host: string;

  constructor(
    gateway: TarsGateway,
    broadcaster: EventBroadcaster,
    port: number = 8443,
    host: string = '127.0.0.1',
    contractRegistry?: ContractRegistryAdapter,
    replayAdapter?: ReplayAdapter
  ) {
    this.gateway = gateway;
    this.broadcaster = broadcaster;
    this.port = port;
    this.host = host;
    this.contractRegistry = contractRegistry || new ContractRegistryAdapter();
    this.replayAdapter = replayAdapter || new ReplayAdapter();
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof (this.server as any).closeAllConnections === 'function') {
          (this.server as any).closeAllConnections();
        }
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getContractRegistry(): ContractRegistryAdapter {
    return this.contractRegistry;
  }

  public getReplayAdapter(): ReplayAdapter {
    return this.replayAdapter;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Enable CORS for dashboard development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const hostHeader = req.headers.host || `127.0.0.1:${this.port}`;
    const parsedUrl = new URL(req.url ?? '/', `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. SSE Live Events Stream: GET /api/events/stream
      if (pathname === '/api/events/stream' && req.method === 'GET') {
        this.broadcaster.registerClient(res);
        return;
      }

      // 2. Health check: GET /api/health
      if (pathname === '/api/health' && req.method === 'GET') {
        this.sendJson(res, 200, {
          success: true,
          data: {
            status: 'HEALTHY',
            version: '1.0.0',
            gateway: this.gateway.getStatus(),
            activeSseClients: this.broadcaster.getConnectedCount(),
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 3. Paginated Audit Events: GET /api/events
      if (pathname === '/api/events' && req.method === 'GET') {
        const searchParams = parsedUrl.searchParams;
        const limitParam = searchParams.get('limit');
        const offsetParam = searchParams.get('offset');
        const toolParam = searchParams.get('tool');
        const actionParam = searchParams.get('action');
        const executionStatusParam = searchParams.get('executionStatus');

        const limit = limitParam ? Math.max(1, Math.min(500, parseInt(limitParam, 10))) : 50;
        const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;
        const tool = toolParam || undefined;
        const action = actionParam ? (actionParam as AuditEvent['action']) : undefined;
        const executionStatus = executionStatusParam ? (executionStatusParam as AuditEvent['executionStatus']) : undefined;

        const filter = { limit, offset, tool, action, executionStatus };
        const events = await this.gateway.getAuditStorage().queryEvents(filter);

        let total = events.length;
        const storage = this.gateway.getAuditStorage() as { countEvents?: (f: unknown) => Promise<number> };
        if (typeof storage.countEvents === 'function') {
          total = await storage.countEvents(filter);
        }

        const paginated: PaginatedResponse<AuditEvent> = {
          items: events,
          total,
          limit,
          offset,
          hasMore: offset + events.length < total,
        };

        this.sendJson(res, 200, {
          success: true,
          data: paginated,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 4. Contract Drift Check: GET /api/contracts/:serverId/:toolName/drift
      const driftMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/([^/]+)\/drift$/);
      if (driftMatch && req.method === 'GET') {
        const serverId = decodeURIComponent(driftMatch[1]);
        const toolName = decodeURIComponent(driftMatch[2]);

        const contract = await this.contractRegistry.getContract(serverId, toolName);
        if (!contract) {
          this.sendJson(res, 404, {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Contract for tool '${toolName}' on server '${serverId}' not found in registry`,
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const driftResult = await this.contractRegistry.checkDrift(serverId, toolName, {
          description: contract.description,
          inputSchema: contract.inputSchema,
        });

        this.sendJson<ContractDriftResult>(res, 200, {
          success: true,
          data: driftResult,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 5. Active Contracts: GET /api/contracts
      if (pathname === '/api/contracts' && req.method === 'GET') {
        const contracts = await this.contractRegistry.listContracts();
        this.sendJson<ToolContract[]>(res, 200, {
          success: true,
          data: contracts,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 6. Security Replay Runs: GET /api/replay/runs, POST /api/replay/run
      if (pathname === '/api/replay/runs' && req.method === 'GET') {
        const runs = await this.replayAdapter.getReplayRuns();
        this.sendJson<ReplayRunSummary[]>(res, 200, {
          success: true,
          data: runs,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (pathname === '/api/replay/run' && req.method === 'POST') {
        const runSummary = await this.replayAdapter.runSuite(this.gateway.getPolicyEngine());
        this.sendJson<ReplayRunSummary>(res, 200, {
          success: true,
          data: runSummary,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 7. Security Policy: GET /api/policy, POST /api/policy
      if (pathname === '/api/policy') {
        if (req.method === 'GET') {
          this.sendJson<SecurityPolicy>(res, 200, {
            success: true,
            data: this.gateway.getPolicyEngine().getPolicy(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (req.method === 'POST') {
          const body = await this.readJsonBody<SecurityPolicy>(req);
          if (body && body.id && body.version && Array.isArray(body.rules)) {
            this.gateway.getPolicyEngine().setPolicy(body);
            this.sendJson<SecurityPolicy>(res, 200, {
              success: true,
              data: body,
              timestamp: new Date().toISOString(),
            });
            return;
          }
          this.sendJson(res, 400, {
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Invalid SecurityPolicy structure provided' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // 8. Pending Approvals: GET /api/approvals/pending
      if (pathname === '/api/approvals/pending' && req.method === 'GET') {
        const pending = this.gateway.listPendingApprovals();
        this.sendJson<PendingApproval[]>(res, 200, {
          success: true,
          data: pending,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 9. Process Approval Decision: POST /api/approvals/decision
      if (pathname === '/api/approvals/decision' && req.method === 'POST') {
        // Enforce authorization: Check Authorization header
        const authHeader = req.headers.authorization;
        const expectedToken = process.env.APPROVAL_TOKEN || 'tars-admin-token';
        
        let isAuthorized = false;
        if (authHeader) {
          const parts = authHeader.split(' ');
          if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) {
            if (parts[1] === expectedToken) {
              isAuthorized = true;
            }
          }
        }

        if (!isAuthorized) {
          this.sendJson(res, 401, {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required to approve or reject security sensitive operations.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const body = await this.readJsonBody<ApprovalDecisionRequest>(req);
        if (!body || !body.requestId || !body.decision || (body.decision !== 'APPROVE' && body.decision !== 'REJECT')) {
          this.sendJson(res, 400, {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'Valid requestId and decision (APPROVE | REJECT) are required.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        try {
          const result = await this.gateway.resolveApproval(
            body.requestId,
            body.decision,
            body.approver || 'dashboard-admin',
            body.reason
          );

          this.sendJson<ApprovalDecisionResult>(res, 200, {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          });
          return;
        } catch (resolveErr: any) {
          const code = resolveErr.code || 'APPROVAL_ERROR';
          let statusCode = 400;
          if (code === 'DUPLICATE_APPROVAL') {
            statusCode = 409;
          } else if (code === 'APPROVAL_EXPIRED') {
            statusCode = 410;
          } else if (code === 'APPROVAL_NOT_FOUND') {
            statusCode = 404;
          }
          this.sendJson(res, statusCode, {
            success: false,
            error: {
              code,
              message: resolveErr.message || 'Error processing approval decision',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // 10. Intercept Tool Call (Direct API execution / Replay endpoint): POST /api/intercept
      if (pathname === '/api/intercept' && req.method === 'POST') {
        const body = await this.readJsonBody<ToolCallRequest & { tool?: string; parameters?: Record<string, unknown> }>(req);
        const toolName = body?.toolName || body?.tool;
        if (!body || !toolName) {
          this.sendJson(res, 400, {
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Field toolName is required' },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const rawArgs =
          body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments) && Object.keys(body.arguments).length > 0
            ? body.arguments
            : body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
            ? body.parameters
            : body.arguments || body.parameters || {};

        const request: ToolCallRequest = {
          requestId: body.requestId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          toolName,
          serverId: body.serverId,
          arguments: rawArgs,
          parameters: rawArgs,
          clientIdentity: body.clientIdentity,
          timestamp: body.timestamp || new Date().toISOString(),
        };

        const result = await this.gateway.handleToolCall(request);
        this.sendJson(res, 200, {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 404 Route Not Found
      this.sendJson(res, 404, {
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${pathname} not found` },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendJson(res, 500, {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private sendJson<T>(res: http.ServerResponse, statusCode: number, data: ApiResponse<T>): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(JSON.stringify(data));
  }

  private async readJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }
}
