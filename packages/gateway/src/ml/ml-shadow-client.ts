import type { MlShadowPrediction } from '@tars/shared-types';
import type { MlScoringFeatures } from './feature-extractor.js';

export interface IMlShadowClient {
  predict(features: MlScoringFeatures): Promise<MlShadowPrediction>;
  checkHealth(): Promise<{ healthy: boolean; details?: unknown }>;
}

export interface MlShadowClientOptions {
  /** Base URL of the Python ML scoring service (defaults to http://127.0.0.1:8000) */
  endpoint?: string;

  /** Maximum wait duration in milliseconds before timing out (defaults to 500ms) */
  timeoutMs?: number;

  /** Injectable fetch function for automated testing and isolation */
  fetchFn?: typeof fetch;
}

/**
 * Isolated HTTP client communicating with the local Python ML risk classifier in shadow mode.
 * - Enforces short request timeout to prevent blocking tool execution.
 * - Strictly validates responses.
 * - Safely absorbs all connection, timeout, and HTTP errors without throwing.
 */
export class MlShadowClient implements IMlShadowClient {
  private endpoint: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(options: MlShadowClientOptions = {}) {
    this.endpoint = (options.endpoint || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 500;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  public async predict(features: MlScoringFeatures): Promise<MlShadowPrediction> {
    const startTime = performance.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchFn(`${this.endpoint}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(features),
        signal: controller.signal,
      });

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (!res.ok) {
        return {
          predictedRisk: 'UNKNOWN',
          model: 'risk_classifier',
          mode: 'shadow',
          success: false,
          latencyMs,
          error: `ML service returned HTTP ${res.status}`,
        };
      }

      const json = (await res.json()) as any;
      if (!json || typeof json.risk !== 'string') {
        return {
          predictedRisk: 'UNKNOWN',
          model: 'risk_classifier',
          mode: 'shadow',
          success: false,
          latencyMs,
          error: 'Malformed response structure from ML service',
        };
      }

      const rawRisk = json.risk.trim().toUpperCase();
      const validLabels = ['LOW', 'MEDIUM', 'HIGH'];
      const predictedRisk = validLabels.includes(rawRisk) ? rawRisk : 'UNKNOWN';

      return {
        predictedRisk,
        confidence: typeof json.confidence === 'number' ? json.confidence : undefined,
        classProbabilities:
          typeof json.class_probabilities === 'object' && json.class_probabilities !== null
            ? json.class_probabilities
            : undefined,
        model: 'risk_classifier',
        mode: 'shadow',
        success: true,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
      const isTimeout =
        (err instanceof Error && err.name === 'AbortError') ||
        (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'TimeoutError');

      const errorMsg = isTimeout
        ? `ML scoring request timed out after ${this.timeoutMs}ms`
        : err instanceof Error
        ? err.message
        : String(err);

      return {
        predictedRisk: 'UNKNOWN',
        model: 'risk_classifier',
        mode: 'shadow',
        success: false,
        latencyMs,
        error: errorMsg,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async checkHealth(): Promise<{ healthy: boolean; details?: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await this.fetchFn(`${this.endpoint}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        return { healthy: false, details: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return { healthy: true, details: data };
    } catch (err: unknown) {
      return {
        healthy: false,
        details: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
