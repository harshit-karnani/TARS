import { DatabaseSync } from 'node:sqlite';
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

interface ContractRow {
  server_id: string;
  tool_name: string;
  description: string | null;
  input_schema: string;
  definition_hash: string;
  version: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * SQLite-backed implementation of IContractRegistry.
 * Provides durable contract persistence, schema indexing, and drift analysis.
 */
export class SqliteContractRegistry implements IContractRegistry {
  private db: DatabaseSync;

  constructor(databasePath: string = ':memory:') {
    this.db = new DatabaseSync(databasePath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_contracts (
        server_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        description TEXT,
        input_schema TEXT NOT NULL,
        definition_hash TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (server_id, tool_name)
      );

      CREATE INDEX IF NOT EXISTS idx_contracts_hash ON tool_contracts (definition_hash);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON tool_contracts (status);
    `);
  }

  private rowToContract(row: ContractRow): ToolContract {
    return {
      serverId: row.server_id,
      toolName: row.tool_name,
      description: row.description ?? undefined,
      inputSchema: JSON.parse(row.input_schema),
      definitionHash: row.definition_hash,
      version: row.version,
      status: row.status as ContractStatus,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
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
    const stmt = this.db.prepare(`
      SELECT * FROM tool_contracts
      WHERE server_id = ? AND tool_name = ?
    `);
    const row = stmt.get(serverId, toolName) as ContractRow | undefined;
    return row ? this.rowToContract(row) : null;
  }

  async listContracts(filter?: ContractQueryFilter): Promise<ToolContract[]> {
    let query = 'SELECT * FROM tool_contracts WHERE 1=1';
    const params: string[] = [];

    if (filter?.serverId) {
      query += ' AND server_id = ?';
      params.push(filter.serverId);
    }

    if (filter?.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }

    query += ' ORDER BY server_id ASC, tool_name ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as ContractRow[];
    return rows.map((r) => this.rowToContract(r));
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

    const stmt = this.db.prepare(`
      INSERT INTO tool_contracts (
        server_id, tool_name, description, input_schema,
        definition_hash, version, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, tool_name) DO UPDATE SET
        description = excluded.description,
        input_schema = excluded.input_schema,
        definition_hash = excluded.definition_hash,
        version = excluded.version,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      contract.serverId,
      contract.toolName,
      contract.description ?? null,
      JSON.stringify(contract.inputSchema),
      contract.definitionHash,
      contract.version,
      contract.status,
      contract.notes ?? null,
      contract.createdAt ?? now,
      contract.updatedAt ?? now
    );

    return { ...contract };
  }

  async updateContractStatus(
    serverId: string,
    toolName: string,
    status: ContractStatus
  ): Promise<ToolContract> {
    const existing = await this.getContract(serverId, toolName);
    if (!existing) {
      throw new Error(`Contract not found for serverId "${serverId}" and toolName "${toolName}"`);
    }

    const updatedAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tool_contracts
      SET status = ?, updated_at = ?
      WHERE server_id = ? AND tool_name = ?
    `);

    stmt.run(status, updatedAt, serverId, toolName);

    return {
      ...existing,
      status,
      updatedAt
    };
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

    const schemaDifferences: SchemaDifference[] = [];

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

    const schemaDiffs = diffSchemas(
      existing.inputSchema,
      advertisedDefinition.inputSchema
    );
    schemaDifferences.push(...schemaDiffs);

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

  close(): void {
    this.db.close();
  }
}
