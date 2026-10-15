import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import type { AuditEvent } from '../../types'
import { formatIST } from '../../utils/formatTime'

export interface ScoredEventItem {
  id: string
  tool: string
  file?: string
  timestamp?: string
  timestampFormatted: string
  riskLabel: 'LOW RISK' | 'MEDIUM RISK' | 'HIGH RISK' | 'UNKNOWN'
  confidenceRaw?: number
  confidenceFormatted: string
  activePercentage: number
  isUnknown: boolean
}

/**
 * Extracts and normalizes the ML shadow prediction from an audit event.
 * Returns null if the event does not contain a real ML shadow prediction.
 */
function extractScoredEvent(event?: AuditEvent | null): ScoredEventItem | null {
  if (!event) return null

  const shadow = event.decisionEvidence?.mlShadow
  if (!shadow) return null

  // Ensure risk label is normalized
  const rawRisk = (shadow.predictedRisk || '').trim().toUpperCase()
  let validLabel: 'LOW RISK' | 'MEDIUM RISK' | 'HIGH RISK' | 'UNKNOWN' = 'UNKNOWN'
  if (rawRisk === 'LOW' || rawRisk === 'LOW RISK') {
    validLabel = 'LOW RISK'
  } else if (rawRisk === 'MEDIUM' || rawRisk === 'MEDIUM RISK') {
    validLabel = 'MEDIUM RISK'
  } else if (rawRisk === 'HIGH' || rawRisk === 'HIGH RISK') {
    validLabel = 'HIGH RISK'
  }

  const conf = typeof shadow.confidence === 'number' && !isNaN(shadow.confidence)
    ? shadow.confidence
    : undefined

  const confFormatted = conf !== undefined ? `${(conf * 100).toFixed(1)}%` : '—'
  const percentage = conf !== undefined ? Math.round(conf * 1000) / 10 : 0

  // Extract file/resource if present in parameters
  let targetFile: string | undefined = undefined
  if (event.parameters && typeof event.parameters === 'object') {
    const p = event.parameters as Record<string, unknown>
    if (typeof p.path === 'string') targetFile = p.path
    else if (typeof p.filePath === 'string') targetFile = p.filePath
    else if (typeof p.file === 'string') targetFile = p.file
    else if (typeof p.command === 'string') targetFile = p.command
    else if (typeof p.query === 'string') targetFile = p.query
  }

  return {
    id: event.id,
    tool: event.tool || 'UNKNOWN',
    file: targetFile,
    timestamp: event.timestamp,
    timestampFormatted: formatIST(event.timestamp),
    riskLabel: validLabel,
    confidenceRaw: conf,
    confidenceFormatted: confFormatted,
    activePercentage: percentage,
    isUnknown: validLabel === 'UNKNOWN' || conf === undefined,
  }
}

export const MLRiskClassificationPage: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const res = await apiClient.getEvents({ limit: 50 })
      setEvents(res.data || [])
      setApiError(res.error || null)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to query audit events')
    } finally {
      setLoading(false)
    }
  }

  // Initial load and periodic polling every 2 seconds for live Hermes calls
  useEffect(() => {
    setLoading(true)
    loadData()

    const intervalId = setInterval(() => {
      loadData()
    }, 2000)

    // Also subscribe to real-time SSE stream if active
    const unsubscribeSse = apiClient.subscribeEventStream(
      (newEvent) => {
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev
          return [newEvent, ...prev.slice(0, 49)]
        })
      },
      () => {}
    )

    return () => {
      clearInterval(intervalId)
      unsubscribeSse()
    }
  }, [])

  // Filter ONLY genuine events that have real ML shadow predictions (no fake/unscored events)
  // Deduplicate by event id
  const seenIds = new Set<string>()
  const scoredEvents: ScoredEventItem[] = []
  for (const evt of events) {
    if (seenIds.has(evt.id)) continue
    seenIds.add(evt.id)
    const scored = extractScoredEvent(evt)
    if (scored) {
      scoredEvents.push(scored)
    }
  }

  const latestScored = scoredEvents.length > 0 ? scoredEvents[0] : null
  const recent3 = scoredEvents.slice(0, 3)

  const getBadgeStyle = (label: string) => {
    switch (label) {
      case 'HIGH RISK':
        return 'bg-[#b91c1c] text-white'
      case 'MEDIUM RISK':
        return 'bg-[#b45309] text-white'
      case 'LOW RISK':
        return 'bg-[#2e7d32] text-white'
      default:
        return 'bg-neutral-600 text-white'
    }
  }

  const getConfidenceTextColor = (label: string) => {
    switch (label) {
      case 'HIGH RISK':
        return 'text-[#b91c1c]'
      case 'MEDIUM RISK':
        return 'text-[#b45309]'
      case 'LOW RISK':
        return 'text-[#2e7d32]'
      default:
        return 'text-neutral-600'
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-[#f4eee5] text-[#121212] selection:bg-[#b8542c] selection:text-white font-mono antialiased">
      {/* Minimal Top Header: Only tiny TARS logo/name on left, tiny ML status indicator on right */}
      <header className="w-full border-b-2 border-[#121212] bg-[#f4eee5] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 bg-[#121212] flex items-center justify-center p-1">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" strokeLinecap="square" strokeLinejoin="miter"></path>
              <path d="M12 8v8m-4-4h8" strokeLinecap="square" strokeLinejoin="miter"></path>
            </svg>
          </div>
          <div className="flex items-center space-x-1.5 leading-none">
            <span className="font-sans font-extrabold text-base uppercase tracking-tight">TARS</span>
            <span className="bg-[#b8542c] text-white text-[9px] font-mono px-1 py-0.5 font-bold uppercase leading-none">MCP</span>
            <span className="text-neutral-500 text-[11px] font-mono ml-2 hidden sm:inline">ML RISK CLASSIFICATION</span>
          </div>
        </div>

        {/* Small ML Service Status Indicator */}
        <div className="flex items-center space-x-2 text-xs font-mono border-2 border-[#121212] bg-[#fffaf4] px-2.5 py-1 shadow-[2px_2px_0px_#121212]">
          <span className={`w-2 h-2 rounded-full ${apiError ? 'bg-[#b91c1c]' : 'bg-[#2e7d32] animate-pulse'}`}></span>
          <span className="text-[11px] font-bold tracking-tight">
            {apiError ? 'ML SERVICE: OFFLINE' : 'ML SERVICE: ONLINE'}
          </span>
        </div>
      </header>

      {/* Main Centered Content Area with Generous Whitespace */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 md:py-16">
        <div className="w-full max-w-2xl flex flex-col space-y-8">
          
          {/* ONE MAIN CLASSIFICATION CARD (~60% content width focus) */}
          <section className="w-full bg-[#fffaf4] border-2 border-[#121212] shadow-[4px_4px_0px_#121212] p-6 md:p-8 flex flex-col">
            {/* Card Header Sub-label & Risk Pill */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#121212] pb-5">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block mb-1">
                  LATEST TOOL CALL
                </span>
                <h1 className="text-2xl md:text-3xl font-mono font-bold text-[#121212] tracking-tight break-all">
                  {latestScored ? latestScored.tool : loading ? 'LOADING...' : 'NO PREDICTIONS AVAILABLE'}
                </h1>
                {latestScored?.file && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">TARGET:</span>
                    <span className="text-[#b8542c] font-bold bg-[#ede5d8] px-1.5 py-0.5 border border-[#121212]">
                      {latestScored.file}
                    </span>
                  </div>
                )}
                {latestScored && (
                  <div className="mt-2 flex items-center gap-1.5 font-mono">
                    <span className="inline-block bg-[#121212] text-white text-[10px] font-medium px-2 py-0.5 border border-[#121212] shadow-[1px_1px_0px_#121212]">
                      {latestScored.timestampFormatted}
                    </span>
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`inline-block ${
                    latestScored ? getBadgeStyle(latestScored.riskLabel) : 'bg-neutral-600 text-white'
                  } text-xs md:text-sm font-mono font-bold px-3 py-1.5 border-2 border-[#121212] shadow-[2px_2px_0px_#121212] uppercase`}
                >
                  {latestScored ? latestScored.riskLabel : 'UNKNOWN'}
                </span>
                <div
                  className={`${
                    latestScored ? getConfidenceTextColor(latestScored.riskLabel) : 'text-neutral-500'
                  } font-mono font-bold text-xs mt-1.5 tracking-tight`}
                >
                  {latestScored && latestScored.confidenceRaw !== undefined
                    ? `${latestScored.confidenceFormatted} CONFIDENCE`
                    : 'CONFIDENCE: —'}
                </div>
              </div>
            </div>

            {/* Simple Horizontal Risk Indicator */}
            <div className="pt-6">
              <div className="flex justify-between items-center text-[10px] font-mono uppercase font-bold mb-2 text-neutral-600">
                <span className="text-[#2e7d32]">LOW (0.0 - 0.3)</span>
                <span className="text-[#b45309]">MEDIUM (0.3 - 0.7)</span>
                <span className="text-[#b91c1c]">HIGH (0.7 - 1.0)</span>
              </div>

              {/* Gauge Track */}
              <div className="w-full h-5 border-2 border-[#121212] bg-[#ede5d8] flex relative overflow-hidden shadow-[inset_1px_1px_0px_#121212]">
                {/* Low Segment (0.0 - 0.3) */}
                <div
                  className={`h-full border-r border-[#121212] flex items-center justify-center text-white text-[9px] font-mono font-bold w-[30%] ${
                    latestScored?.riskLabel === 'LOW RISK' && !latestScored.isUnknown
                      ? 'bg-[#2e7d32]'
                      : 'bg-neutral-300'
                  }`}
                >
                  {latestScored?.riskLabel === 'LOW RISK' && !latestScored.isUnknown && (
                    <span>▲ {latestScored.confidenceFormatted} ACTIVE</span>
                  )}
                </div>

                {/* Medium Segment (0.3 - 0.7) */}
                <div
                  className={`h-full border-r border-[#121212] flex items-center justify-center text-white text-[9px] font-mono font-bold w-[40%] ${
                    latestScored?.riskLabel === 'MEDIUM RISK' && !latestScored.isUnknown
                      ? 'bg-[#b45309]'
                      : 'bg-neutral-300'
                  }`}
                >
                  {latestScored?.riskLabel === 'MEDIUM RISK' && !latestScored.isUnknown && (
                    <span>▲ {latestScored.confidenceFormatted} ACTIVE</span>
                  )}
                </div>

                {/* High Segment (0.7 - 1.0) */}
                <div
                  className={`h-full flex items-center justify-center text-white text-[9px] font-mono font-bold w-[30%] ${
                    latestScored?.riskLabel === 'HIGH RISK' && !latestScored.isUnknown
                      ? 'bg-[#b91c1c]'
                      : 'bg-neutral-300'
                  }`}
                >
                  {latestScored?.riskLabel === 'HIGH RISK' && !latestScored.isUnknown && (
                    <span>▲ {latestScored.confidenceFormatted} ACTIVE</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* RECENT CLASSIFICATIONS (ONLY 3 LATEST ROWS, EXACTLY 3 COLUMNS) */}
          <section className="w-full flex flex-col space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-600">
                RECENT CLASSIFICATIONS
              </span>
              <span className="text-[10px] font-mono text-neutral-500">LATEST 3</span>
            </div>

            <div className="w-full bg-[#fffaf4] border-2 border-[#121212] shadow-[2px_2px_0px_#121212] overflow-hidden">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-[#ede5d8] border-b-2 border-[#121212] text-[10px] uppercase font-bold text-neutral-700 tracking-wider">
                    <th className="py-2.5 px-4 font-bold">TOOL</th>
                    <th className="py-2.5 px-4 font-bold text-center">RISK</th>
                    <th className="py-2.5 px-4 font-bold text-right">CONFIDENCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#121212] font-medium">
                  {recent3.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-5 px-4 text-center text-neutral-500 text-xs">
                        {loading
                          ? 'Checking for ML predictions...'
                          : 'No ML-scored tool classifications recorded yet. Run a tool via Hermes to populate.'}
                      </td>
                    </tr>
                  ) : (
                    recent3.map((item) => (
                      <tr key={item.id} className="hover:bg-[#f4eee5] transition-colors">
                        <td className="py-3 px-4 font-bold text-[#121212]">
                          <div>
                            <span>{item.tool}</span>
                            {item.file && (
                              <span className="ml-2 text-[10px] text-[#b8542c] font-normal">
                                ({item.file})
                              </span>
                            )}
                          </div>
                          <div className="mt-1">
                            <span className="inline-block bg-[#121212] text-white text-[9px] font-normal px-1.5 py-0.5 border border-[#121212]">
                              {item.timestampFormatted}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block ${getBadgeStyle(
                              item.riskLabel
                            )} text-[10px] font-bold px-2 py-0.5 border border-[#121212]`}
                          >
                            {item.riskLabel}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${getConfidenceTextColor(item.riskLabel)}`}>
                          {item.confidenceFormatted}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Non-intrusive advisory banner */}
          <div className="text-[10px] font-mono text-neutral-500 text-center uppercase tracking-wider">
            Advisory ML Shadow Classifier • Does not override deterministic policy engine
          </div>

        </div>
      </main>
    </div>
  )
}
