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
        name: toolName,
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
      name: toolName,
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

  public computeDefinitionHash(definition: ToolDefinitionCandidate): string {
    const canonicalPayload = {
      name: 'name' in definition ? definition.name : definition.toolName,
      description: definition.description || '',
      inputSchema: definition.inputSchema || {},
    };

    const serialized = JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  private seedDefaultContracts(): void {
    const defaultList: Array<Omit<ToolContract, 'createdAt' | 'updatedAt'>> = [
      {
        serverId: 'system-fs-server',
        toolName: 'read_file',
        description: 'Reads safe file contents within sandbox',
        inputSchema: {
          type: 'object',
          properties: { filePath: { type: 'string' } },
          required: ['filePath'],
        },
        definitionHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
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
        definitionHash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
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
        definitionHash: '4a53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
        version: '1.0.0',
        status: 'ACTIVE',
      },
    ];

    for (const contract of defaultList) {
      const now = new Date().toISOString();
      const key = `${contract.serverId}:${contract.toolName}`;
      this.contracts.set(key, { ...contract, createdAt: now, updatedAt: now });
    }
  }
}
