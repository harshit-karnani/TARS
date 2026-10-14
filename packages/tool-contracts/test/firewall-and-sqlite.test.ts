import test from 'node:test';
import assert from 'node:assert';
import { SqliteContractRegistry } from '../src/sqlite-registry.ts';
import { ContractFirewall, validateArguments } from '../src/firewall.ts';
import { seedStandardContracts } from '../src/seeder.ts';

test('SqliteContractRegistry persists contracts, supports queries, and updates status', async () => {
  const registry = new SqliteContractRegistry(':memory:');

  const seeded = await seedStandardContracts(registry);
  assert.strictEqual(seeded.length, 6);

  const readFileContract = await registry.getContract('filesystem-server', 'read_file');
  assert.ok(readFileContract);
  assert.strictEqual(readFileContract.status, 'ACTIVE');

  const blockedBash = await registry.getContract('system-server', 'bash_exec');
  assert.ok(blockedBash);
  assert.strictEqual(blockedBash.status, 'BLOCKED');

  // Filter query
  const blockedList = await registry.listContracts({ status: 'BLOCKED' });
  assert.strictEqual(blockedList.length, 2); // bash_exec and drop_database

  // Update status
  const updated = await registry.updateContractStatus('filesystem-server', 'write_file', 'ACTIVE');
  assert.strictEqual(updated.status, 'ACTIVE');

  registry.close();
});

test('SqliteContractRegistry detects drift and records DRIFTED status', async () => {
  const registry = new SqliteContractRegistry(':memory:');
  await seedStandardContracts(registry);

  const driftResult = await registry.checkDrift('filesystem-server', 'read_file', {
    description: 'Poisoned description',
    inputSchema: { type: 'object' }
  });

  assert.strictEqual(driftResult.hasDrift, true);
  assert.ok(driftResult.schemaDifferences && driftResult.schemaDifferences.length > 0);

  const current = await registry.getContract('filesystem-server', 'read_file');
  assert.strictEqual(current?.status, 'DRIFTED');

  registry.close();
});

test('validateArguments correctly validates types and required fields', () => {
  const schema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      retries: { type: 'number' },
      verbose: { type: 'boolean' }
    },
    required: ['path'],
    additionalProperties: false
  };

  // Valid
  assert.strictEqual(validateArguments(schema, { path: 'a.txt', retries: 3 }).valid, true);

  // Missing required
  const missing = validateArguments(schema, { retries: 3 });
  assert.strictEqual(missing.valid, false);
  assert.ok(missing.errors[0].includes('Missing required'));

  // Invalid type
  const badType = validateArguments(schema, { path: 12345 });
  assert.strictEqual(badType.valid, false);
  assert.ok(badType.errors[0].includes('must be string'));

  // Extra disallowed field
  const extra = validateArguments(schema, { path: 'a.txt', unexpected: true });
  assert.strictEqual(extra.valid, false);
  assert.ok(extra.errors[0].includes('Disallowed additional'));
});

test('ContractFirewall enforces deterministic decisions on calls', async () => {
  const registry = new SqliteContractRegistry(':memory:');
  await seedStandardContracts(registry);
  const firewall = new ContractFirewall(registry);

  // 1. Valid call to active tool -> ALLOW
  const allowDecision = await firewall.evaluateToolCall({
    serverId: 'filesystem-server',
    toolName: 'read_file',
    arguments: { path: 'allowed/file.txt' }
  });
  assert.strictEqual(allowDecision.action, 'ALLOW');
  assert.strictEqual(allowDecision.reasonCode, 'POLICY_ALLOW');

  // 2. Call with invalid arguments to active tool -> BLOCK with SCHEMA_MISMATCH
  const schemaFailDecision = await firewall.evaluateToolCall({
    serverId: 'filesystem-server',
    toolName: 'read_file',
    arguments: { wrongField: 'val' }
  });
  assert.strictEqual(schemaFailDecision.action, 'BLOCK');
  assert.strictEqual(schemaFailDecision.reasonCode, 'SCHEMA_MISMATCH');

  // 3. Call to blocked tool -> BLOCK with POLICY_BLOCK
  const blockedDecision = await firewall.evaluateToolCall({
    serverId: 'system-server',
    toolName: 'bash_exec',
    arguments: { command: 'id' }
  });
  assert.strictEqual(blockedDecision.action, 'BLOCK');
  assert.strictEqual(blockedDecision.reasonCode, 'POLICY_BLOCK');

  // 4. Call to unregistered tool -> REQUIRE_APPROVAL with UNKNOWN_TOOL
  const unknownDecision = await firewall.evaluateToolCall({
    serverId: 'rogue-server',
    toolName: 'exfiltrate',
    arguments: {}
  });
  assert.strictEqual(unknownDecision.action, 'REQUIRE_APPROVAL');
  assert.strictEqual(unknownDecision.reasonCode, 'UNKNOWN_TOOL');

  registry.close();
});
