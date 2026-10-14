import React, { useState } from 'react'
import { MOCK_DECISION_EVIDENCE } from '../../data/mockData'
import { Badge } from '../common/CommonUI'
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Cpu,
  ArrowLeft,
} from 'lucide-react'
import type { AuditEvent, DecisionEvidenceItem, SecurityAction } from '../../types'

export const DecisionEvidencePage: React.FC<{
  selectedEvidence?: AuditEvent | null
  selectedEvidenceId?: string
  onBackToEvents?: () => void
}> = ({ selectedEvidence, selectedEvidenceId, onBackToEvents }) => {
  const [activeId, setActiveId] = useState<string>(
    selectedEvidence?.id || selectedEvidenceId || MOCK_DECISION_EVIDENCE[0].id
  )
  const [copied, setCopied] = useState(false)

  // Adapter: convert incoming AuditEvent into DecisionEvidenceItem if selected from live feed
  const activeEvidence: DecisionEvidenceItem = (() => {
    if (selectedEvidence && (selectedEvidence.id === activeId || activeId === selectedEvidence.id)) {
      return {
        id: `evi-${selectedEvidence.id}`,
        eventId: selectedEvidence.id,
        timestamp: selectedEvidence.timestamp,
        toolName: selectedEvidence.tool,
        serverId: selectedEvidence.serverId || 'local-fs-mcp',
        clientId: selectedEvidence.clientIdentity || 'mcp-client',
        finalAction: selectedEvidence.action,
        policyEvaluations: (selectedEvidence.decisionEvidence?.evaluatedChecks || [
          'Deterministic Confinement Check',
          'Contract Hash Match',
        ]).map((check) => ({
          policyName: check.split(':')[0] || check,
          passed: !check.includes('VIOLATION') && !check.includes('BLOCKED'),
          description: check,
        })),
        promptInjectionSignal: {
          detected: false,
          confidence: (selectedEvidence.decisionEvidence?.riskScore ?? 10) / 100,
          note: selectedEvidence.decisionEvidence?.notes || 'Heuristic check evaluated.',
        },
        rawRequestSummary: JSON.stringify(
          selectedEvidence.parameters || { tool: selectedEvidence.tool, requestId: selectedEvidence.requestId },
          null,
          2
        ),
        redactedPayloadPreview: selectedEvidence.redacted
          ? '{"status": "SANITIZED", "redacted": true, "reason": "Secret patterns stripped"}'
          : undefined,
        auditRecordReference: `SQLite audit record #${selectedEvidence.id} (Live SQLite trace: ${selectedEvidence.requestId})`,
      }
    }

    return (
      MOCK_DECISION_EVIDENCE.find((e) => e.id === activeId || e.eventId === activeId) ||
      MOCK_DECISION_EVIDENCE[0]
    )
  })()

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
            onClick={() => handleCopy(JSON.stringify(activeEvidence, null, 2))}
            className="px-8 py-4 bg-[#BF6B45] text-white font-mono font-bold text-xs uppercase tracking-wider border-[1.5px] border-[#1A1614] shadow-[4px_4px_0px_#1A1614] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2] transition-all cursor-pointer flex items-center gap-2"
            type="button"
          >
            {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'COPIED TO CLIPBOARD' : 'EXPORT PROOF'}</span>
          </button>
        </div>
      </section>

      {/* Simulation / Mock Banner */}
      <div className="bg-[#fcf9f2] border-[1.5px] border-[#1A1614] p-4 flex items-center justify-between text-xs font-mono text-[#1A1614] shadow-[4px_4px_0px_#1A1614]">
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
            <strong className="font-bold uppercase tracking-wider">DECISION EVIDENCE INSPECTOR:</strong> Auditable decision evidence linked directly to SQLite audit records and deterministic policy checks.
          </span>
        </div>
        <span className="font-mono text-[10px] bg-[#1A1614] text-white px-2 py-0.5 border border-[#1A1614] font-bold">
          SQLITE AUDIT
        </span>
      </div>

      {/* Stitch Incident Selector (Brutalist Buttons) */}
      <section className="flex flex-wrap items-center gap-2.5">
        {selectedEvidence && (
          <button
            onClick={() => setActiveId(selectedEvidence.id)}
            className={`px-4 py-2 border-[1.5px] border-[#1A1614] font-mono text-xs uppercase font-bold tracking-wider transition-all cursor-pointer ${
              activeEvidence.eventId === selectedEvidence.id
                ? 'bg-[#1A1614] text-[#fcf9f2] shadow-[3px_3px_0px_#BF6B45]'
                : 'bg-[#fcf9f2] text-[#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2]'
            }`}
            type="button"
          >
            LIVE {selectedEvidence.id} ({selectedEvidence.action})
          </button>
        )}

        {MOCK_DECISION_EVIDENCE.map((item) => {
          const isActive = activeEvidence.id === item.id || activeEvidence.eventId === item.eventId
          return (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`px-4 py-2 border-[1.5px] border-[#1A1614] font-mono text-xs uppercase font-bold tracking-wider transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1A1614] text-[#fcf9f2] shadow-[3px_3px_0px_#BF6B45]'
                  : 'bg-[#fcf9f2] text-[#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2]'
              }`}
              type="button"
            >
              {item.eventId} ({item.finalAction})
            </button>
          )
        })}
      </section>

      {/* Main Evidence Breakdown */}
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
              <Badge type={activeEvidence.finalAction as SecurityAction} />
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
          {/* Prompt Injection Signal (Explicit disclaimer per Rule 5) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Prompt-Injection Risk Signal
              </h3>
              <span className="text-[10px] text-amber-400/80 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Rule 5: Limited Signal Only
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
            ) : null}
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
    </div>
  )
}
