import { TarsGateway } from './gateway.js';
import { McpGatewayServer } from './forwarding/mcp-gateway-server.js';

export async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8443;
  const host = process.env.HOST || '127.0.0.1';
  const dbPath = process.env.DB_PATH || './tars_audit.sqlite';
  const upstreamCommand = process.env.UPSTREAM_COMMAND || undefined;
  const upstreamArgs = process.env.UPSTREAM_ARGS ? process.env.UPSTREAM_ARGS.split(' ') : undefined;
  const enableRedaction = process.env.ENABLE_REDACTION !== 'false';
  const allowUnknownTools = process.env.ALLOW_UNKNOWN_TOOLS === 'true';
  const enableMlShadowScoring = process.env.ENABLE_ML_SHADOW_SCORING === 'true';
  const mlScoringEndpoint = process.env.ML_SCORING_ENDPOINT || 'http://127.0.0.1:8000';
  const stdioMode = process.env.MCP_STDIO_MODE === 'true';

  const gateway = new TarsGateway({
    port,
    host,
    dbPath,
    upstreamTransport: 'stdio',
    upstreamCommand,
    upstreamArgs,
    enableRedaction,
    allowUnknownTools,
    enableMlShadowScoring,
    mlScoringEndpoint,
  });

  if (stdioMode) {
    // Stdio MCP mode: stdin/stdout dedicated to MCP JSON-RPC protocol
    await gateway.initialize(false);
    const mcpServer = new McpGatewayServer(gateway);
    await mcpServer.startStdio();
    process.stderr.write(`[TARS Gateway] Running in MCP stdio mode. SQLite audit db at: ${dbPath}\n`);

    const shutdown = async () => {
      await mcpServer.close();
      await gateway.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  // HTTP API Server mode (for Dashboard, REST client, and SSE)
  console.log('================================================================');
  console.log('       🛡️  TARS CONTRACT-AWARE MCP SECURITY GATEWAY RUNTIME    ');
  console.log('================================================================');
  console.log(`🔧 Configuration:`);
  console.log(`   - Bind Address:       http://${host}:${port}`);
  console.log(`   - SQLite Audit DB:    ${dbPath}`);
  console.log(`   - Secret Redaction:   ${enableRedaction ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   - ML Shadow Scorer:   ${enableMlShadowScoring ? `ENABLED (${mlScoringEndpoint})` : 'DISABLED (Shadow mode off)'}`);
  console.log(`   - Upstream Command:   ${upstreamCommand ? `${upstreamCommand} ${(upstreamArgs || []).join(' ')}` : 'None (Unconfigured - External tool forwarding inactive)'}`);
  console.log('----------------------------------------------------------------');

  await gateway.initialize(true);

  console.log(`✅ Gateway active and listening at http://${host}:${port}`);
  console.log(`\n📡 Available API & Dashboard Routes:`);
  console.log(`   • GET  /api/health                       Gateway runtime health check`);
  console.log(`   • GET  /api/events                       Paginated audit events (?tool=&action=&limit=&offset=)`);
  console.log(`   • GET  /api/events/stream                Live Server-Sent Events (SSE) stream`);
  console.log(`   • GET  /api/contracts                    Active tool contracts list`);
  console.log(`   • GET  /api/contracts/:srv/:tool/drift   Contract drift verification`);
  console.log(`   • GET  /api/replay/runs                  Security attack replay runs`);
  console.log(`   • GET  /api/policy                       Current deterministic security policy`);
  console.log(`   • POST /api/policy                       Update active security policy`);
  console.log(`   • POST /api/intercept                    Direct tool call test & intercept`);
  console.log('================================================================\n');

  const shutdown = async () => {
    console.log('\n🛑 Shutting down TARS Gateway...');
    await gateway.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('cli.ts'))) {
  main().catch((err) => {
    console.error('Fatal gateway error:', err);
    process.exit(1);
  });
}
