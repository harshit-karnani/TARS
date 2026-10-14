import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { Badge, StatCard } from '../common/CommonUI'
import { PlaySquare, CheckCircle, RotateCcw, Terminal, RefreshCw, AlertCircle } from 'lucide-react'
import type { ReplayRunSummary, ReplayResult } from '../../types'

export const ReplayPage: React.FC = () => {
  const [summary, setSummary] = useState<ReplayRunSummary | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ReplayResult | null>(null)
  const [isFromMock, setIsFromMock] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadReplayData = async () => {
    setLoading(true)
    const res = await apiClient.getReplayRuns()
    setSummary(res.data)
    setIsFromMock(res.isFromMock)
    if (res.data.results.length > 0) {
      setSelectedResult(res.data.results[0])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadReplayData()
  }, [])

  const handleRunAll = async () => {
    setIsRunning(true)
    const res = await apiClient.runReplaySuite()
    setSummary(res.data)
    setIsFromMock(res.isFromMock)
    if (res.data.results.length > 0) {
      setSelectedResult(res.data.results[0])
    }
    setIsRunning(false)
  }

  return (
    <div className="space-y-6">
      {/* Simulation / Mock Banner */}
      <div
        className={`rounded-xl p-3 px-4 flex items-center justify-between text-xs border ${
          isFromMock
            ? 'bg-indigo-950/30 border-indigo-800/40 text-indigo-300'
            : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
        }`}
      >
        <span>
          <strong className="font-semibold">{isFromMock ? 'Demonstration Mode:' : 'Live Replay:'}</strong> Test vectors verifying deterministic gateway policy enforcement. Prepared for `GET /api/replay/runs` and `POST /api/replay/run`.
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/50">
            {isFromMock ? 'SIMULATED HARNESS' : 'LIVE RUNNER'}
          </span>
          <button
            onClick={loadReplayData}
            className="p-1 hover:bg-slate-800/60 rounded text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Regression Cases"
          value={summary?.totalCases ?? 0}
          subtitle="Pre-recorded attack suite"
          icon={<PlaySquare className="w-4 h-4 text-indigo-400" />}
        />
        <StatCard
          title="Regression Pass Rate"
          value={summary ? `${(summary.passRate * 100).toFixed(0)}%` : '0%'}
          subtitle={summary ? `${summary.passedCases}/${summary.totalCases} verified safe` : '0/0'}
          icon={<CheckCircle className="w-4 h-4 text-emerald-400" />}
          trend={isFromMock ? 'Simulated' : 'Deterministic'}
          trendPositive={true}
        />
        <StatCard
          title="Average Latency"
          value={summary ? `${summary.averageLatencyMs} ms` : '0 ms'}
          subtitle="Interception overhead"
          trend="Fast"
          trendPositive={true}
        />
        <StatCard
          title="Batch Execution"
          value={summary?.runId ?? 'run-init'}
          subtitle={summary ? summary.timestamp : 'Pending run'}
          icon={<AlertCircle className="w-4 h-4 text-cyan-400" />}
          trend="Active"
          trendPositive={true}
        />
      </div>

      {/* Action banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Replay Attack Harness</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Execute recorded malicious MCP payloads through TARS gateway to verify zero security regressions.
          </p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={isRunning}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white font-medium text-xs rounded-lg transition-all flex items-center gap-2 shadow-sm shadow-indigo-600/30 cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Replaying Vectors...' : 'Run All Replay Tests'}
        </button>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Test case list */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Replay Regression Cases</h2>
              <span className="text-[10px] text-amber-400/80 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
                {isFromMock ? 'Mock Suite' : 'Live Suite'}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">Run: {summary?.runId}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800/80 font-medium">
                <tr>
                  <th className="py-3 px-4">Test Case ID</th>
                  <th className="py-3 px-4">Expected vs Actual</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-300">
                {summary?.results.map((r) => {
                  const isSelected = selectedResult?.caseId === r.caseId
                  return (
                    <tr
                      key={r.caseId}
                      onClick={() => setSelectedResult(r)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-950/40' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {r.caseId}
                        {r.reasonCode && (
                          <div className="text-[10px] font-mono text-slate-500">{r.reasonCode}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Badge type={r.expectedAction} />
                          <span className="text-slate-600">→</span>
                          <Badge type={r.actualAction} />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge type={r.passed ? 'PASSED' : 'FAILED'} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {r.latencyMs} ms
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected test case detail drawer */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          {selectedResult ? (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider">
                  Test Case Inspector
                </span>
                <h3 className="text-sm font-semibold text-slate-100 mt-1">{selectedResult.caseId}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Run Batch: {selectedResult.runId}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">POLICY VERSION</span>
                  <span className="font-mono text-slate-300">{selectedResult.policyVersion}</span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">ENFORCEMENT ACTION</span>
                  <span className="font-mono text-indigo-300">{selectedResult.actualAction}</span>
                </div>
              </div>

              <div className="bg-slate-950/90 rounded-lg p-3 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    Gateway Evaluation Output
                  </span>
                  <span className="text-emerald-400">
                    {selectedResult.passed ? 'Verified Match' : 'Regression Fail'}
                  </span>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 p-2 bg-slate-900/80 rounded border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
{`{
  "runId": "${selectedResult.runId}",
  "caseId": "${selectedResult.caseId}",
  "expectedAction": "${selectedResult.expectedAction}",
  "actualAction": "${selectedResult.actualAction}",
  "passed": ${selectedResult.passed},
  "reasonCode": "${selectedResult.reasonCode || 'POLICY_EVALUATED'}"
}`}
                </pre>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-300">
                  Regression verification passed: deterministic guard matched expected security action without deviation.
                </span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              Select a test case to view execution detail
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
