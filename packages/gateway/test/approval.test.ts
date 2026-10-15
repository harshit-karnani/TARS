import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TarsGateway } from '../src/gateway.js';
import type { ToolCallRequest } from '@tars/shared-types';

describe('TARS Approval Workflow — Endpoints, Authorization, & Exactly-Once Execution', () => {
  let gateway: TarsGateway;
  const testPort = 9877;
  const adminToken = 'tars-admin-token';

  beforeEach(async () => {
    gateway = new TarsGateway(
      {
        port: testPort,
        host: '127.0.0.1',
        dbPath: ':memory:',
      },
      {
        enableSimulationFallback: true,
      }
    );
    await gateway.initialize(true);
  });

  afterEach(async () => {
    await gateway.shutdown();
  });

  it('triggers REQUIRE_APPROVAL for mutation, exposes it via GET /api/approvals/pending, and approves it', async () => {
    const reqId = `req-write-${Date.now()}`;
    const mutationReq: ToolCallRequest = {
      requestId: reqId,
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'safe_output.txt', content: 'test content' },
    };

    // 1. Initial tool call suspends execution and enters pending approval queue
    const interceptRes = await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationReq),
    });
    expect(interceptRes.status).toBe(200);
    const interceptData = (await interceptRes.json()) as any;
    expect(interceptData.data.action).toBe('REQUIRE_APPROVAL');
    expect(interceptData.data.success).toBe(false);

    // 2. Query GET /api/approvals/pending
    const pendingRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/pending`);
    expect(pendingRes.status).toBe(200);
    const pendingData = (await pendingRes.json()) as any;
    expect(pendingData.success).toBe(true);
    expect(pendingData.data.length).toBeGreaterThanOrEqual(1);
    const found = pendingData.data.find((p: any) => p.requestId === reqId);
    expect(found).toBeDefined();
    expect(found.toolName).toBe('write_file');

    // 3. Approve via POST /api/approvals/decision with valid bearer token
    const approveRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
        approver: 'sec-admin',
      }),
    });
    expect(approveRes.status).toBe(200);
    const approveData = (await approveRes.json()) as any;
    expect(approveData.success).toBe(true);
    expect(approveData.data.decision).toBe('APPROVE');
    expect(approveData.data.executed).toBe(true);
    expect(approveData.data.executionStatus).toBe('SUCCESS');

    // 4. Pending queue should now be empty for this request
    const pendingAfter = await fetch(`http://127.0.0.1:${testPort}/api/approvals/pending`);
    const pendingAfterData = (await pendingAfter.json()) as any;
    expect(pendingAfterData.data.find((p: any) => p.requestId === reqId)).toBeUndefined();

    // 5. Audit event should reflect APPROVAL_GRANTED and SUCCESS
    const eventsRes = await fetch(`http://127.0.0.1:${testPort}/api/events?limit=10`);
    const eventsData = (await eventsRes.json()) as any;
    const approvedEvent = eventsData.data.items.find((e: any) => e.requestId === reqId && e.reasonCode === 'APPROVAL_GRANTED');
    expect(approvedEvent).toBeDefined();
    expect(approvedEvent.executionStatus).toBe('SUCCESS');
    expect(approvedEvent.decisionEvidence?.evaluatedChecks).toContain('human_approval_granted');
  });

  it('rejects a pending mutation without executing upstream operation', async () => {
    const reqId = `req-delete-${Date.now()}`;
    const mutationReq: ToolCallRequest = {
      requestId: reqId,
      toolName: 'delete_file',
      serverId: 'system-fs-server',
      arguments: { path: 'old_data.txt' },
    };

    // 1. Inbound mutation requires approval
    await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationReq),
    });

    // 2. Reject via POST /api/approvals/decision
    const rejectRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'REJECT',
        approver: 'lead-auditor',
        reason: 'Unauthorized file removal',
      }),
    });
    expect(rejectRes.status).toBe(200);
    const rejectData = (await rejectRes.json()) as any;
    expect(rejectData.success).toBe(true);
    expect(rejectData.data.decision).toBe('REJECT');
    expect(rejectData.data.executed).toBe(false);
    expect(rejectData.data.executionStatus).toBe('BLOCKED');

    // 3. Audit trail shows BLOCKED with APPROVAL_REJECTED
    const eventsRes = await fetch(`http://127.0.0.1:${testPort}/api/events?limit=10`);
    const eventsData = (await eventsRes.json()) as any;
    const rejectedEvent = eventsData.data.items.find((e: any) => e.requestId === reqId && e.reasonCode === 'APPROVAL_REJECTED');
    expect(rejectedEvent).toBeDefined();
    expect(rejectedEvent.action).toBe('BLOCK');
    expect(rejectedEvent.executionStatus).toBe('BLOCKED');
  });

  it('safely handles duplicate approval clicks (409 Conflict) and executes exactly once', async () => {
    const reqId = `req-dup-${Date.now()}`;
    const mutationReq: ToolCallRequest = {
      requestId: reqId,
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'duplicate_test.txt', content: 'once' },
    };

    // 1. Suspend execution into pending
    await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationReq),
    });

    // 2. First approval click succeeds
    const firstRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
        approver: 'admin-1',
      }),
    });
    expect(firstRes.status).toBe(200);

    // 3. Second approval click for same requestId fails with 409 DUPLICATE_APPROVAL
    const secondRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
        approver: 'admin-2',
      }),
    });
    expect(secondRes.status).toBe(409);
    const secondData = (await secondRes.json()) as any;
    expect(secondData.success).toBe(false);
    expect(secondData.error.code).toBe('DUPLICATE_APPROVAL');
  });

  it('rejects unauthorized approval requests without valid token with 401', async () => {
    const reqId = `req-unauth-${Date.now()}`;
    const mutationReq: ToolCallRequest = {
      requestId: reqId,
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'unauth.txt', content: 'hello' },
    };

    await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationReq),
    });

    // 1. Missing Authorization header
    const noAuthRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
      }),
    });
    expect(noAuthRes.status).toBe(401);
    const noAuthData = (await noAuthRes.json()) as any;
    expect(noAuthData.error.code).toBe('UNAUTHORIZED');

    // 2. Invalid Token
    const badAuthRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token-xyz',
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
      }),
    });
    expect(badAuthRes.status).toBe(401);
    const badAuthData = (await badAuthRes.json()) as any;
    expect(badAuthData.error.code).toBe('UNAUTHORIZED');
  });

  it('safely handles expired approvals with 410', async () => {
    const reqId = `req-exp-${Date.now()}`;
    const mutationReq: ToolCallRequest = {
      requestId: reqId,
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: { filePath: 'expired.txt', content: 'test' },
    };

    await fetch(`http://127.0.0.1:${testPort}/api/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationReq),
    });

    // Artificially expire the item in the pending map
    const pendingItem = (gateway as any).pendingApprovals.get(reqId);
    if (pendingItem) {
      pendingItem.expiresAt = Date.now() - 1000;
    }

    const expRes = await fetch(`http://127.0.0.1:${testPort}/api/approvals/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        requestId: reqId,
        decision: 'APPROVE',
      }),
    });
    expect(expRes.status).toBe(410);
    const expData = (await expRes.json()) as any;
    expect(expData.error.code).toBe('APPROVAL_EXPIRED');
  });
});
