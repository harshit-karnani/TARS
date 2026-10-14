import type { ServerResponse } from 'node:http';
import type { AuditEvent } from '@tars/shared-types';

export class EventBroadcaster {
  private clients: Set<ServerResponse> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public registerClient(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection comment
    res.write(': connected to TARS security gateway SSE stream\n\n');
    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  public broadcast(event: AuditEvent): void {
    if (this.clients.size === 0) {
      return;
    }

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  public getConnectedCount(): number {
    return this.clients.size;
  }

  public close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(': heartbeat\n\n');
        } catch {
          this.clients.delete(client);
        }
      }
    }, 15000);
  }
}
