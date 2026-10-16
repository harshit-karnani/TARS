/**
 * TARS - Hermes Autonomous Agent Persistent Daemon
 *
 * Maintains a continuous, persistent live connection to the TARS MCP Security Gateway.
 * - Subscribes to real-time Gateway SSE events stream.
 * - Dispatches periodic autonomous agent tool requests through the TARS Gateway interceptor.
 * - Triggers deterministic policy checks & ML shadow risk scoring on every tool invocation.
 * - Exposes a local control endpoint at http://127.0.0.1:8445 for custom tool calls.
 * - Automatically recovers and reconnects if Gateway restarts.
 */

import * as http from 'node:http';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:8443';
const AGENT_PORT = parseInt(process.env.HERMES_AGENT_PORT || '8445', 10);
const INTERVAL_MS = parseInt(process.env.HERMES_INTERVAL_MS || '10000', 10);

console.log('================================================================');
console.log('       🚀  HERMES AUTONOMOUS AGENT RUNTIME (CONNECTED)          ');
console.log('================================================================');
console.log(`🔧 Agent Configuration:`);
console.log(`   - Client Identity:     hermes-agent`);
console.log(`   - Target Gateway:      ${GATEWAY_URL}`);
console.log(`   - Live Event Stream:   ${GATEWAY_URL}/api/events/stream`);
console.log(`   - Task Interval:       ${INTERVAL_MS / 1000}s`);
console.log(`   - Local Control Port:  http://127.0.0.1:${AGENT_PORT}`);
console.log(`   - Connection Mode:     PERSISTENT (Connected Forever)`);
console.log('----------------------------------------------------------------\n');

// Realistic tool scenarios that Hermes agent cycles through
const SCENARIOS = [
  {
    name: 'Safe Configuration Read',
    request: {
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'mcp-test-data/safe.txt' },
    },
  },
  {
    name: 'Database Inventory Query',
    request: {
      toolName: 'query_database',
      serverId: 'database-server',
      arguments: { query: 'SELECT * FROM tool_contracts WHERE status = "ACTIVE"' },
    },
  },
  {
    name: 'Workspace State Checkpoint (Requires Human Approval)',
    request: {
      toolName: 'write_file',
      serverId: 'system-fs-server',
      arguments: {
        filePath: 'mcp-test-data/hermes_checkpoint.json',
        content: JSON.stringify({ agent: 'hermes', timestamp: new Date().toISOString() }),
      },
    },
  },
  {
    name: 'Security Benchmark Verification',
    request: {
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: 'README.md' },
    },
  },
  {
    name: 'Path Traversal Boundary Probe (Blocked by TARS)',
    request: {
      toolName: 'read_file',
      serverId: 'system-fs-server',
      arguments: { path: '../../etc/shadow' },
    },
  },
  {
    name: 'Shell Command Execution Probe (Blocked by TARS)',
    request: {
      toolName: 'execute_system_command',
      serverId: 'system-server',
      arguments: { command: 'echo "diagnostic probe from hermes"' },
    },
  },
];

let scenarioIndex = 0;
let isConnected = false;
let executionCount = 0;

/**
 * Executes a single tool call request through the TARS Gateway
 */
async function executeHermesToolCall(customReq = null) {
  const scenario = customReq || SCENARIOS[scenarioIndex % SCENARIOS.length];
  if (!customReq) scenarioIndex++;

  executionCount++;
  const payload = {
    requestId: `hermes-task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    clientIdentity: 'hermes-agent',
    timestamp: new Date().toISOString(),
    ...scenario.request,
  };

  try {
    const res = await fetch(`${GATEWAY_URL}/api/intercept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[Hermes] Gateway returned HTTP ${res.status} for ${payload.toolName}`);
      return null;
    }

    const data = await res.json();
    const result = data.data || {};

    const actionBadge =
      result.action === 'ALLOW'
        ? '🟢 ALLOW'
        : result.action === 'REQUIRE_APPROVAL'
        ? '🟡 REQUIRE_APPROVAL'
        : '🔴 BLOCK';

    console.log(
      `[Hermes #${executionCount}] Tool: ${payload.toolName.padEnd(24)} | ` +
      `Action: ${actionBadge} | ` +
      `Latency: ${result.latencyMs || 0}ms`
    );

    if (result.error) {
      console.log(`          ↳ Policy Note: ${result.error}`);
    }

    return result;
  } catch (err) {
    console.error(`[Hermes] Connection error reaching TARS Gateway: ${err.message}`);
    return null;
  }
}

/**
 * Persistent SSE Stream Listener
 */
function connectSseStream() {
  const sseUrl = `${GATEWAY_URL}/api/events/stream`;

  const req = http.get(sseUrl, (res) => {
    if (res.statusCode !== 200) {
      console.warn(`[Hermes SSE] Stream returned HTTP ${res.statusCode}, retrying in 5s...`);
      setTimeout(connectSseStream, 5000);
      return;
    }

    isConnected = true;
    console.log(`[Hermes SSE] ✅ Successfully connected to TARS Gateway live event stream.`);

    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.substring(6));
            if (event.clientIdentity === 'hermes-agent') {
              const ml = event.decisionEvidence?.mlShadow;
              if (ml && ml.predictedRisk) {
                console.log(
                  `          ↳ ML Shadow Score: [${ml.predictedRisk}] ` +
                  `Confidence: ${(ml.confidence ? ml.confidence * 100 : 0).toFixed(1)}% ` +
                  `(Recorded in SQLite & Dashboard)`
                );
              }
            }
          } catch {
            // Ignore non-json comments
          }
        }
      }
    });

    res.on('end', () => {
      isConnected = false;
      console.warn('[Hermes SSE] Stream disconnected. Reconnecting in 3s...');
      setTimeout(connectSseStream, 3000);
    });

    res.on('error', (err) => {
      isConnected = false;
      console.warn(`[Hermes SSE] Stream error: ${err.message}. Reconnecting in 5s...`);
      setTimeout(connectSseStream, 5000);
    });
  });

  req.on('error', (err) => {
    isConnected = false;
    setTimeout(connectSseStream, 5000);
  });
}

/**
 * Local Control Server for Custom Hermes Tasks
 */
const controlServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://127.0.0.1:${AGENT_PORT}`);

  if (url.pathname === '/status' && req.method === 'GET') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: 'CONNECTED',
        agent: 'hermes-agent',
        gatewayConnected: isConnected,
        gatewayUrl: GATEWAY_URL,
        totalTasksExecuted: executionCount,
        uptimeSeconds: Math.floor(process.uptime()),
      })
    );
    return;
  }

  if (url.pathname === '/trigger' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const customReq = body ? JSON.parse(body) : null;
        const result = await executeHermesToolCall(
          customReq ? { name: 'Custom User Request', request: customReq } : null
        );
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

controlServer.listen(AGENT_PORT, '127.0.0.1', () => {
  console.log(`🎮 Hermes Control Server ready on http://127.0.0.1:${AGENT_PORT}`);
  console.log(`   - GET  /status   Check Hermes connection & telemetry`);
  console.log(`   - POST /trigger  Trigger on-demand tool call via Hermes\n`);
});

// Start persistent SSE stream connection
connectSseStream();
console.log('⚡ Hermes Agent is connected on standby. Ready for on-demand execution.');


// Keep process running forever
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Hermes Agent...');
  controlServer.close();
  process.exit(0);
});
