import { describe, it, expect } from 'vitest';
import { redactPayload, redactString } from '../src/security/redactor.js';

describe('Security Redactor', () => {
  it('redacts sensitive API keys from strings', () => {
    const raw = 'Calling upstream with sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    const { output, redactedTypes } = redactString(raw);
    expect(output).toContain('[REDACTED_ANTHROPIC_API_KEY]');
    expect(redactedTypes).toContain('Anthropic API Key');
  });

  it('redacts Bearer tokens from authorization strings', () => {
    const raw = 'Authorization: Bearer mySecretToken1234567890abcdef';
    const { output } = redactString(raw);
    expect(output).toContain('[REDACTED_BEARER_TOKEN]');
  });

  it('redacts sensitive key names in nested objects', () => {
    const payload = {
      username: 'agent_user',
      apiKey: 'plain-secret-key-value',
      config: {
        password: 'SuperSecretPassword!',
        normalField: 'hello world',
      },
    };

    const result = redactPayload(payload);
    expect(result.wasRedacted).toBe(true);
    expect(result.sanitized.apiKey).toBe('[REDACTED]');
    expect(result.sanitized.config.password).toBe('[REDACTED]');
    expect(result.sanitized.config.normalField).toBe('hello world');
    expect(result.redactedFields).toContain('apiKey');
    expect(result.redactedFields).toContain('config.password');
  });

  it('redacts fake credentials defined in safe.txt format', () => {
    const rawSafeTxt = `
API_KEY=FAKE_TARS_KEY_123456789
AWS_ACCESS_KEY_ID=AKIAFAKE123456789012
AWS_SECRET_ACCESS_KEY=FAKE_SECRET_NOT_VALID_123456789
DATABASE_PASSWORD=FAKE_DB_PASSWORD_ONLY_FOR_TESTING
GITHUB_TOKEN=ghp_FAKE_TOKEN_NOT_VALID_123456789
`;
    const { output, redactedTypes } = redactString(rawSafeTxt);
    expect(output).not.toContain('FAKE_TARS_KEY_123456789');
    expect(output).not.toContain('AKIAFAKE123456789012');
    expect(output).not.toContain('FAKE_SECRET_NOT_VALID_123456789');
    expect(output).not.toContain('FAKE_DB_PASSWORD_ONLY_FOR_TESTING');
    expect(output).not.toContain('ghp_FAKE_TOKEN_NOT_VALID_123456789');
    expect(output).toContain('[REDACTED_CREDENTIAL]');
    expect(output).toContain('[REDACTED_AWS_ACCESS_KEY]');
    expect(output).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(redactedTypes.length).toBeGreaterThan(0);
  });
});
