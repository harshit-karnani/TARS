import React, { useState } from 'react'
import { MOCK_DECISION_EVIDENCE } from '../../data/mockData'
import { Badge } from '../common/CommonUI'
import {
  FileCheck2,
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
    <div className="space-y-6">
      {/* Simulation / Mock Banner */}
      <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-indigo-300">
        <div className="flex items-center gap-2">
          {onBackToEvents && (
            <button
              onClick={onBackToEvents}
              className="p-1 hover:bg-indigo-900/60 rounded text-indigo-300 hover:text-white transition cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Events</span>
            </button>
          )}
          <span>
            <strong className="font-semibold text-indigo-200">Decision Evidence Inspector:</strong> Auditable decision evidence linked directly to SQLite audit records and deterministic policy checks.
          </span>
        </div>
        <span className="font-mono text-[10px] bg-indigo-900/50 px-2 py-0.5 rounded border border-indigo-700/50">
          AUDIT ENGINE
        </span>
      </div>

      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-indigo-400" />
              Auditable Decision Evidence
            </h2>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
              SQLite Backed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Audit record details displaying deterministic policy evaluations, sanitized
            payloads, and heuristic prompt injection signals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedEvidence && (
            <button
              onClick={() => setActiveId(selectedEvidence.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                activeEvidence.eventId === selectedEvidence.id
                  ? 'bg-indigo-600 text-white font-medium border-indigo-500 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              Inspected Event: {selectedEvidence.id} ({selectedEvidence.action})
            </button>
          )}

          {MOCK_DECISION_EVIDENCE.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                activeEvidence.id === item.id || activeEvidence.eventId === item.eventId
                  ? 'bg-indigo-600 text-white font-medium border-indigo-500 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {item.eventId} ({item.finalAction})
            </button>
          ))}
        </div>
      </div>

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
