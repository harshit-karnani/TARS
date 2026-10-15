import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

  it('redacts common credential assignments (API_KEY, AWS_SECRET_ACCESS_KEY, DATABASE_PASSWORD, GITHUB_TOKEN)', () => {
    const rawAssignments = [
      'API_KEY=my_secret_api_key_val_9988',
      'API_KEY="quoted-api-key-val"',
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'DATABASE_PASSWORD=SuperSecretDbPassword123!',
      'GITHUB_TOKEN=ghp_ABC1234567890abcdefghijklmnopqrstuv',
      'SAFE_CONFIG_SETTING=true',
    ].join('\n');

    const { output, redactedTypes } = redactString(rawAssignments);
    expect(redactedTypes).toContain('API Key');
    expect(redactedTypes).toContain('AWS Secret Access Key');
    expect(redactedTypes).toContain('Database Password');
    expect(redactedTypes).toContain('GitHub Token');

    // Values must be redacted
    expect(output).not.toContain('my_secret_api_key_val_9988');
    expect(output).not.toContain('quoted-api-key-val');
    expect(output).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    expect(output).not.toContain('SuperSecretDbPassword123!');
    expect(output).not.toContain('ghp_ABC1234567890abcdefghijklmnopqrstuv');

    // Non-sensitive structure and keys are preserved
    expect(output).toContain('API_KEY=[REDACTED_API_KEY]');
    expect(output).toContain('API_KEY="[REDACTED_API_KEY]"');
    expect(output).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_SECRET_ACCESS_KEY]');
    expect(output).toContain('DATABASE_PASSWORD=[REDACTED_DATABASE_PASSWORD]');
    expect(output).toContain('GITHUB_TOKEN=[REDACTED_GITHUB_TOKEN]');
    expect(output).toContain('SAFE_CONFIG_SETTING=true');
  });

  it('redacts all synthetic credential values from safe.txt while preserving safe non-sensitive text', () => {
    const candidates = [
      path.resolve(process.cwd(), 'mcp-test-data/safe.txt'),
      path.resolve(__dirname, '../../../mcp-test-data/safe.txt'),
    ];
    const safePath = candidates.find((p) => fs.existsSync(p));
    expect(safePath).toBeDefined();

    const safeContent = fs.readFileSync(safePath!, 'utf8');
    const { output, redactedTypes } = redactString(safeContent);

    // Confirm that every credential value from safe.txt is sanitized
    const rawCredentials = [
      'FAKE_TARS_KEY_123456789',
      'AKIAFAKE123456789012',
      'FAKE_SECRET_NOT_VALID_123456789',
      'FAKE_DB_PASSWORD_ONLY_FOR_TESTING',
      'ghp_FAKE_TOKEN_NOT_VALID_123456789',
    ];

    for (const cred of rawCredentials) {
      expect(output).not.toContain(cred);
    }

    // Confirm safe non-sensitive text is preserved
    expect(output).toContain('TARS SECURITY TEST DATA');
    expect(output).toContain('Project: TARS');
    expect(output).toContain('Status: Demo testing');
    expect(output).toContain('Environment: Local development');
    expect(output).toContain('SENSITIVE PERSONAL DATA — SYNTHETIC');
    expect(output).toContain('Name: Demo User');
    expect(output).toContain('Email: demo.user@example.com');
    expect(output).toContain('SECURITY TEST CASES');
    expect(output).toContain('END OF TEST DATA');

    // Confirm redacted types were recorded
    expect(redactedTypes.length).toBeGreaterThan(0);
  });

  it('sanitizes nested structured MCP content containing safe.txt payload', () => {
    const candidates = [
      path.resolve(process.cwd(), 'mcp-test-data/safe.txt'),
      path.resolve(__dirname, '../../../mcp-test-data/safe.txt'),
    ];
    const safePath = candidates.find((p) => fs.existsSync(p));
    const safeContent = fs.readFileSync(safePath!, 'utf8');

    const mcpPayload = {
      content: [
        {
          type: 'text',
          text: safeContent,
        },
      ],
      metadata: {
        file: 'safe.txt',
        credentials: {
          database_password: 'FAKE_DB_PASSWORD_ONLY_FOR_TESTING',
          aws_secret_access_key: 'FAKE_SECRET_NOT_VALID_123456789',
          github_token: 'ghp_FAKE_TOKEN_NOT_VALID_123456789',
        },
      },
    };

    const result = redactPayload(mcpPayload);
    expect(result.wasRedacted).toBe(true);

    const serialized = JSON.stringify(result.sanitized);
    const rawCredentials = [
      'FAKE_TARS_KEY_123456789',
      'AKIAFAKE123456789012',
      'FAKE_SECRET_NOT_VALID_123456789',
      'FAKE_DB_PASSWORD_ONLY_FOR_TESTING',
      'ghp_FAKE_TOKEN_NOT_VALID_123456789',
    ];

    for (const cred of rawCredentials) {
      expect(serialized).not.toContain(cred);
    }

    // Ensure non-sensitive metadata is intact
    expect(result.sanitized.metadata.file).toBe('safe.txt');
    expect(result.sanitized.metadata.credentials.database_password).toBe('[REDACTED]');
    expect(result.sanitized.metadata.credentials.aws_secret_access_key).toBe('[REDACTED]');
    expect(result.sanitized.metadata.credentials.github_token).toBe('[REDACTED]');
  });
});
