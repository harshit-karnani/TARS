import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { AuditEvent, AuditLogQueryFilter } from '@tars/shared-types';
import type { IAuditStorage } from './audit-storage.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export interface ISqliteAuditStorage extends IAuditStorage {
  countEvents(filter?: AuditLogQueryFilter): Promise<number>;
}

export class SqliteAuditStorage implements ISqliteAuditStorage {
  private dbPath: string;
  private db: any = null;

  constructor(dbPath: string = './tars_audit.sqlite') {
    this.dbPath = dbPath;
  }

  public async initialize(): Promise<void> {
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);

    // Create table with proper columns and indices
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        requestId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        serverId TEXT,
        tool TEXT NOT NULL,
        action TEXT NOT NULL,
        reasonCode TEXT NOT NULL,
        executionStatus TEXT NOT NULL,
        policyVersion TEXT NOT NULL,
        contractVersion TEXT,
        clientIdentity TEXT,
        parameters TEXT,
        redacted INTEGER NOT NULL DEFAULT 0,
        latencyMs REAL,
        decisionEvidence TEXT,
        errorMessage TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_events(tool);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
      CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_events(executionStatus);
    `);
  }

  public async recordEvent(event: AuditEvent): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO audit_events (
        id, requestId, timestamp, serverId, tool, action,
        reasonCode, executionStatus, policyVersion, contractVersion,
        clientIdentity, parameters, redacted, latencyMs,
        decisionEvidence, errorMessage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.requestId,
      event.timestamp,
      event.serverId ?? null,
      event.tool,
      event.action,
      event.reasonCode,
      event.executionStatus,
      event.policyVersion,
      event.contractVersion ?? null,
      event.clientIdentity ?? null,
      event.parameters ? JSON.stringify(event.parameters) : null,
      event.redacted ? 1 : 0,
      event.latencyMs ?? null,
      event.decisionEvidence ? JSON.stringify(event.decisionEvidence) : null,
      event.errorMessage ?? null
    );
  }

  public async queryEvents(filter?: AuditLogQueryFilter): Promise<AuditEvent[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { clause, params } = this.buildWhereClause(filter);
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const query = `
      SELECT * FROM audit_events
      ${clause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params, limit, offset) as Record<string, unknown>[];

    return rows.map((row) => this.mapRowToEvent(row));
  }

  public async countEvents(filter?: AuditLogQueryFilter): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { clause, params } = this.buildWhereClause(filter);
    const query = `SELECT COUNT(*) as total FROM audit_events ${clause}`;
    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { total: number };
    return result.total;
  }

  public async getEventById(id: string): Promise<AuditEvent | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`SELECT * FROM audit_events WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    return row ? this.mapRowToEvent(row) : null;
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private buildWhereClause(filter?: AuditLogQueryFilter): { clause: string; params: (string | number)[] } {
    if (!filter) {
      return { clause: '', params: [] };
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.requestId) {
      conditions.push('requestId = ?');
      params.push(filter.requestId);
    }
    if (filter.tool) {
      conditions.push('tool = ?');
      params.push(filter.tool);
    }
    if (filter.action) {
      conditions.push('action = ?');
      params.push(filter.action);
    }
    if (filter.executionStatus) {
      conditions.push('executionStatus = ?');
      params.push(filter.executionStatus);
    }
    if (filter.policyVersion) {
      conditions.push('policyVersion = ?');
      params.push(filter.policyVersion);
    }
    if (filter.contractVersion) {
      conditions.push('contractVersion = ?');
      params.push(filter.contractVersion);
    }
    if (filter.fromTimestamp) {
      conditions.push('timestamp >= ?');
      params.push(filter.fromTimestamp);
    }
    if (filter.toTimestamp) {
      conditions.push('timestamp <= ?');
      params.push(filter.toTimestamp);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }

  private mapRowToEvent(row: Record<string, unknown>): AuditEvent {
    return {
      id: String(row.id),
      requestId: String(row.requestId),
      timestamp: String(row.timestamp),
      serverId: row.serverId ? String(row.serverId) : undefined,
      tool: String(row.tool),
      action: row.action as AuditEvent['action'],
      reasonCode: String(row.reasonCode),
      executionStatus: row.executionStatus as AuditEvent['executionStatus'],
      policyVersion: String(row.policyVersion),
      contractVersion: row.contractVersion ? String(row.contractVersion) : undefined,
      clientIdentity: row.clientIdentity ? String(row.clientIdentity) : undefined,
      parameters: row.parameters ? JSON.parse(String(row.parameters)) : undefined,
      redacted: Boolean(row.redacted),
      latencyMs: row.latencyMs !== null && row.latencyMs !== undefined ? Number(row.latencyMs) : undefined,
      decisionEvidence: row.decisionEvidence ? JSON.parse(String(row.decisionEvidence)) : undefined,
      errorMessage: row.errorMessage ? String(row.errorMessage) : undefined,
    };
  }
}
