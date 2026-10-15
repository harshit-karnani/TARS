import type {
  ApiResponse,
  PaginatedResponse,
  AuditEvent,
  ToolContract,
  ContractDriftResult,
  ReplayRunSummary,
} from '../types'

export interface ApiFetchResult<T> {
  data: T
  isFromMock: boolean
  error?: string
  rawEnvelope?: ApiResponse<T>
}

/**
 * TARS Gateway API Client
 *
 * Implements genuine live fetch calls against:
 *   - GET /api/events
 *   - GET /api/contracts
 *   - GET /api/contracts/:serverId/:toolName/drift
 *   - GET /api/replay/runs
 *   - POST /api/replay/run
 *   - SSE GET /api/events/stream
 *
 * Environment-configurable API base URL (VITE_API_URL or relative proxy).
 * Never silently falls back to mock data or invents fake results on API failure.
 */
export class TarsApiClient {
  private baseUrl: string
  public mockModeEnabled = false

  constructor(baseUrl?: string) {
    const envBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    this.baseUrl = (baseUrl ?? envBase ?? '').replace(/\/$/, '')
  }

  public getBaseUrl(): string {
    return this.baseUrl || '(origin / relative proxy)'
  }

  private async fetchEnvelope<T>(
    path: string,
    options?: RequestInit
  ): Promise<ApiFetchResult<T>> {
    const url = `${this.baseUrl}${path}`
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3500)

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

      throw new Error(json?.error?.message || 'Invalid ApiResponse envelope structure')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error connecting to TARS Gateway'
      return {
        data: null as unknown as T,
        isFromMock: false,
        error: errorMessage,
        rawEnvelope: {
          success: false,
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
    params.set('limit', String(query?.limit || 100))
    if (query?.offset !== undefined) params.set('offset', String(query.offset))

    const queryString = params.toString() ? `?${params.toString()}` : ''
    const url = `${this.baseUrl}/api/events${queryString}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3500)

      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error(`Gateway returned HTTP ${res.status}: ${res.statusText}`)

      const json = await res.json()
      if (json.success && json.data) {
        if (Array.isArray(json.data)) {
          return { data: json.data as AuditEvent[], isFromMock: false, rawEnvelope: json }
        } else if (json.data.items && Array.isArray(json.data.items)) {
          const paginated = json.data as PaginatedResponse<AuditEvent>
          return { data: paginated.items, isFromMock: false, rawEnvelope: json }
        }
      }
      throw new Error(json.error?.message || 'Invalid envelope format')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Gateway unavailable'
      return {
        data: [],
        isFromMock: false,
        error: errorMessage,
      }
    }
  }

  /**
   * GET /api/contracts
   */
  async getContracts(): Promise<ApiFetchResult<ToolContract[]>> {
    const res = await this.fetchEnvelope<ToolContract[]>('/api/contracts')
    if (res.error || !res.data) {
      return {
        data: [],
        isFromMock: false,
        error: res.error || 'Failed to load contracts',
        rawEnvelope: res.rawEnvelope,
      }
    }
    return res
  }

  /**
   * GET /api/contracts/:serverId/:toolName/drift
   */
  async getContractDrift(
    serverId: string,
    toolName: string
  ): Promise<ApiFetchResult<ContractDriftResult>> {
    return this.fetchEnvelope<ContractDriftResult>(
      `/api/contracts/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/drift`
    )
  }

  /**
   * GET /api/replay/runs
   */
  async getReplayRuns(): Promise<ApiFetchResult<ReplayRunSummary | null>> {
    const res = await this.fetchEnvelope<ReplayRunSummary | ReplayRunSummary[]>('/api/replay/runs')
    if (res.error || !res.data) {
      return {
        data: null,
        isFromMock: false,
        error: res.error,
        rawEnvelope: res.rawEnvelope as ApiResponse<ReplayRunSummary | null> | undefined,
      }
    }

    if (Array.isArray(res.data)) {
      const summary = res.data.length > 0 ? res.data[0] : null
      return {
        data: summary,
        isFromMock: false,
        error: res.error,
        rawEnvelope: res.rawEnvelope as ApiResponse<ReplayRunSummary | null> | undefined,
      }
    }

    return res as ApiFetchResult<ReplayRunSummary>
  }

  /**
   * POST /api/replay/run
   */
  async runReplaySuite(): Promise<ApiFetchResult<ReplayRunSummary>> {
    return this.fetchEnvelope<ReplayRunSummary>('/api/replay/run', {
      method: 'POST',
    })
  }

  /**
   * GET /api/approvals/pending
   * Returns list of currently active pending approvals waiting for human authorization
   */
  async getPendingApprovals(): Promise<ApiFetchResult<any[]>> {
    const res = await this.fetchEnvelope<any[]>('/api/approvals/pending')
    if (res.error || !res.data) {
      return {
        data: [],
        isFromMock: false,
        error: res.error,
        rawEnvelope: res.rawEnvelope,
      }
    }
    return res
  }

  /**
   * POST /api/approvals/decision
   * Authenticated approval / rejection of a pending tool mutation
   */
  async submitApprovalDecision(
    requestId: string,
    decision: 'APPROVE' | 'REJECT',
    approver: string = 'dashboard-admin',
    reason?: string
  ): Promise<ApiFetchResult<any>> {
    const token = typeof import.meta !== 'undefined' && import.meta.env?.VITE_APPROVAL_TOKEN
      ? import.meta.env.VITE_APPROVAL_TOKEN
      : 'tars-admin-token'

    return this.fetchEnvelope<any>('/api/approvals/decision', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requestId,
        decision,
        approver,
        reason,
      }),
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
