import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolCallRequest, ToolCallResponse, GatewayConfig } from '@tars/shared-types';
import { redactPayload } from '../security/redactor.js';
import { inspectContentForInjection } from '../security/injection-detector.js';

export interface IMcpForwarder {
  forwardToolCall(request: ToolCallRequest): Promise<ToolCallResponse>;
  close(): Promise<void>;
}

export interface McpForwarderOptions {
  timeoutMs?: number;
  enableSimulationFallback?: boolean;
  client?: Client | { callTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<unknown>; close?: () => Promise<void> };
}

/**
 * McpForwarder manages the runtime communication with upstream MCP servers.
 * Supports:
 * 1. Stdio transport to upstream processes using the official MCP SDK Client.
 * 2. Response Guard: Inspects upstream responses for secrets/tokens and applies redaction.
 * 3. Timeout and error isolation: Prevents upstream crashes from bringing down the gateway.
 * 4. Explicit Unconfigured State: Honestly reports when no upstream server is configured.
 */
export class McpForwarder implements IMcpForwarder {
  private config: GatewayConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private timeoutMs: number;
  private enableSimulationFallback: boolean;

  constructor(config: GatewayConfig, options: McpForwarderOptions = {}) {
    this.config = config;
    this.timeoutMs = options.timeoutMs ?? 10000; // 10 second default timeout
    this.enableSimulationFallback = options.enableSimulationFallback ?? false;
    if (options.client) {
      this.client = options.client as unknown as Client;
    }
  }

  public async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

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
      } else if (this.enableSimulationFallback) {
        // Explicitly isolated simulated upstream handler for testing
        rawResult = await this.executeWithTimeout(
          this.executeSimulatedUpstream(request),
          this.timeoutMs
        );
      } else {
        // Production unconfigured state: Explicitly report that no external upstream MCP server is configured
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        return {
          requestId: request.requestId,
          action: 'ALLOW',
          success: false,
          error: 'No upstream MCP server configured (UPSTREAM_COMMAND is not set). External tool execution unavailable.',
          content: {
            status: 'UNCONFIGURED_UPSTREAM',
            message: 'TARS policy engine evaluated and allowed this request, but no upstream MCP server process is connected to execute external operations.',
            toolName: request.toolName,
          },
          latencyMs,
          redacted: false,
        };
      }

      // Response Guard: Inspect upstream response for secrets and redact
      let wasRedacted = false;
      let sanitizedContent = rawResult;

      if (this.config.enableRedaction && rawResult !== undefined) {
        const redaction = redactPayload(rawResult);
        sanitizedContent = redaction.sanitized;
        wasRedacted = redaction.wasRedacted;
      }

      // Content Guard: Inspect retrieved content for prompt injection attacks
      let stringifiedContent = '';
      if (typeof sanitizedContent === 'string') {
        stringifiedContent = sanitizedContent;
      } else if (typeof sanitizedContent === 'object' && sanitizedContent !== null) {
        const obj = sanitizedContent as Record<string, unknown>;
        if (typeof obj.content === 'string') {
          stringifiedContent = obj.content;
        } else if (Array.isArray(obj.content)) {
          stringifiedContent = obj.content
            .map((c) => (typeof c === 'string' ? c : typeof c === 'object' && c && 'text' in c ? String((c as any).text) : ''))
            .join('\n');
        } else {
          stringifiedContent = JSON.stringify(sanitizedContent);
        }
      }

      const contentInspection = inspectContentForInjection(stringifiedContent);

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      // 1. Detect official MCP SDK tool result's isError === true field
      const isMcpToolError =
        typeof sanitizedContent === 'object' &&
        sanitizedContent !== null &&
        (sanitizedContent as { isError?: unknown }).isError === true;

      if (isMcpToolError) {
        const extractedMsg = this.extractErrorMessage(sanitizedContent);
        return {
          requestId: request.requestId,
          action: 'ALLOW',
          success: false,
          error: `Upstream tool execution error: ${extractedMsg}`,
          content: sanitizedContent,
          latencyMs,
          redacted: wasRedacted,
        };
      }

      // If retrieved content contains high-confidence malicious instructions, deterministically BLOCK
      if (contentInspection.action === 'BLOCK') {
        return {
          requestId: request.requestId,
          action: 'BLOCK',
          success: false,
          error: contentInspection.reason,
          content: {
            status: 'CONTENT_BLOCKED',
            reason: contentInspection.reason,
            confidence: contentInspection.confidence,
            patterns: contentInspection.matchedPatterns,
          },
          latencyMs,
          redacted: wasRedacted,
        };
      }

      // If ambiguous, return warning annotation alongside content and flag for review
      if (contentInspection.action === 'FLAG_FOR_REVIEW') {
        let contentWithWarning = sanitizedContent;
        if (typeof sanitizedContent === 'object' && sanitizedContent !== null && !Array.isArray(sanitizedContent)) {
          contentWithWarning = {
            ...(sanitizedContent as Record<string, unknown>),
            _securityReview: {
              flagged: true,
              confidence: contentInspection.confidence,
              reason: contentInspection.reason,
              matchedPatterns: contentInspection.matchedPatterns,
            },
          };
        }

        return {
          requestId: request.requestId,
          action: 'ALLOW',
          success: true,
          content: contentWithWarning,
          latencyMs,
          redacted: wasRedacted,
        };
      }

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

  /**
   * Extracts a human-readable error description from an MCP tool error result.
   */
  private extractErrorMessage(result: unknown): string {
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.content)) {
        const textParts: string[] = [];
        for (const item of obj.content) {
          if (typeof item === 'string' && item.trim().length > 0) {
            textParts.push(item.trim());
          } else if (
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { text?: unknown }).text === 'string'
          ) {
            const text = (item as { text: string }).text.trim();
            if (text.length > 0) {
              textParts.push(text);
            }
          }
        }
        if (textParts.length > 0) {
          return textParts.join('; ');
        }
      }

      if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
        return obj.message.trim();
      }

      if (typeof obj.error === 'string' && obj.error.trim().length > 0) {
        return obj.error.trim();
      }
    }

    return 'Tool reported execution error (isError: true)';
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
        // If file exists on disk (e.g. mcp-test-data/safe.txt), read actual content so content inspection & redaction runs on real fixtures
        let fileContent = `Contents of safe file: ${filePath}. (Simulated safe read output from upstream MCP server)`;
        let sizeBytes = 1024;
        try {
          const candidates = [
            filePath,
            path.resolve(process.cwd(), filePath),
            path.resolve(process.cwd(), '..', '..', filePath),
            path.resolve(process.cwd(), '..', filePath),
          ];
          for (const cand of candidates) {
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
              fileContent = fs.readFileSync(cand, 'utf8');
              sizeBytes = Buffer.byteLength(fileContent, 'utf8');
              break;
            }
          }
        } catch {
          // Fallback to default simulated content
        }
        return {
          _source: '[SIMULATED_UPSTREAM_MCP_EXECUTION]',
          filePath,
          content: fileContent,
          sizeBytes,
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
