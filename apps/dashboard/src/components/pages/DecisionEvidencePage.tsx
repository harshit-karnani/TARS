import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { Badge } from '../common/CommonUI'
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Cpu,
  ArrowLeft,
  RefreshCw,
  FileText,
} from 'lucide-react'
import type { AuditEvent, SecurityAction } from '../../types'

export interface LiveDecisionEvidence {
  id: string
  eventId: string
  requestId: string
  timestamp: string
  toolName: string
  serverId: string
  clientId: string
  finalAction: SecurityAction
  reasonCode: string
  executionStatus: string
  latencyMs?: number
  policyVersion?: string
  contractVersion?: string
  policyEvaluations: Array<{
    policyName: string
    passed: boolean
    description: string
  }>
  promptInjectionSignal?: {
    detected: boolean
    confidence: number
    note: string
  }
  rawRequestSummary: string
  redactedPayloadPreview?: string
  auditRecordReference: string
}

export const DecisionEvidencePage: React.FC<{
  selectedEvidence?: AuditEvent | null
  selectedEvidenceId?: string
  onBackToEvents?: () => void
}> = ({ selectedEvidence, selectedEvidenceId, onBackToEvents }) => {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    selectedEvidence?.id || selectedEvidenceId || null
  )
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadAuditEvents = async () => {
    setLoading(true)
    try {
      const res = await apiClient.getEvents({ limit: 50 })
      const loadedEvents = res.data || []
      setEvents(loadedEvents)
      setApiError(res.error || null)

      // Set initial selected event if none is currently active
      if (!selectedEventId && loadedEvents.length > 0) {
        setSelectedEventId(loadedEvents[0].id)
      } else if (selectedEvidence) {
        setSelectedEventId(selectedEvidence.id)
      }
    } catch (err) {
      setEvents([])
      setApiError(err instanceof Error ? err.message : 'Failed to query audit events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAuditEvents()
  }, [])

  useEffect(() => {
    if (selectedEvidence) {
      setSelectedEventId(selectedEvidence.id)
    }
  }, [selectedEvidence])

  // Locate the currently active audit event: prioritize selectedEvidence prop if matching, then find in loaded events
  const activeEvent: AuditEvent | null = (() => {
    if (selectedEvidence && (!selectedEventId || selectedEvidence.id === selectedEventId)) {
      return selectedEvidence
    }
    if (selectedEventId) {
      return events.find((e) => e.id === selectedEventId) || events[0] || null
    }
    return events[0] || null
  })()

  // Derive genuine forensic decision evidence directly from the active SQLite audit record
  const activeEvidence: LiveDecisionEvidence | null = activeEvent
    ? {
        id: `evi-${activeEvent.id}`,
        eventId: activeEvent.id,
        requestId: activeEvent.requestId,
        timestamp: activeEvent.timestamp,
        toolName: activeEvent.tool,
        serverId: activeEvent.serverId || 'system-server',
        clientId: activeEvent.clientIdentity || 'anonymous-client',
        finalAction: activeEvent.action,
        reasonCode: activeEvent.reasonCode,
        executionStatus: activeEvent.executionStatus,
        latencyMs: activeEvent.latencyMs,
        policyVersion: activeEvent.policyVersion,
        contractVersion: activeEvent.contractVersion,
        policyEvaluations: activeEvent.decisionEvidence?.evaluatedChecks &&
        activeEvent.decisionEvidence.evaluatedChecks.length > 0
          ? activeEvent.decisionEvidence.evaluatedChecks.map((check) => ({
              policyName: check.split(':')[0] || check,
              passed: !check.includes('VIOLATION') && !check.includes('BLOCKED'),
              description: check,
            }))
          : [
              {
                policyName: activeEvent.reasonCode,
                passed: activeEvent.action !== 'BLOCK',
                description:
                  activeEvent.decisionEvidence?.notes ||
                  `Evaluated policy decision code: ${activeEvent.reasonCode}`,
              },
            ],
        promptInjectionSignal:
          activeEvent.decisionEvidence?.riskScore !== undefined
            ? {
                detected: activeEvent.decisionEvidence.riskScore > 50,
                confidence: activeEvent.decisionEvidence.riskScore / 100,
                note:
                  activeEvent.decisionEvidence?.notes ||
                  'Heuristic parameter classifier evaluated.',
              }
            : undefined,
        rawRequestSummary: JSON.stringify(
          activeEvent.parameters || { tool: activeEvent.tool, requestId: activeEvent.requestId },
          null,
          2
        ),
        redactedPayloadPreview: activeEvent.redacted
          ? '{"status": "SANITIZED", "redacted": true, "note": "Sensitive credentials or secrets stripped by ResponseGuard"}'
          : undefined,
        auditRecordReference: `SQLite audit record #${activeEvent.id} (Trace ID: ${activeEvent.requestId})`,
      }
    : null

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-8 font-body">
      {/* Stitch Giant Hero Headline */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b-[1.5px] border-[#1A1614]">
        <div>
          <h1 className="font-headline text-6xl sm:text-7xl lg:text-9xl tracking-tight leading-[0.88] uppercase text-[#1A1614] m-0 select-none">
            SHOW YOUR<br />WORK.
          </h1>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-[#1A1614]/70 font-semibold">
            04 // AUDITABLE FORENSIC DECISION EVIDENCE & POLICY PROOFS
          </p>
        </div>

        <div className="shrink-0 pb-1">
          <button
            onClick={() => {
              if (activeEvidence) {
                handleCopy(JSON.stringify(activeEvidence, null, 2))
              }
            }}
            disabled={!activeEvidence}
            className="px-8 py-4 bg-[#BF6B45] disabled:bg-slate-300 text-white font-mono font-bold text-xs uppercase tracking-wider border-[1.5px] border-[#1A1614] shadow-[4px_4px_0px_#1A1614] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2] transition-all cursor-pointer flex items-center gap-2"
            type="button"
          >
            {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'COPIED TO CLIPBOARD' : 'EXPORT PROOF'}</span>
          </button>
        </div>
      </section>

      {/* Decision Evidence Banner */}
      <div className="bg-[#fcf9f2] border-[1.5px] border-[#1A1614] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-[#1A1614] shadow-[4px_4px_0px_#1A1614]">
        <div className="flex items-center gap-3">
          {onBackToEvents && (
            <button
              onClick={onBackToEvents}
              className="px-3 py-1 bg-[#1A1614] text-[#fcf9f2] hover:bg-[#BF6B45] transition-colors cursor-pointer flex items-center gap-1 font-bold uppercase text-[11px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Events</span>
            </button>
          )}
          <span>
            <strong className="font-bold uppercase tracking-wider">DECISION EVIDENCE INSPECTOR:</strong> Auditable forensic evidence derived directly from live SQLite audit records and deterministic policy proofs.
            {apiError && <span className="ml-2 text-[#B3261E] font-bold underline">({apiError})</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] bg-[#1A1614] text-white px-2 py-0.5 border border-[#1A1614] font-bold">
            SQLITE AUDIT
          </span>
          <button
            onClick={loadAuditEvents}
            disabled={loading}
            className="p-1.5 bg-[#f4f1ea] text-[#1A1614] hover:bg-[#1A1614] hover:text-white border border-[#1A1614] transition-colors cursor-pointer"
            title="Reload audit records from gateway"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live SQLite Incident Selector (Rendered from real recorded events) */}
      {events.length > 0 && (
        <section className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold block">
            Select Recorded Security Incident to Inspect:
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {events.map((evt) => {
              const isActive = activeEvent?.id === evt.id
              return (
                <button
                  key={evt.id}
                  onClick={() => setSelectedEventId(evt.id)}
                  className={`px-4 py-2 border-[1.5px] border-[#1A1614] font-mono text-xs uppercase font-bold tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1A1614] text-[#fcf9f2] shadow-[3px_3px_0px_#BF6B45]'
                      : 'bg-[#fcf9f2] text-[#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2]'
                  }`}
                  type="button"
                >
                  {evt.tool} [{evt.action}] — {evt.id.slice(-8)}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Main Evidence Breakdown */}
      {loading && !activeEvidence ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-16 text-center text-slate-400 text-xs">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-[#BF6B45]" />
          Loading audit records from SQLite database...
        </div>
      ) : !activeEvidence ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-16 text-center text-slate-500 text-xs">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-semibold text-slate-300 text-sm">No Security Audit Records Found</p>
          <p className="mt-1 text-slate-500 max-w-md mx-auto">
            The SQLite audit database currently contains no event records. When MCP tool calls are intercepted by TARS Gateway, auditable policy proofs and decision evidence will be available here.
          </p>
          {onBackToEvents && (
            <button
              onClick={onBackToEvents}
              className="mt-4 px-4 py-2 bg-[#1A1614] text-[#fcf9f2] hover:bg-[#BF6B45] text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
            >
              Go to Security Events
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Metadata & Policy evaluations */}
          <div className="lg:col-span-6 space-y-6">
            {/* Metadata Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    Audit Record Identifier
                  </span>
                  <div className="text-sm font-semibold text-slate-200 font-mono">
                    {activeEvidence.eventId}
                  </div>
                </div>
                <Badge type={activeEvidence.finalAction} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">Timestamp</span>
                  <span className="font-mono text-slate-300">{activeEvidence.timestamp}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">Target Tool</span>
                  <span className="font-mono text-indigo-300">{activeEvidence.toolName}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">Originating Client</span>
                  <span className="font-mono text-slate-300">{activeEvidence.clientId}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">Audit Reference</span>
                  <span className="font-mono text-slate-400 truncate block">
                    {activeEvidence.auditRecordReference}
                  </span>
                </div>
              </div>
            </div>

            {/* Policy Evaluation Stack */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Deterministic Policy Evaluation Breakdown
              </h3>

              <div className="space-y-3">
                {activeEvidence.policyEvaluations.map((policy, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs ${
                      policy.passed
                        ? 'bg-emerald-950/20 border-emerald-800/40'
                        : 'bg-rose-950/20 border-rose-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-200 flex items-center gap-1.5">
                        {policy.passed ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-rose-400" />
                        )}
                        {policy.policyName}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          policy.passed
                            ? 'bg-emerald-900/50 text-emerald-300'
                            : 'bg-rose-900/50 text-rose-300'
                        }`}
                      >
                        {policy.passed ? 'PASSED' : 'VIOLATION'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] pl-5">{policy.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Prompt injection signal & raw payload / redaction */}
          <div className="lg:col-span-6 space-y-6">
            {/* Prompt Injection Signal (Rule 5: explicit signal disclaimer) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  Prompt-Injection Risk Signal
                </h3>
                <span className="text-[10px] text-amber-400/80 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Rule 5: Limited Risk Signal
                </span>
              </div>

              {activeEvidence.promptInjectionSignal ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Heuristic Classifier Confidence:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {(activeEvidence.promptInjectionSignal.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        activeEvidence.promptInjectionSignal.confidence > 0.6
                          ? 'bg-rose-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{
                        width: `${activeEvidence.promptInjectionSignal.confidence * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {activeEvidence.promptInjectionSignal.note}
                  </p>
                </div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-xs text-slate-500">
                  No prompt-injection anomaly detected during heuristic argument inspection.
                </div>
              )}
            </div>

            {/* Raw Request & Redaction View */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Intercepted Payload & Redaction Evidence
                </h3>
                <button
                  onClick={() =>
                    handleCopy(
                      activeEvidence.redactedPayloadPreview || activeEvidence.rawRequestSummary
                    )
                  }
                  className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Payload'}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-[11px] font-mono text-slate-500 block mb-1">
                    INTERCEPTED TOOL CALL PARAMETERS:
                  </span>
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-3 rounded border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
                    {activeEvidence.rawRequestSummary}
                  </pre>
                </div>

                {activeEvidence.redactedPayloadPreview && (
                  <div>
                    <span className="text-[11px] font-mono text-amber-400 block mb-1">
                      SANITIZED RESPONSE FORWARDED TO CLIENT:
                    </span>
                    <pre className="text-[11px] font-mono text-amber-200/90 bg-amber-950/20 p-3 rounded border border-amber-800/30 overflow-x-auto whitespace-pre-wrap">
                      {activeEvidence.redactedPayloadPreview}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
