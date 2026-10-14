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
} from 'lucide-react'
import type { AuditEvent, SecurityAction } from '../../types'
import { MOCK_SECURITY_EVENTS } from '../../data/mockData'

export const SecurityEventsPage: React.FC<{
  onInspectEvidence?: (event: AuditEvent) => void
}> = ({ onInspectEvidence }) => {
  const [events, setEvents] = useState<AuditEvent[]>(MOCK_SECURITY_EVENTS)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isFromMock, setIsFromMock] = useState(true)
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

  // Pagination (bounded event loading)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const loadEvents = async () => {
    setLoading(true)
    const result = await apiClient.getEvents({
      action: filterAction,
      tool: filterTool !== 'ALL' ? filterTool : undefined,
    })
    setEvents(result.data)
    setIsFromMock(result.isFromMock)
    setApiError(result.error || null)
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()

    const unsubscribe = apiClient.subscribeEventStream(
      (newEvent) => {
        setEvents((prev) => [newEvent, ...prev.slice(0, 99)])
      },
      (status) => {
        setSseState(status)
      }
    )

    return () => unsubscribe()
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
        <h1 className="font-headline text-6xl sm:text-8xl md:text-9xl tracking-tight leading-[0.88] uppercase text-[#1A1614] select-none m-0">
          WHAT GOT<br />BLOCKED.
        </h1>
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-[#1A1614]/70 font-semibold">
          01 // MCP RUNTIME GATEWAY SECURITY TIMELINE & INTERCEPTION STREAM
        </p>
      </section>

      {/* Gateway Connection Banner (Brutalist Notice) */}
      <div
        className={`p-4 border-[1.5px] border-[#1A1614] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono shadow-[4px_4px_0px_#1A1614] ${
          sseState.connected && !isFromMock
            ? 'bg-[#2F6B3F] text-white'
            : isFromMock
            ? 'bg-[#fcf9f2] text-[#1A1614]'
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
            {sseState.connected && !isFromMock ? (
              <span>
                <strong className="font-bold uppercase tracking-wider">GATEWAY STREAM ACTIVE:</strong> Connected to SSE <code>/api/events/stream</code> at {apiClient.getBaseUrl()}
              </span>
            ) : isFromMock ? (
              <span>
                <strong className="font-bold uppercase tracking-wider">DEMONSTRATION RECORD:</strong> Displaying representative security event data ({apiError ? `Gateway offline: ${apiError}` : 'Awaiting live runtime'})
              </span>
            ) : (
              <span>
                <strong className="font-bold uppercase tracking-wider">GATEWAY RECONNECTING:</strong> {sseState.error || 'Connection dropped'} (retry in {sseState.retryIn || 3}s)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] bg-[#1A1614] text-white px-2 py-0.5 border border-[#1A1614] font-bold">
            {sseState.connected ? 'LIVE SSE' : isFromMock ? 'MOCK DATA' : 'OFFLINE'}
          </span>
          <button
            onClick={loadEvents}
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
          trend={sseState.connected ? 'Live Feed' : 'Mock Mode'}
          trendPositive={sseState.connected}
        />
      </div>

      {/* Stitch 4 Minimalist Buttons for Quick Action Filter */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2">
        {(['ALL', 'BLOCK', 'REQUIRE_APPROVAL', 'ALLOW'] as const).map((act) => {
          const isActive = filterAction === act
          const label = act === 'ALL' ? 'ALL' : act === 'BLOCK' ? 'BLOCKED' : act === 'REQUIRE_APPROVAL' ? 'APPROVAL REQ.' : 'ALLOWED'
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
            <span className="text-[10px] text-indigo-400/80 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
              {isFromMock ? 'Demo Dataset' : 'Live Gateway'}
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
              {paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    No security events match the active filters.
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
                          <div className="text-[10px] text-slate-500">{evt.timestamp}</div>
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
                          <button
                            onClick={() => onInspectEvidence && onInspectEvidence(evt)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-slate-400" />
                            Evidence
                          </button>
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
