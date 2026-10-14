import type {
  ToolContract,
  ContractStatus,
  ContractQueryFilter,
  ContractDriftResult,
  SchemaDifference,
  IContractRegistry
} from './types.ts';
import {
  computeDefinitionHash,
  validateContract,
  diffSchemas
} from './hasher.ts';

/**
 * In-memory reference implementation of IContractRegistry.
 * Implements Person 1's canonical contract interface with deterministic
 * hashing (serverId-bound) and granular schema drift analysis.
 */
export class InMemoryContractRegistry implements IContractRegistry {
  private contracts = new Map<string, ToolContract>();

  private makeKey(serverId: string, toolName: string): string {
    return `${serverId}:${toolName}`;
  }

  computeDefinitionHash(definition: {
    toolName: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    serverId?: string;
  }): string {
    return computeDefinitionHash(definition);
  }

  async getContract(serverId: string, toolName: string): Promise<ToolContract | null> {
    const key = this.makeKey(serverId, toolName);
    const item = this.contracts.get(key);
    return item ? { ...item } : null;
  }

  async listContracts(filter?: ContractQueryFilter): Promise<ToolContract[]> {
    const list: ToolContract[] = [];

    for (const contract of this.contracts.values()) {
      if (filter) {
        if (filter.serverId && contract.serverId !== filter.serverId) continue;
        if (filter.status && contract.status !== filter.status) continue;
      }
      list.push({ ...contract });
    }

    return list;
  }

  async registerContract(
    contractInput: Omit<ToolContract, 'createdAt' | 'updatedAt'>
  ): Promise<ToolContract> {
    const now = new Date().toISOString();

    const computedHash = this.computeDefinitionHash({
      serverId: contractInput.serverId,
      toolName: contractInput.toolName,
      description: contractInput.description,
      inputSchema: contractInput.inputSchema
    });

    if (
      contractInput.definitionHash &&
      contractInput.definitionHash.trim() !== '' &&
      contractInput.definitionHash !== computedHash
    ) {
      throw new Error(
        `Security rejected: Caller-provided definitionHash (${contractInput.definitionHash}) does not match computed canonical hash (${computedHash})`
      );
    }

    const definitionHash = computedHash;

    const contract: ToolContract = {
      serverId: contractInput.serverId,
      toolName: contractInput.toolName,
      description: contractInput.description,
      inputSchema: contractInput.inputSchema,
      definitionHash,
      version: contractInput.version,
      status: contractInput.status,
      notes: contractInput.notes,
      createdAt: (contractInput as Partial<ToolContract>).createdAt ?? now,
      updatedAt: (contractInput as Partial<ToolContract>).updatedAt ?? now
    };

    const validation = validateContract(contract);
    if (!validation.valid) {
      throw new Error(`Contract validation failed: ${validation.errors.join(', ')}`);
    }

    const key = this.makeKey(contract.serverId, contract.toolName);
    this.contracts.set(key, contract);

    return { ...contract };
  }

  async updateContractStatus(
    serverId: string,
    toolName: string,
    status: ContractStatus
  ): Promise<ToolContract> {
    const key = this.makeKey(serverId, toolName);
    const existing = this.contracts.get(key);

    if (!existing) {
      throw new Error(`Contract not found for serverId "${serverId}" and toolName "${toolName}"`);
    }

    const updated: ToolContract = {
      ...existing,
      status,
      updatedAt: new Date().toISOString()
    };

    this.contracts.set(key, updated);
    return { ...updated };
  }

  async checkDrift(
    serverId: string,
    toolName: string,
    advertisedDefinition: {
      description?: string;
      inputSchema: Record<string, unknown>;
    }
  ): Promise<ContractDriftResult> {
    const detectedAt = new Date().toISOString();
    const actualHash = this.computeDefinitionHash({
      serverId,
      toolName,
      description: advertisedDefinition.description,
      inputSchema: advertisedDefinition.inputSchema
    });

    const existing = await this.getContract(serverId, toolName);

    // Case 1: Unregistered tool definition
    if (!existing) {
      return {
        serverId,
        toolName,
        contractVersion: 'UNREGISTERED',
        hasDrift: true,
        expectedHash: '',
        actualHash,
        detectedAt,
        schemaDifferences: [
          {
            path: 'root',
            changeType: 'ADDED',
            actual: advertisedDefinition,
            description: `Tool "${toolName}" on server "${serverId}" has no registered contract baseline`
          }
        ]
      };
    }

    // Case 2: Matching canonical hash (no drift)
    if (existing.definitionHash === actualHash) {
      return {
        serverId,
        toolName,
        contractVersion: existing.version,
        hasDrift: false,
        expectedHash: existing.definitionHash,
        actualHash,
        detectedAt,
        schemaDifferences: []
      };
    }

    // Case 3: Drift detected (hash mismatch against registered baseline)
    const schemaDifferences: SchemaDifference[] = [];

    // Check description differences
    const expDesc = (existing.description ?? '').trim();
    const actDesc = (advertisedDefinition.description ?? '').trim();
    if (expDesc !== actDesc) {
      schemaDifferences.push({
        path: 'description',
        changeType: 'MODIFIED',
        expected: existing.description,
        actual: advertisedDefinition.description,
        description: 'Tool functional description was modified from approved baseline'
      });
    }

    // Check schema differences
    const schemaDiffs = diffSchemas(
      existing.inputSchema,
      advertisedDefinition.inputSchema
    );
    schemaDifferences.push(...schemaDiffs);

    // If existing contract was ACTIVE, flag it as DRIFTED in registry
    if (existing.status === 'ACTIVE') {
      await this.updateContractStatus(serverId, toolName, 'DRIFTED');
    }

    return {
      serverId,
      toolName,
      contractVersion: existing.version,
      hasDrift: true,
      expectedHash: existing.definitionHash,
      actualHash,
      detectedAt,
      schemaDifferences
    };
  }
}
