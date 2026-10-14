import type { AuditEvent, AuditLogQueryFilter } from '@tars/shared-types';

export interface IAuditStorage {
  initialize(): Promise<void>;
  recordEvent(event: AuditEvent): Promise<void>;
  queryEvents(filter?: AuditLogQueryFilter): Promise<AuditEvent[]>;
  getEventById(id: string): Promise<AuditEvent | null>;
  close(): Promise<void>;
}

/**
 * InMemoryAuditStorage provides an initial non-blocking storage implementation
 * for the gateway foundation and test suites before SQLite persistence is linked.
 */
export class InMemoryAuditStorage implements IAuditStorage {
  private events: AuditEvent[] = [];

  public async initialize(): Promise<void> {
    // Ready immediately
  }

  public async recordEvent(event: AuditEvent): Promise<void> {
    this.events.unshift(event);
  }

  public async queryEvents(filter?: AuditLogQueryFilter): Promise<AuditEvent[]> {
    let result = [...this.events];

    if (filter?.tool) {
      result = result.filter((e) => e.tool === filter.tool);
    }
    if (filter?.action) {
      result = result.filter((e) => e.action === filter.action);
    }
    if (filter?.executionStatus) {
      result = result.filter((e) => e.executionStatus === filter.executionStatus);
    }
    if (filter?.policyVersion) {
      result = result.filter((e) => e.policyVersion === filter.policyVersion);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  public async getEventById(id: string): Promise<AuditEvent | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  public async close(): Promise<void> {
    this.events = [];
  }
}
