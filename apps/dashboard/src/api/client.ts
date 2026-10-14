import type {
  ApiResponse,
  PaginatedResponse,
  AuditEvent,
  ToolContract,
  ContractDriftResult,
  ReplayRunSummary,
} from '../types'
import {
  MOCK_SECURITY_EVENTS,
  MOCK_TOOL_CONTRACTS,
  MOCK_DRIFT_RESULTS,
  MOCK_REPLAY_SUMMARY,
} from '../data/mockData'

export interface ApiFetchResult<T> {
  data: T
  isFromMock: boolean
  error?: string
  rawEnvelope?: ApiResponse<T>
}

/**
 * TARS Gateway API Client
 *
 * Implements real fetch calls against:
 *   - GET /api/events
 *   - GET /api/contracts
 *   - GET /api/contracts/:serverId/:toolName/drift
 *   - GET /api/replay/runs
 *   - POST /api/replay/run
 *   - SSE GET /api/events/stream
 *
 * Environment-configurable API base URL (VITE_API_URL or defaults to empty string for reverse proxy).
 * Clearly preserves real API error states and distinguishes live data from explicit demo mock fallback.
 */
export class TarsApiClient {
  private baseUrl: string
  public mockModeEnabled = true // explicit toggle for demo mode

  constructor(baseUrl?: string) {
    // Configurable via Vite environment variable VITE_API_URL, or window global, or relative proxy
    const envBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    this.baseUrl = (baseUrl ?? envBase ?? '').replace(/\/$/, '')
  }

  public getBaseUrl(): string {
    return this.baseUrl || '(origin / relative proxy)'
  }

  private async fetchEnvelope<T>(
    path: string,
    mockFallback: T,
    options?: RequestInit
  ): Promise<ApiFetchResult<T>> {
    const url = `${this.baseUrl}${path}`
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2500)

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        throw new Error(`Gateway returned HTTP ${res.status}: ${res.statusText}`)
      }

      const json: ApiResponse<T> = await res.json()
      if (json && json.success && json.data !== undefined) {
        return {
          data: json.data,
          isFromMock: false,
          rawEnvelope: json,
        }
      }

      throw new Error(json?.error?.message || 'Invalid ApiResponse envelope')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      // Visible demo fallback: return mock data, but clearly declare isFromMock=true and pass error message
      return {
        data: mockFallback,
        isFromMock: true,
        error: errorMessage,
        rawEnvelope: {
          success: false,
          data: mockFallback,
          error: {
            code: 'GATEWAY_UNAVAILABLE',
            message: errorMessage,
          },
          timestamp: new Date().toISOString(),
        },
      }
    }
  }

  /**
   * GET /api/events
   * Supports paginated response unwrapping and query filters
   */
  async getEvents(query?: {
    tool?: string
    action?: string
    limit?: number
    offset?: number
  }): Promise<ApiFetchResult<AuditEvent[]>> {
    const params = new URLSearchParams()
    if (query?.tool) params.set('tool', query.tool)
    if (query?.action && query.action !== 'ALL') params.set('action', query.action)
    if (query?.limit) params.set('limit', String(query.limit))
    if (query?.offset) params.set('offset', String(query.offset))

    const queryString = params.toString() ? `?${params.toString()}` : ''
    const url = `${this.baseUrl}/api/events${queryString}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2500)

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = await res.json()
      // Support either raw array data or PaginatedResponse<AuditEvent>
      if (json.success && json.data) {
        if (Array.isArray(json.data)) {
          return { data: json.data as AuditEvent[], isFromMock: false, rawEnvelope: json }
        } else if (json.data.items && Array.isArray(json.data.items)) {
          const paginated = json.data as PaginatedResponse<AuditEvent>
          return { data: paginated.items, isFromMock: false, rawEnvelope: json }
        }
      }
      throw new Error(json.error?.message || 'Invalid envelope')
    } catch (err) {
      return {
        data: MOCK_SECURITY_EVENTS,
        isFromMock: true,
        error: err instanceof Error ? err.message : 'Gateway unavailable',
      }
    }
  }

  /**
   * GET /api/contracts
   */
  async getContracts(): Promise<ApiFetchResult<ToolContract[]>> {
    return this.fetchEnvelope<ToolContract[]>('/api/contracts', MOCK_TOOL_CONTRACTS)
  }

  /**
   * GET /api/contracts/:serverId/:toolName/drift
   */
  async getContractDrift(
    serverId: string,
    toolName: string
  ): Promise<ApiFetchResult<ContractDriftResult>> {
    const fallbackKey = `${serverId}:${toolName}`
    const fallback: ContractDriftResult = MOCK_DRIFT_RESULTS[fallbackKey] || {
      serverId,
      toolName,
      contractVersion: '1.0.0',
      hasDrift: false,
      expectedHash: 'sha256:unknown...',
      actualHash: 'sha256:unknown...',
      detectedAt: new Date().toISOString(),
      schemaDifferences: [],
    }

    return this.fetchEnvelope<ContractDriftResult>(
      `/api/contracts/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/drift`,
      fallback
    )
  }

  /**
   * GET /api/replay/runs
   */
  async getReplayRuns(): Promise<ApiFetchResult<ReplayRunSummary>> {
    const res = await this.fetchEnvelope<ReplayRunSummary | ReplayRunSummary[]>(
      '/api/replay/runs',
      MOCK_REPLAY_SUMMARY
    )
    if (Array.isArray(res.data)) {
      const summary = res.data[0] || MOCK_REPLAY_SUMMARY
      return {
        data: summary,
        isFromMock: res.isFromMock,
        error: res.error,
        rawEnvelope: res.rawEnvelope
          ? {
              ...res.rawEnvelope,
              data: summary,
            }
          : undefined,
      }
    }
    return res as ApiFetchResult<ReplayRunSummary>
  }

  /**
   * POST /api/replay/run
   */
  async runReplaySuite(): Promise<ApiFetchResult<ReplayRunSummary>> {
    const mockNewRun: ReplayRunSummary = {
      ...MOCK_REPLAY_SUMMARY,
      runId: `run-sim-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
    }

    return this.fetchEnvelope<ReplayRunSummary>('/api/replay/run', mockNewRun, {
      method: 'POST',
    })
  }

  /**
   * SSE GET /api/events/stream
   * Auto-reconnecting Server-Sent Events stream with cleanup and status feedback
   */
  subscribeEventStream(
    onEvent: (event: AuditEvent) => void,
    onStatusChange?: (status: {
      connected: boolean
      connecting: boolean
      error?: string
      retryIn?: number
    }) => void
  ): () => void {
    const url = `${this.baseUrl}/api/events/stream`
    let eventSource: EventSource | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let retrySeconds = 3
    let isTerminated = false

    const connect = () => {
      if (isTerminated) return

      if (onStatusChange) {
        onStatusChange({ connected: false, connecting: true })
      }

      try {
        eventSource = new EventSource(url)

        eventSource.onopen = () => {
          retrySeconds = 3
          if (onStatusChange) {
            onStatusChange({ connected: true, connecting: false })
          }
        }

        eventSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data)
            if (parsed && typeof parsed === 'object') {
              onEvent(parsed as AuditEvent)
            }
          } catch {
            // ignore non-json ping comments
          }
        }

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close()
            eventSource = null
          }

          if (onStatusChange) {
            onStatusChange({
              connected: false,
              connecting: false,
              error: 'Disconnected from gateway stream',
              retryIn: retrySeconds,
            })
          }

          if (!isTerminated) {
            reconnectTimeout = setTimeout(() => {
              retrySeconds = Math.min(retrySeconds * 1.5, 15)
              connect()
            }, retrySeconds * 1000)
          }
        }
      } catch (err) {
        if (onStatusChange) {
          onStatusChange({
            connected: false,
            connecting: false,
            error: err instanceof Error ? err.message : 'SSE initialization error',
          })
        }
      }
    }

    connect()

    return () => {
      isTerminated = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    }
  }
}

export const apiClient = new TarsApiClient()
