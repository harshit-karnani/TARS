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
});
