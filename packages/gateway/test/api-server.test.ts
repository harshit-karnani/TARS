import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TarsGateway } from '../src/gateway.js';

describe('Phase 4 — Gateway API Server & SSE Endpoints', () => {
  let gateway: TarsGateway;
  const testPort = 9876;

  beforeEach(async () => {
    gateway = new TarsGateway({
      port: testPort,
      host: '127.0.0.1',
      dbPath: ':memory:',
    });
    await gateway.initialize(true); // Start API server
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  it('GET /api/health returns healthy status and active metrics', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('HEALTHY');
    expect(body.data.version).toBe('1.0.0');
    expect(typeof body.data.activeSseClients).toBe('number');
  });

  it('POST /api/intercept processes tool calls and records them for GET /api/events', async () => {
    // 1. Intercept a safe tool call via API
    const interceptRes = await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: 'read_file',
        arguments: { path: 'test_doc.txt' },
      }),
    });
    expect(interceptRes.status).toBe(200);
    const interceptBody = (await interceptRes.json()) as any;
    expect(interceptBody.success).toBe(true);
    expect(interceptBody.data.action).toBe('ALLOW');

    // 2. Query paginated audit events with filters
    const eventsRes = await fetch(`http://127.0.0.1:${testPort}/api/events?limit=10&offset=0&tool=read_file&action=ALLOW`);
    expect(eventsRes.status).toBe(200);
    const eventsBody = (await eventsRes.json()) as any;
    expect(eventsBody.success).toBe(true);
    expect(eventsBody.data.items.length).toBeGreaterThanOrEqual(1);
    expect(eventsBody.data.items[0].tool).toBe('read_file');
    expect(eventsBody.data.items[0].action).toBe('ALLOW');
    expect(eventsBody.data.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/contracts returns registered tool contracts', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/contracts`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].toolName).toBe('read_file');
    expect(body.data[0].status).toBe('ACTIVE');
  });

  it('GET /api/contracts/:serverId/:toolName/drift checks tool drift status', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/contracts/system-fs-server/read_file/drift`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.toolName).toBe('read_file');
    expect(body.data.serverId).toBe('system-fs-server');
    expect(typeof body.data.hasDrift).toBe('boolean');
    expect(body.data.expectedHash).toBeDefined();
  });

  it('GET /api/replay/runs returns replay run benchmarks and test cases', async () => {
    // 1. Execute live replay suite via POST /api/replay/run
    const postRes = await fetch(`http://127.0.0.1:${testPort}/api/replay/run`, {
      method: 'POST',
    });
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.success).toBe(true);
    expect(postBody.data.totalCases).toBe(4);

    // 2. Query recorded replay runs via GET /api/replay/runs
    const res = await fetch(`http://127.0.0.1:${testPort}/api/replay/runs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].runId).toMatch(/^live-replay-/);
    expect(body.data[0].passRate).toBe(1.0);
  });

  it('GET /api/policy and POST /api/policy retrieves and updates security policy', async () => {
    // 1. Fetch current policy
    const getRes = await fetch(`http://127.0.0.1:${testPort}/api/policy`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.success).toBe(true);
    expect(getBody.data.version).toBe('1.0.0');

    // 2. Update policy
    const updatedPolicy = {
      ...getBody.data,
      version: '1.1.0',
      description: 'Updated test security policy',
    };

    const postRes = await fetch(`http://127.0.0.1:${testPort}/api/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPolicy),
    });
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.success).toBe(true);
    expect(postBody.data.version).toBe('1.1.0');

    // Verify policy engine reflected update
    expect(gateway.getPolicyEngine().getPolicyVersion()).toBe('1.1.0');
  });

  it('POST /api/intercept maps "parameters" field correctly without losing required contract schema arguments', async () => {
    const interceptRes = await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'ml-shadow-test-002',
        serverId: 'system-fs-server',
        toolName: 'read_file',
        parameters: {
          path: 'safe_document.txt',
        },
      }),
    });
    expect(interceptRes.status).toBe(200);
    const interceptBody = (await interceptRes.json()) as any;
    expect(interceptBody.success).toBe(true);
    expect(interceptBody.data.action).toBe('ALLOW');
    expect(interceptBody.data.error).not.toContain('SCHEMA_MISMATCH');

    // Verify audit event accurately persisted parameters and not empty object
    const eventsRes = await fetch(`http://127.0.0.1:${testPort}/api/events?limit=5`);
    const eventsBody = (await eventsRes.json()) as any;
    const matched = eventsBody.data.items.find((e: any) => e.requestId === 'ml-shadow-test-002');
    expect(matched).toBeDefined();
    expect(matched.action).toBe('ALLOW');
    expect(matched.parameters).toEqual({ path: 'safe_document.txt' });
    expect(matched.decisionEvidence?.notes).not.toContain("Missing required parameter: 'path'");
  });
});
