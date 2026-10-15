import type { GatewayConfig } from '@tars/shared-types';

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  port: 8443,
  host: '127.0.0.1',
  upstreamTransport: 'stdio',
  dbPath: './tars_audit.sqlite',
  policyVersion: '1.0.0',
  enableRedaction: true,
  allowUnknownTools: false,
  enableMlShadowScoring: true,
  mlScoringEndpoint: 'http://127.0.0.1:8000',
};

export function resolveGatewayConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    ...DEFAULT_GATEWAY_CONFIG,
    ...overrides,
  };
}
