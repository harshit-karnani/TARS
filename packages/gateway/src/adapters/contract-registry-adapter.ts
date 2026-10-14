import type {
  ToolContract,
  ContractQueryFilter,
  ContractDriftResult,
  IContractRegistry,
  ToolDefinition,
  ToolDefinitionCandidate,
} from '@tars/shared-types';
import * as crypto from 'node:crypto';

/**
 * ContractRegistryAdapter provides contract storage, hash calculation,
 * and drift detection for the Gateway and API endpoints.
 *
 * Designed to conform to Person 2's IContractRegistry interface, allowing
 * seamless swapping when Person 2 connects their firewall module.
 */
export class ContractRegistryAdapter implements IContractRegistry {
  private contracts: Map<string, ToolContract> = new Map();

  constructor() {
    this.seedDefaultContracts();
  }

  public async getContract(serverId: string, toolName: string): Promise<ToolContract | null> {
    const key = `${serverId}:${toolName}`;
    return this.contracts.get(key) || this.contracts.get(toolName) || null;
  }

  public async listContracts(filter?: ContractQueryFilter): Promise<ToolContract[]> {
    let result = Array.from(this.contracts.values());

    if (filter?.serverId) {
      result = result.filter((c) => c.serverId === filter.serverId);
    }
    if (filter?.status) {
      result = result.filter((c) => c.status === filter.status);
    }

    return result;
  }

  public async registerContract(contract: Omit<ToolContract, 'createdAt' | 'updatedAt'>): Promise<ToolContract> {
    const now = new Date().toISOString();
    const fullContract: ToolContract = {
      ...contract,
      createdAt: now,
      updatedAt: now,
    };

    const key = `${fullContract.serverId}:${fullContract.toolName}`;
    this.contracts.set(key, fullContract);
    return fullContract;
  }

  public async updateContractStatus(serverId: string, toolName: string, status: ToolContract['status']): Promise<ToolContract> {
    const key = `${serverId}:${toolName}`;
    const contract = this.contracts.get(key);
    if (!contract) {
      throw new Error(`Contract for tool '${toolName}' on server '${serverId}' not found`);
    }

    contract.status = status;
    contract.updatedAt = new Date().toISOString();
    this.contracts.set(key, contract);
    return contract;
  }

  public async checkDrift(
    serverId: string,
    toolName: string,
    advertisedDefinition: ToolDefinition | { description?: string; inputSchema: Record<string, unknown> }
  ): Promise<ContractDriftResult> {
    const contract = await this.getContract(serverId, toolName);
    const now = new Date().toISOString();

    if (!contract) {
      const computedHash = this.computeDefinitionHash({
        serverId,
        toolName,
        description: advertisedDefinition.description,
        inputSchema: advertisedDefinition.inputSchema,
      });

      return {
        serverId,
        toolName,
        contractVersion: 'unregistered',
        hasDrift: true,
        expectedHash: 'none',
        actualHash: computedHash,
        detectedAt: now,
        schemaDifferences: [
          {
            path: 'root',
            changeType: 'ADDED',
            description: `Tool '${toolName}' is not registered in contract registry`,
          },
        ],
      };
    }

    const actualHash = this.computeDefinitionHash({
      serverId,
      toolName,
      description: advertisedDefinition.description,
      inputSchema: advertisedDefinition.inputSchema,
    });

    const hasDrift = actualHash !== contract.definitionHash;

    const schemaDifferences: ContractDriftResult['schemaDifferences'] = [];
    if (hasDrift) {
      schemaDifferences.push({
        path: 'inputSchema',
        changeType: 'MODIFIED',
        expected: contract.definitionHash,
        actual: actualHash,
        description: `Advertised schema hash (${actualHash}) differs from registered contract hash (${contract.definitionHash})`,
      });
    }

    return {
      serverId,
      toolName,
      contractVersion: contract.version,
      hasDrift,
      expectedHash: contract.definitionHash,
      actualHash,
      detectedAt: now,
      schemaDifferences: schemaDifferences.length > 0 ? schemaDifferences : undefined,
    };
  }

  public computeDefinitionHash(definition: ToolDefinitionCandidate | {
    serverId?: string;
    toolName?: string;
    name?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }): string {
    const resolvedToolName = ('name' in definition && definition.name ? definition.name : ('toolName' in definition && definition.toolName ? definition.toolName : '')).trim();
    const serverId = 'serverId' in definition && typeof (definition as { serverId?: unknown }).serverId === 'string'
      ? (definition as { serverId: string }).serverId
      : '';
    const normalized = {
      serverId: serverId.trim(),
      toolName: resolvedToolName,
      description: (definition.description ?? '').trim(),
      inputSchema: definition.inputSchema ?? { type: 'object' },
    };

    const canonicalString = this.canonicalizeJson(normalized);
    return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
  }

  private canonicalizeJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      const elements = value.map((item) => this.canonicalizeJson(item));
      return `[${elements.join(',')}]`;
    }

    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const val = obj[key];
      if (val !== undefined) {
        pairs.push(`${JSON.stringify(key)}:${this.canonicalizeJson(val)}`);
      }
    }

    return `{${pairs.join(',')}}`;
  }

  private seedDefaultContracts(): void {
    const defaultList: Array<Omit<ToolContract, 'createdAt' | 'updatedAt' | 'definitionHash'>> = [
      {
        serverId: 'system-fs-server',
        toolName: 'read_file',
        description: 'Reads safe file contents within sandbox',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        version: '1.0.0',
        status: 'ACTIVE',
      },
      {
        serverId: 'database-server',
        toolName: 'query_database',
        description: 'Queries database table records',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        version: '1.0.0',
        status: 'ACTIVE',
      },
      {
        serverId: 'system-fs-server',
        toolName: 'write_file',
        description: 'Writes safe file contents',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['filePath', 'content'],
        },
        version: '1.0.0',
        status: 'PENDING_REVIEW',
      },
      {
        serverId: 'system-server',
        toolName: 'execute_system_command',
        description: 'Executes system shell command (Blocked by policy)',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
        version: '1.0.0',
        status: 'BLOCKED',
      },
      {
        serverId: 'legacy-server',
        toolName: 'legacy_tool',
        description: 'Legacy tool pending sunset',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
        version: '0.9.0',
        status: 'DEPRECATED',
      },
    ];

    for (const contract of defaultList) {
      const now = new Date().toISOString();
      const definitionHash = this.computeDefinitionHash({
        serverId: contract.serverId,
        toolName: contract.toolName,
        description: contract.description,
        inputSchema: contract.inputSchema,
      });
      const key = `${contract.serverId}:${contract.toolName}`;
      this.contracts.set(key, { ...contract, definitionHash, createdAt: now, updatedAt: now });
    }
  }
}
