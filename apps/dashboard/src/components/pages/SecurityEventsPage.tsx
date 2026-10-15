import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { Badge, StatCard } from '../common/CommonUI'
import {
  ShieldCheck,
  ShieldAlert,
  Eye,
  Search,
  Filter,
  AlertCircle,
  RefreshCw,
  Radio,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from 'lucide-react'
import type { AuditEvent, SecurityAction } from '../../types'
import { formatIST } from '../../utils/formatTime'

export const SecurityEventsPage: React.FC<{
  onInspectEvidence?: (event: AuditEvent) => void
}> = ({ onInspectEvidence }) => {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [sseState, setSseState] = useState<{
    connected: boolean
    connecting: boolean
    error?: string
    retryIn?: number
  }>({ connected: false, connecting: false })

  // Filters
  const [filterAction, setFilterAction] = useState<string>('ALL')
  const [filterTool, setFilterTool] = useState<string>('ALL')
  const [filterServer, setFilterServer] = useState<string>('ALL')
  const [filterReason, setFilterReason] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  // Expanded row detail
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Approval action in-flight and status feedback
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [approvalFeedback, setApprovalFeedback] = useState<{ id: string; success: boolean; message: string } | null>(null)

  // Pagination (bounded event loading)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const handleApprovalAction = async (evt: AuditEvent, decision: 'APPROVE' | 'REJECT') => {
    setActionLoadingId(evt.id)
    setApprovalFeedback(null)
    try {
      const res = await apiClient.submitApprovalDecision(
        evt.requestId,
        decision,
        'dashboard-admin',
        decision === 'APPROVE' ? 'Approved via TARS Security Console' : 'Rejected via TARS Security Console'
      )

      if (res.error) {
        setApprovalFeedback({
          id: evt.id,
          success: false,
          message: res.error,
        })
      } else {
        setApprovalFeedback({
          id: evt.id,
          success: true,
          message: res.data?.message || (decision === 'APPROVE' ? 'Operation approved & executed' : 'Operation rejected'),
        })
        // Immediately reload events to update UI with latest state from gateway
        await loadEvents()
      }
    } catch (err: any) {
      setApprovalFeedback({
        id: evt.id,
        success: false,
        message: err.message || 'Failed to submit approval decision',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const loadEvents = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const result = await apiClient.getEvents({
        action: filterAction,
        tool: filterTool !== 'ALL' ? filterTool : undefined,
      })
      if (result.data) {
        setEvents((prev) => {
          // Merge newly fetched events with prev to avoid duplicates and ensure immediate update
          const merged = [...result.data]
          const existingIds = new Set(result.data.map((e) => e.id))
          for (const item of prev) {
            if (!existingIds.has(item.id)) {
              merged.push(item)
            }
          }
          // Sort chronologically descending
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          return merged
        })
        setApiError(null)
      } else if (result.error) {
        setApiError(result.error)
      }
    } catch (err) {
      if (!isBackground) {
        setEvents([])
      }
      setApiError(err instanceof Error ? err.message : 'Failed to query gateway events')
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    // Initial fetch with spinner
    loadEvents(false)

    // Poll every 2000ms seamlessly in background
    const intervalId = setInterval(() => {
      loadEvents(true)
    }, 2000)

    // Real-time SSE stream listener for instantaneous (<100ms) event push
    const unsubscribe = apiClient.subscribeEventStream(
      (newEvent) => {
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev
          return [newEvent, ...prev]
        })
      },
      (status) => {
        setSseState(status)
      }
    )

    return () => {
      clearInterval(intervalId)
      unsubscribe()
    }
  }, [filterAction, filterTool])

  // Extract unique filter choices
  const uniqueTools = Array.from(new Set(events.map((e) => e.tool))).filter(Boolean)
  const uniqueServers = Array.from(new Set(events.map((e) => e.serverId))).filter(Boolean)
  const uniqueReasons = Array.from(new Set(events.map((e) => e.reasonCode))).filter(Boolean)

  const filteredEvents = events.filter((evt) => {
    const matchesAction = filterAction === 'ALL' || evt.action === filterAction
    const matchesTool = filterTool === 'ALL' || evt.tool === filterTool
    const matchesServer = filterServer === 'ALL' || evt.serverId === filterServer
    const matchesReason = filterReason === 'ALL' || evt.reasonCode === filterReason
    const matchesSearch =
      evt.tool.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (evt.clientIdentity && evt.clientIdentity.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (evt.serverId && evt.serverId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      evt.reasonCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (evt.decisionEvidence?.notes && evt.decisionEvidence.notes.toLowerCase().includes(searchTerm.toLowerCase()))

    return matchesAction && matchesTool && matchesServer && matchesReason && matchesSearch
  })

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize))
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const approvalCount = events.filter((e) => e.action === 'REQUIRE_APPROVAL').length
  const blockedCount = events.filter((e) => e.action === 'BLOCK').length

  const toggleRowExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-8 font-body">
      {/* Giant Condensed Left-Aligned Headline matching Stitch UI */}
      <section className="border-b-[1.5px] border-[#1A1614] pb-6">
        <h1 className="font-headline text-2xl sm:text-3xl md:text-4xl tracking-tight leading-tight uppercase text-[#1A1614] select-none m-0">
          <span className="typewriter-line typewriter-line-1">WHAT GOT</span>
          <br />
          <span className="typewriter-line typewriter-line-2">BLOCKED.</span>
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[#1A1614]/70 font-semibold animate-hero-text [animation-delay:1.4s]">
          01 // MCP RUNTIME GATEWAY SECURITY TIMELINE & INTERCEPTION STREAM
        </p>
      </section>

      {/* Gateway Connection Banner (Brutalist Notice) */}
      <div
        className={`p-4 border-[1.5px] border-[#1A1614] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono shadow-[4px_4px_0px_#1A1614] ${
          sseState.connected
            ? 'bg-[#2F6B3F] text-white'
            : apiError
            ? 'bg-[#B3261E] text-white'
            : 'bg-[#C99A1F] text-[#1A1614]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-none shrink-0 ${
              sseState.connected
                ? 'bg-white animate-pulse'
                : sseState.connecting
                ? 'bg-[#B3261E] animate-ping'
                : 'bg-[#1A1614]'
            }`}
          />
          <div>
            {sseState.connected ? (
              <span>
                <strong className="font-bold uppercase tracking-wider">GATEWAY STREAM ACTIVE:</strong> Connected to SSE <code>/api/events/stream</code> at {apiClient.getBaseUrl()}
              </span>
            ) : apiError ? (
              <span>
                <strong className="font-bold uppercase tracking-wider">GATEWAY API ERROR:</strong> {apiError} (Ensure gateway is listening at {apiClient.getBaseUrl()})
              </span>
            ) : sseState.connecting ? (
              <span>
                <strong className="font-bold uppercase tracking-wider">CONNECTING TO GATEWAY:</strong> Establishing SSE stream at {apiClient.getBaseUrl()}...
              </span>
            ) : (
              <span>
                <strong className="font-bold uppercase tracking-wider">GATEWAY DISCONNECTED:</strong> {sseState.error || 'Connection dropped'} (retry in {sseState.retryIn || 3}s)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] bg-[#1A1614] text-white px-2 py-0.5 border border-[#1A1614] font-bold">
            {sseState.connected ? 'LIVE SSE' : apiError ? 'API ERROR' : sseState.connecting ? 'CONNECTING' : 'OFFLINE'}
          </span>
          <button
            onClick={() => loadEvents(false)}
            disabled={loading}
            className="p-1.5 bg-[#f4f1ea] text-[#1A1614] hover:bg-[#1A1614] hover:text-white border border-[#1A1614] transition-colors cursor-pointer"
            title="Refresh events from API"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top summary stats in brutalist cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Intercepted Calls"
          value={events.length}
          subtitle="Audit event records"
          icon={<ShieldCheck className="w-5 h-5" />}
        />
        <StatCard
          title="Blocked Exploits"
          value={blockedCount}
          subtitle="Deterministic policy blocks"
          icon={<ShieldAlert className="w-5 h-5 text-[#B3261E]" />}
          trend="Enforced"
          trendPositive={true}
        />
        <StatCard
          title="Approval Required"
          value={approvalCount}
          subtitle="Human-in-the-loop gates"
          icon={<AlertCircle className="w-5 h-5 text-[#C99A1F]" />}
          trend={approvalCount > 0 ? 'Action Queue' : 'Zero Pending'}
          trendPositive={approvalCount === 0}
        />
        <StatCard
          title="Stream State"
          value={sseState.connected ? 'Active' : sseState.connecting ? 'Connecting' : 'Standby'}
          subtitle="SSE /api/events/stream"
          icon={<Radio className={`w-5 h-5 ${sseState.connected ? 'text-[#2F6B3F] animate-pulse' : 'text-[#1A1614]'}`} />}
          trend={sseState.connected ? 'Live Feed' : 'Offline'}
          trendPositive={sseState.connected}
        />
      </div>

      {/* Stitch 4 Minimalist Buttons for Quick Action Filter */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2">
        {(['ALL', 'BLOCK', 'REQUIRE_APPROVAL', 'ALLOW'] as const).map((act) => {
          const isActive = filterAction === act
          const label = act === 'ALL' ? 'ALL' : act === 'BLOCK' ? 'BLOCKED' : act === 'REQUIRE_APPROVAL' ? 'REQUIRE APPROVAL' : 'ALLOWED'
          return (
            <button
              key={act}
              type="button"
              onClick={() => {
                setFilterAction(act)
                setCurrentPage(1)
              }}
              className={`px-5 py-2 text-xs font-mono font-bold tracking-widest uppercase border-[1.5px] border-[#1A1614] transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1A1614] text-[#fcf9f2] shadow-[3px_3px_0px_#BF6B45]'
                  : 'bg-[#fcf9f2] text-[#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2]'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Timeline Filters & Control Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search tool, client, server, or notes..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Action filter */}
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Action:</span>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Actions</option>
                <option value="ALLOW">ALLOW</option>
                <option value="BLOCK">BLOCK</option>
                <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
              </select>
            </div>

            {/* Tool filter */}
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span className="text-slate-500">Tool:</span>
              <select
                value={filterTool}
                onChange={(e) => {
                  setFilterTool(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Tools</option>
                {uniqueTools.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Server filter */}
            {uniqueServers.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <span className="text-slate-500">Server:</span>
                <select
                  value={filterServer}
                  onChange={(e) => {
                    setFilterServer(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Servers</option>
                  {uniqueServers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reason code filter */}
            {uniqueReasons.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <span className="text-slate-500">Reason:</span>
                <select
                  value={filterReason}
                  onChange={(e) => {
                    setFilterReason(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Reasons</option>
                  {uniqueReasons.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Events timeline table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Security Event Timeline</h2>
            <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {sseState.connected ? 'Live Stream' : 'Gateway Storage'}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Showing {filteredEvents.length} events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800/80 font-medium">
              <tr>
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-4">Time / Event ID</th>
                <th className="py-3 px-4">Client Identity</th>
                <th className="py-3 px-4">Server / Tool</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Execution</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4">Reason Code / Note</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-[#BF6B45]" />
                    Loading security events from gateway...
                  </td>
                </tr>
              ) : apiError && events.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-rose-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
                    Failed to query events from gateway: {apiError}
                  </td>
                </tr>
              ) : paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    {events.length === 0
                      ? 'No security events recorded yet in gateway audit storage. Inbound MCP tool calls intercepted by TARS will appear here in real time.'
                      : 'No security events match the active filters.'}
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((evt: AuditEvent) => {
                  const isExpanded = expandedRowId === evt.id
                  return (
                    <React.Fragment key={evt.id}>
                      <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => toggleRowExpand(evt.id)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="font-semibold text-slate-200">{evt.id}</div>
                          <div className="text-[10px] text-white font-medium">{formatIST(evt.timestamp)}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {evt.clientIdentity || 'anonymous-client'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono font-medium text-indigo-300">{evt.tool}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {evt.serverId || 'local-mcp'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge type={evt.action as SecurityAction} />
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              evt.executionStatus === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-400'
                                : evt.executionStatus === 'BLOCKED'
                                ? 'bg-rose-950 text-rose-400'
                                : evt.executionStatus === 'PENDING'
                                ? 'bg-amber-950 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {evt.executionStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {evt.latencyMs !== undefined ? `${evt.latencyMs} ms` : '—'}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-mono text-[10px] text-indigo-400 mb-0.5">
                            {evt.reasonCode}
                          </div>
                          <div className="truncate text-slate-400 text-xs">
                            {evt.decisionEvidence?.notes || 'Deterministic policy decision'}
                          </div>
                          {evt.redacted && (
                            <span className="text-[10px] text-amber-400/90 font-mono">
                              Secrets Redacted
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {evt.action === 'REQUIRE_APPROVAL' && evt.executionStatus === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === evt.id}
                                  onClick={() => handleApprovalAction(evt, 'APPROVE')}
                                  title="Approve mutation and execute once against upstream MCP"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-[11px] font-semibold transition cursor-pointer shadow-sm"
                                >
                                  {actionLoadingId === evt.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === evt.id}
                                  onClick={() => handleApprovalAction(evt, 'REJECT')}
                                  title="Deny mutation without execution"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-mono text-[11px] font-semibold transition cursor-pointer shadow-sm"
                                >
                                  {actionLoadingId === evt.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => onInspectEvidence && onInspectEvidence(evt)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition cursor-pointer"
                            >
                              <Eye className="w-3 h-3 text-slate-400" />
                              Evidence
                            </button>
                          </div>
                          {approvalFeedback && approvalFeedback.id === evt.id && (
                            <div
                              className={`mt-1 font-mono text-[10px] text-right ${
                                approvalFeedback.success ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {approvalFeedback.message}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expandable detailed drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-950/60 border-b border-slate-800/80">
                          <td colSpan={9} className="p-4 pl-12 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-mono text-slate-500">
                                  Policy Version / Contract
                                </span>
                                <div className="font-mono text-slate-300">
                                  Policy: v{evt.policyVersion || '1.0.0'}
                                </div>
                                <div className="font-mono text-slate-400">
                                  Contract: v{evt.contractVersion || '1.0.0'}
                                </div>
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <span className="text-[10px] uppercase font-mono text-slate-500">
                                  Evaluated Checks
                                </span>
                                <div className="flex flex-wrap gap-1.5 mt-0.5">
                                  {(evt.decisionEvidence?.evaluatedChecks || ['Standard Security Policy']).map(
                                    (chk, idx) => (
                                      <span
                                        key={idx}
                                        className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[11px] font-mono text-slate-300"
                                      >
                                        {chk}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>

                              {evt.parameters && (
                                <div className="md:col-span-3">
                                  <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
                                    Intercepted Tool Parameters (Sanitized)
                                  </span>
                                  <pre className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                                    {JSON.stringify(evt.parameters, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bounded pagination controls */}
        {filteredEvents.length > pageSize && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
