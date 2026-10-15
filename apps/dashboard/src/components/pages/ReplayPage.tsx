import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { Badge, StatCard } from '../common/CommonUI'
import { PlaySquare, CheckCircle, RotateCcw, Terminal, RefreshCw, AlertCircle } from 'lucide-react'
import type { ReplayRunSummary, ReplayResult } from '../../types'

export const ReplayPage: React.FC = () => {
  const [summary, setSummary] = useState<ReplayRunSummary | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ReplayResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const loadReplayData = async () => {
    setLoading(true)
    try {
      const res = await apiClient.getReplayRuns()
      setSummary(res.data)
      setApiError(res.error || null)
      if (res.data?.results && res.data.results.length > 0) {
        setSelectedResult(res.data.results[0])
      } else {
        setSelectedResult(null)
      }
    } catch (err) {
      setSummary(null)
      setApiError(err instanceof Error ? err.message : 'Failed to query replay runs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReplayData()
  }, [])

  const handleRunAll = async () => {
    setIsRunning(true)
    setApiError(null)
    try {
      const res = await apiClient.runReplaySuite()
      if (res.data) {
        setSummary(res.data)
        if (res.data.results && res.data.results.length > 0) {
          setSelectedResult(res.data.results[0])
        }
      } else if (res.error) {
        setApiError(res.error)
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Replay execution failed')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-8 font-body">
      {/* Stitch Giant Hero + Action Button */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b-[1.5px] border-[#1A1614]">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl md:text-4xl tracking-tight leading-tight uppercase text-[#1A1614] m-0 select-none">
            <span className="typewriter-line typewriter-line-1">PROVE IT</span>
            <br />
            <span className="typewriter-line typewriter-line-2">HOLDS.</span>
          </h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[#1A1614]/70 font-semibold animate-hero-text [animation-delay:1.4s]">
            03 // ATTACK REPLAY HARNESS & REGRESSION SUITE
          </p>
        </div>

        <div className="shrink-0 pb-1">
          <button
            onClick={handleRunAll}
            disabled={isRunning}
            className="w-full sm:w-auto px-8 py-4 bg-[#BF6B45] text-white font-mono text-sm font-bold uppercase tracking-wider border-[1.5px] border-[#1A1614] shadow-[4px_4px_0px_#1A1614] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2] transition-all cursor-pointer flex items-center justify-center gap-2"
            type="button"
          >
            <RotateCcw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'EXECUTING TEST VECTORS...' : 'Run All Replay Tests'}</span>
          </button>
        </div>
      </section>

      {/* Live Replay Runner Banner */}
      <div
        className={`p-4 border-[1.5px] border-[#1A1614] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono shadow-[4px_4px_0px_#1A1614] ${
          apiError
            ? 'bg-[#B3261E] text-white'
            : summary
            ? 'bg-[#2F6B3F] text-white'
            : 'bg-[#fcf9f2] text-[#1A1614]'
        }`}
      >
        <span>
          <strong className="font-bold uppercase tracking-wider">LIVE REPLAY RUNNER:</strong> Security attack test vectors executed directly against live gateway PolicyEngine via <code>POST /api/replay/run</code>.
          {apiError && <span className="ml-2 font-bold underline">({apiError})</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-[#1A1614] text-white px-2 py-0.5 border border-[#1A1614] font-bold">
            {apiError ? 'API ERROR' : summary ? 'LIVE RUNNER' : 'STANDBY'}
          </span>
          <button
            onClick={loadReplayData}
            disabled={loading || isRunning}
            className="p-1.5 bg-[#f4f1ea] text-[#1A1614] hover:bg-[#1A1614] hover:text-white border border-[#1A1614] transition-colors cursor-pointer"
            title="Reload replay data from gateway"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top summary stats in brutalist cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Regression Cases"
          value={summary?.totalCases ?? 0}
          subtitle="Pre-recorded attack suite"
          icon={<PlaySquare className="w-5 h-5 text-[#BF6B45]" />}
        />
        <StatCard
          title="Regression Pass Rate"
          value={summary ? `${(summary.passRate * 100).toFixed(0)}%` : '—'}
          subtitle={summary ? `${summary.passedCases}/${summary.totalCases} verified safe` : 'Awaiting execution'}
          icon={<CheckCircle className="w-4 h-4 text-emerald-400" />}
          trend={summary ? 'Deterministic' : 'Pending'}
          trendPositive={summary ? summary.passRate === 1 : false}
        />
        <StatCard
          title="Average Latency"
          value={summary ? `${summary.averageLatencyMs} ms` : '—'}
          subtitle="Interception overhead"
          trend={summary ? 'Measured' : 'Pending'}
          trendPositive={true}
        />
        <StatCard
          title="Batch Execution"
          value={summary?.runId ?? 'None'}
          subtitle={summary ? summary.timestamp : 'No run recorded'}
          icon={<AlertCircle className="w-4 h-4 text-cyan-400" />}
          trend={summary ? 'Active' : 'Standby'}
          trendPositive={summary !== null}
        />
      </div>

      {/* Action banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Replay Attack Harness</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Execute recorded malicious MCP payloads through TARS gateway policy engine to verify zero security regressions.
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
              <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Live Gateway Runner
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {summary ? `Run: ${summary.runId}` : 'No active run'}
            </span>
          </div>

          <div className="overflow-x-auto">
            {loading && !summary ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-[#BF6B45]" />
                Checking replay run status from gateway...
              </div>
            ) : !summary ? (
              <div className="py-16 text-center text-slate-500 text-xs px-6">
                <PlaySquare className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                <p className="font-semibold text-slate-300">No replay run executed yet</p>
                <p className="mt-1 text-slate-500 max-w-sm mx-auto">
                  Click <strong className="text-slate-300">"Run All Replay Tests"</strong> above to execute recorded security attack cases against the live TARS PolicyEngine.
                </p>
              </div>
            ) : (
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
                  {summary.results.map((r) => {
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
            )}
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
                  <span className={selectedResult.passed ? 'text-emerald-400' : 'text-rose-400'}>
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

              <div
                className={`border rounded-lg p-3 text-xs flex items-center gap-2 ${
                  selectedResult.passed
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                <CheckCircle className={`w-4 h-4 shrink-0 ${selectedResult.passed ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span>
                  {selectedResult.passed
                    ? 'Regression verification passed: deterministic guard matched expected security action without deviation.'
                    : 'Regression test failed: actual policy action diverged from expected security baseline.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              {summary
                ? 'Select a test case to view execution detail'
                : 'Execute the replay suite to inspect individual test case results'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
