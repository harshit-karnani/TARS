import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolCallRequest, ToolCallResponse, GatewayConfig } from '@tars/shared-types';
import { redactPayload } from '../security/redactor.js';

export interface IMcpForwarder {
  forwardToolCall(request: ToolCallRequest): Promise<ToolCallResponse>;
  close(): Promise<void>;
}

export interface McpForwarderOptions {
  timeoutMs?: number;
}

/**
 * McpForwarder manages the runtime communication with upstream MCP servers.
 * Supports:
 * 1. Stdio transport to upstream processes using the official MCP SDK Client.
 * 2. Response Guard: Inspects upstream responses for secrets/tokens and applies redaction.
 * 3. Timeout and error isolation: Prevents upstream crashes from bringing down the gateway.
 * 4. Simulated Upstream fallback: Clearly labeled per Rule 6 for standalone/offline demos.
 */
export class McpForwarder implements IMcpForwarder {
  private config: GatewayConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private timeoutMs: number;

  constructor(config: GatewayConfig, options: McpForwarderOptions = {}) {
    this.config = config;
    this.timeoutMs = options.timeoutMs ?? 10000; // 10 second default timeout
  }

  public async initialize(): Promise<void> {
    if (this.config.upstreamTransport === 'stdio' && this.config.upstreamCommand) {
      try {
        this.transport = new StdioClientTransport({
          command: this.config.upstreamCommand,
          args: this.config.upstreamArgs || [],
        });

        this.client = new Client(
          {
            name: 'tars-security-gateway',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await this.client.connect(this.transport);
      } catch (err) {
        console.warn(`[TARS Gateway] Notice: Upstream MCP stdio process failed to start (${err}). Falling back to simulated handler.`);
        this.client = null;
        this.transport = null;
      }
    }
  }

  public async forwardToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const startTime = performance.now();

    try {
      let rawResult: unknown;

      if (this.client) {
        // Real forwarding via official MCP SDK Client with timeout
        rawResult = await this.executeWithTimeout(
          this.client.callTool({
            name: request.toolName,
            arguments: request.arguments,
          }),
          this.timeoutMs
        );
      } else {
        // Built-in simulated upstream MCP execution (clearly labeled per Rule 6)
        rawResult = await this.executeWithTimeout(
          this.executeSimulatedUpstream(request),
          this.timeoutMs
        );
      }

      // Response Guard: Inspect upstream response for secrets and redact
      let wasRedacted = false;
      let sanitizedContent = rawResult;

      if (this.config.enableRedaction && rawResult !== undefined) {
        const redaction = redactPayload(rawResult);
        sanitizedContent = redaction.sanitized;
        wasRedacted = redaction.wasRedacted;
      }

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      return {
        requestId: request.requestId,
        action: 'ALLOW',
        success: true,
        content: sanitizedContent,
        latencyMs,
        redacted: wasRedacted,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const errorMsg = err instanceof Error ? err.message : String(err);

      return {
        requestId: request.requestId,
        action: 'ALLOW', // The policy allowed it, but execution failed at the upstream layer
        success: false,
        error: `Upstream tool execution error: ${errorMsg}`,
        latencyMs,
      };
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore cleanup errors
      }
      this.client = null;
      this.transport = null;
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Upstream request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Clearly-labeled built-in simulated upstream handler for testing and standalone demos (Rule 6).
   */
  private async executeSimulatedUpstream(request: ToolCallRequest): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 20));

    switch (request.toolName) {
      case 'read_file': {
        const filePath = String(request.arguments.filePath || request.arguments.path || 'sample.txt');
        return {
          _source: '[SIMULATED_UPSTREAM_MCP_EXECUTION]',
          filePath,
          content: `Contents of safe file: ${filePath}. (Simulated safe read output from upstream MCP server)`,
          sizeBytes: 1024,
        };
      }

      case 'query_database': {
        return {
          _source: '[SIMULATED_UPSTREAM_MCP_EXECUTION]',
          rows: [
            { id: 1, name: 'Alice', role: 'admin' },
            { id: 2, name: 'Bob', role: 'user' },
          ],
          rowCount: 2,
        };
      }

      case 'write_file': {
        return {
          _source: '[SIMULATED_UPSTREAM_MCP_EXECUTION]',
          status: 'file_written',
          bytesWritten: 128,
        };
      }

      default:
        return {
          _source: '[SIMULATED_UPSTREAM_MCP_EXECUTION]',
          status: 'success',
          executedTool: request.toolName,
          echoArguments: request.arguments,
        };
    }
  }
}
