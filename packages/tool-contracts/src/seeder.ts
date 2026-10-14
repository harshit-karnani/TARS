import type { IContractRegistry, ToolContract } from './types.ts';
import { computeDefinitionHash } from './hasher.ts';

export const STANDARD_BASELINE_CONTRACTS: Array<Omit<ToolContract, 'createdAt' | 'updatedAt'>> = [
  {
    serverId: 'filesystem-server',
    toolName: 'read_file',
    description: 'Read contents of a file within the permitted workspace directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file to read' },
        encoding: { type: 'string', enum: ['utf8', 'ascii'] }
      },
      required: ['path'],
      additionalProperties: false
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'ACTIVE',
    notes: 'Approved standard file reading operation'
  },
  {
    serverId: 'filesystem-server',
    toolName: 'write_file',
    description: 'Write text contents to a file within the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Destination file path' },
        content: { type: 'string', description: 'Data to write' }
      },
      required: ['path', 'content'],
      additionalProperties: false
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'PENDING_REVIEW',
    notes: 'Modifications require operator sign-off'
  },
  {
    serverId: 'system-server',
    toolName: 'bash_exec',
    description: 'Execute arbitrary shell command on host system',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' }
      },
      required: ['command']
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'BLOCKED',
    notes: 'Arbitrary shell execution blocked by default gateway posture'
  },
  {
    serverId: 'http-server',
    toolName: 'fetch_url',
    description: 'Send HTTP GET request to external REST API',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Destination URL' },
        timeoutMs: { type: 'number' }
      },
      required: ['url'],
      additionalProperties: false
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'ACTIVE',
    notes: 'Standard external HTTP querying'
  },
  {
    serverId: 'database-server',
    toolName: 'sql_query',
    description: 'Execute read-only SQL query on application database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SELECT query' },
        maxRows: { type: 'number' }
      },
      required: ['query']
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'ACTIVE',
    notes: 'Read-only queries permitted'
  },
  {
    serverId: 'database-server',
    toolName: 'drop_database',
    description: 'Drop an entire SQL database and tables',
    inputSchema: {
      type: 'object',
      properties: {
        databaseName: { type: 'string' }
      },
      required: ['databaseName']
    },
    definitionHash: '',
    version: '1.0.0',
    status: 'BLOCKED',
    notes: 'Destructive DDL operations strictly prohibited'
  }
];

/**
 * Seeds an IContractRegistry instance with standard verified contracts.
 */
export async function seedStandardContracts(registry: IContractRegistry): Promise<ToolContract[]> {
  const registered: ToolContract[] = [];

  for (const contractDef of STANDARD_BASELINE_CONTRACTS) {
    const hash = computeDefinitionHash({
      serverId: contractDef.serverId,
      toolName: contractDef.toolName,
      description: contractDef.description,
      inputSchema: contractDef.inputSchema
    });

    const contract = await registry.registerContract({
      ...contractDef,
      definitionHash: hash
    });
    registered.push(contract);
  }

  return registered;
}
