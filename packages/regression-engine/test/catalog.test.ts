import test from 'node:test';
import assert from 'node:assert';
import { STANDARD_ATTACK_SUITE } from '../src/attack-catalog.ts';

test('STANDARD_ATTACK_SUITE contains valid, unique, and well-structured test cases', () => {
  assert.ok(STANDARD_ATTACK_SUITE.length >= 14, 'Should contain at least 14 test cases');

  const seenIds = new Set<string>();
  const categories = new Set<string>();

  for (const tc of STANDARD_ATTACK_SUITE) {
    // Unique ID
    assert.ok(!seenIds.has(tc.caseId), `Duplicate caseId: ${tc.caseId}`);
    seenIds.add(tc.caseId);

    // Required fields
    assert.ok(tc.name && tc.name.length > 0);
    assert.ok(tc.category);
    assert.ok(tc.toolName);
    assert.ok(tc.inputPayload && typeof tc.inputPayload === 'object');
    assert.ok(['ALLOW', 'BLOCK', 'REQUIRE_APPROVAL'].includes(tc.expectedAction));

    categories.add(tc.category);
  }

  // Ensure diverse coverage
  assert.ok(categories.has('PATH_TRAVERSAL'));
  assert.ok(categories.has('INJECTION'));
  assert.ok(categories.has('SCHEMA_TAMPER'));
  assert.ok(categories.has('PRIVILEGE_ESCALATION'));
  assert.ok(categories.has('REGRESSION'));
});
