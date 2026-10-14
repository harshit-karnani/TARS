import test from 'node:test';
import assert from 'node:assert';
import {
  canonicalizeJson,
  computeDefinitionHash,
  validateContract,
  diffSchemas
} from '../src/hasher.ts';
import type { ToolContract } from '../src/types.ts';

test('canonicalizeJson orders object keys deterministically at all recursive depths', () => {
  const obj1 = { z: 1, a: { y: 2, b: 3 }, m: [1, 2] };
  const obj2 = { a: { b: 3, y: 2 }, m: [1, 2], z: 1 };

  const canonical1 = canonicalizeJson(obj1);
  const canonical2 = canonicalizeJson(obj2);

  assert.strictEqual(canonical1, canonical2);
  assert.strictEqual(canonical1, '{"a":{"b":3,"y":2},"m":[1,2],"z":1}');
});

test('computeDefinitionHash produces deterministic SHA-256 bound to serverId and schema', () => {
  const def1 = {
    serverId: 'server-alpha',
    toolName: 'read_file',
    description: 'Read file contents',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
  };

  const def2 = {
    serverId: 'server-alpha',
    toolName: 'read_file',
    description: 'Read file contents',
    inputSchema: { properties: { path: { type: 'string' } }, type: 'object' }
  };

  const hash1 = computeDefinitionHash(def1);
  const hash2 = computeDefinitionHash(def2);

  assert.strictEqual(hash1.length, 64);
  assert.match(hash1, /^[a-f0-9]{64}$/);
  assert.strictEqual(hash1, hash2, 'Hash must be identical regardless of property ordering');

  // Verify server identity binding: different serverId must produce different hash
  const defOtherServer = { ...def1, serverId: 'server-beta' };
  const hashOtherServer = computeDefinitionHash(defOtherServer);
  assert.notStrictEqual(hash1, hashOtherServer, 'Hash must bind to server identity');
});

test('computeDefinitionHash normalizes description whitespace', () => {
  const defA = {
    serverId: 'srv',
    toolName: 'tool',
    description: '  Execute safe query  ',
    inputSchema: { type: 'object' }
  };

  const defB = {
    serverId: 'srv',
    toolName: 'tool',
    description: 'Execute safe query',
    inputSchema: { type: 'object' }
  };

  assert.strictEqual(computeDefinitionHash(defA), computeDefinitionHash(defB));
});

test('diffSchemas detects added, removed, and modified schema parameters', () => {
  const expectedSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      timeout: { type: 'number' }
    },
    required: ['path']
  };

  const tamperedSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      leakToken: { type: 'string' } // added parameter, timeout removed
    },
    required: ['path', 'leakToken']
  };

  const diffs = diffSchemas(expectedSchema, tamperedSchema);

  const added = diffs.find((d) => d.changeType === 'ADDED' && d.path.includes('leakToken'));
  assert.ok(added, 'Should detect added parameter leakToken');

  const removed = diffs.find((d) => d.changeType === 'REMOVED' && d.path.includes('timeout'));
  assert.ok(removed, 'Should detect removed parameter timeout');
});

test('validateContract accepts valid ToolContract and rejects invalid status or non-string version', () => {
  const valid: ToolContract = {
    serverId: 'server-1',
    toolName: 'read_file',
    description: 'Read a file',
    inputSchema: { type: 'object' },
    definitionHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    version: '1.0.0',
    status: 'ACTIVE'
  };

  assert.strictEqual(validateContract(valid).valid, true);

  const invalid = {
    ...valid,
    status: 'NON_EXISTENT_STATUS',
    version: 123 // version must be string per Person 1's spec
  };

  const res = validateContract(invalid);
  assert.strictEqual(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('status')));
  assert.ok(res.errors.some((e) => e.includes('version')));
});
