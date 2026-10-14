import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { TarsGateway } from '../gateway.js';
import type { ToolCallRequest } from '@tars/shared-types';

export class McpGatewayServer {
  private server: Server;
  private gateway: TarsGateway;
  private transport: StdioServerTransport | null = null;

  constructor(gateway: TarsGateway) {
    this.gateway = gateway;
    this.server = new Server(
      {
        name: 'tars-mcp-gateway',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerHandlers();
  }

  public async startStdio(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  public async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    await this.server.close();
  }

  public getServer(): Server {
    return this.server;
  }

  private registerHandlers(): void {
    // 1. Advertised Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const defaultTools: Tool[] = [
        {
          name: 'read_file',
          description: 'Reads safe file contents within allowed directory',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to file to read' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'query_database',
          description: 'Executes a read-only database query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'SQL query string' },
            },
            required: ['query'],
          },
        },
        {
          name: 'write_file',
          description: 'Writes content to file (Requires human approval)',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['filePath', 'content'],
          },
        },
        {
          name: 'execute_system_command',
          description: 'Executes system shell command (Blocked by policy)',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string' },
            },
            required: ['command'],
          },
        },
      ];

      return { tools: defaultTools };
    });

    // 2. Intercept Tool Call Handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolArguments = (request.params.arguments as Record<string, unknown>) || {};
      const requestId = `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const gatewayRequest: ToolCallRequest = {
        requestId,
        toolName,
        arguments: toolArguments,
        clientIdentity: 'mcp-client-stdio',
        timestamp: new Date().toISOString(),
      };

      // Runtime path: MCP client -> TARS gateway -> policy engine -> upstream server -> response guard -> client
      const result = await this.gateway.handleToolCall(gatewayRequest);

      // BLOCK: Denied before upstream execution
      if (result.action === 'BLOCK') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `[TARS SECURITY BLOCK] Tool '${toolName}' execution was denied: ${result.error}`,
            },
          ],
        };
      }

      // REQUIRE_APPROVAL: Non-executing until approval is implemented
      if (result.action === 'REQUIRE_APPROVAL') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `[TARS APPROVAL REQUIRED] Tool '${toolName}' is suspended pending human approval. RequestId: ${requestId}`,
            },
          ],
        };
      }

      // ALLOW: Successfully executed by upstream with response guard redactions
      if (!result.success) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `[TARS UPSTREAM ERROR] Tool '${toolName}' failed during upstream execution: ${result.error}`,
            },
          ],
        };
      }

      const textOutput =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content, null, 2);

      return {
        content: [
          {
            type: 'text',
            text: textOutput,
          },
        ],
      };
    });
  }
}
