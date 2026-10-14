import test from 'node:test';
import assert from 'node:assert';
import {
  ACTIVE_READ_FILE_CONTRACT,
  BLOCKED_BASH_EXEC_CONTRACT,
  PENDING_HTTP_FETCH_CONTRACT,
  DRIFTED_READ_FILE_DEFINITION,
  UNKNOWN_TOOL_DEFINITION
} from '../src/fixtures/sample-contracts.ts';
import { validateContract, computeDefinitionHash } from '../src/hasher.ts';
import { InMemoryContractRegistry } from '../src/registry.ts';

test('sample fixtures strictly conform to ToolContract specification', () => {
  const fixtures = [
    ACTIVE_READ_FILE_CONTRACT,
    BLOCKED_BASH_EXEC_CONTRACT,
    PENDING_HTTP_FETCH_CONTRACT
  ];

  for (const contract of fixtures) {
    const val = validateContract(contract);
    assert.strictEqual(val.valid, true, `Fixture "${contract.toolName}" failed validation: ${val.errors.join(', ')}`);

    const expectedHash = computeDefinitionHash({
      serverId: contract.serverId,
      toolName: contract.toolName,
      description: contract.description,
      inputSchema: contract.inputSchema
    });
    assert.strictEqual(
      contract.definitionHash,
      expectedHash,
      `Definition hash for "${contract.toolName}" must match deterministic computation`
    );
  }
});

test('DRIFTED_READ_FILE_DEFINITION detects drift and reports schema differences against ACTIVE_READ_FILE_CONTRACT', async () => {
  const registry = new InMemoryContractRegistry();
  await registry.registerContract(ACTIVE_READ_FILE_CONTRACT);

  const driftResult = await registry.checkDrift(
    ACTIVE_READ_FILE_CONTRACT.serverId,
    ACTIVE_READ_FILE_CONTRACT.toolName,
    DRIFTED_READ_FILE_DEFINITION
  );

  assert.strictEqual(driftResult.hasDrift, true);
  assert.strictEqual(driftResult.expectedHash, ACTIVE_READ_FILE_CONTRACT.definitionHash);
  assert.notStrictEqual(driftResult.actualHash, ACTIVE_READ_FILE_CONTRACT.definitionHash);

  // Check that differences include both description modification and added schema parameter
  const hasDescDiff = driftResult.schemaDifferences?.some((d) => d.path === 'description');
  const hasParamDiff = driftResult.schemaDifferences?.some(
    (d) => d.changeType === 'ADDED' && d.path.includes('exfiltrateUrl')
  );

  assert.ok(hasDescDiff, 'Should report description tampering');
  assert.ok(hasParamDiff, 'Should report injected exfiltration parameter');
});

test('UNKNOWN_TOOL_DEFINITION triggers UNREGISTERED drift result', async () => {
  const registry = new InMemoryContractRegistry();
  const driftResult = await registry.checkDrift(
    'unregistered-server',
    'unknown_tool',
    UNKNOWN_TOOL_DEFINITION
  );

  assert.strictEqual(driftResult.hasDrift, true);
  assert.strictEqual(driftResult.contractVersion, 'UNREGISTERED');
});
