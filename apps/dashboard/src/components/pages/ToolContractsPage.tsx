import React, { useState, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { Badge, StatCard } from '../common/CommonUI'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Hash,
  ArrowRight,
  ShieldAlert,
  Clock,
  Layers,
  RefreshCw,
  Search,
  Server,
  FileCode,
} from 'lucide-react'
import type { ToolContract, ContractDriftResult, ContractStatus } from '../../types'
import { MOCK_TOOL_CONTRACTS, MOCK_DRIFT_RESULTS } from '../../data/mockData'

export const ToolContractsPage: React.FC = () => {
  const [contracts, setContracts] = useState<ToolContract[]>(MOCK_TOOL_CONTRACTS)
  const [selectedContract, setSelectedContract] = useState<ToolContract | null>(MOCK_TOOL_CONTRACTS[0])
  const [driftResult, setDriftResult] = useState<ContractDriftResult | null>(
    MOCK_DRIFT_RESULTS['postgres-mcp-upstream:execute_sql_query'] || null
  )
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterServer, setFilterServer] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [isFromMock, setIsFromMock] = useState(true)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showRawSchema, setShowRawSchema] = useState(false)

  const loadContracts = async () => {
    setLoading(true)
    const res = await apiClient.getContracts()
    setContracts(res.data)
    setIsFromMock(res.isFromMock)
    setApiError(res.error || null)
    if (res.data.length > 0) {
      setSelectedContract((prev) => prev || res.data[0])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadContracts()
  }, [])

  useEffect(() => {
    if (selectedContract) {
      apiClient.getContractDrift(selectedContract.serverId, selectedContract.toolName).then((res) => {
        setDriftResult(res.data)
      })
    }
  }, [selectedContract])

  const uniqueServers = Array.from(new Set(contracts.map((c) => c.serverId))).filter(Boolean)

  const filteredContracts = contracts.filter((c) => {
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus
    const matchesServer = filterServer === 'ALL' || c.serverId === filterServer
    const matchesSearch =
      c.toolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.serverId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesStatus && matchesServer && matchesSearch
  })

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
          <strong className="font-semibold">{isFromMock ? 'Demonstration Mode:' : 'Live Registry:'}</strong> MCP tool contracts supporting canonical ContractStatus values (`ACTIVE`, `DRIFTED`, `DEPRECATED`, `BLOCKED`, `PENDING_REVIEW`). Prepared for `GET /api/contracts` & `GET /api/contracts/:serverId/:toolName/drift`.
          {apiError && <span className="ml-2 text-rose-300 font-mono">({apiError})</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/50">
            {isFromMock ? 'MOCK REGISTRY' : 'LIVE REGISTRY'}
          </span>
          <button
            onClick={loadContracts}
            className="p-1 hover:bg-slate-800/60 rounded text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh contracts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          title="ACTIVE"
          value={contracts.filter((c) => c.status === 'ACTIVE').length}
          subtitle="Enforced in sync"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />
        <StatCard
          title="DRIFTED"
          value={contracts.filter((c) => c.status === 'DRIFTED').length}
          subtitle="Schema mutation"
          icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
          trend="Warning"
          trendPositive={false}
        />
        <StatCard
          title="BLOCKED"
          value={contracts.filter((c) => c.status === 'BLOCKED').length}
          subtitle="Prohibited tool"
          icon={<ShieldAlert className="w-4 h-4 text-rose-400" />}
          trend="Enforced"
          trendPositive={false}
        />
        <StatCard
          title="PENDING_REVIEW"
          value={contracts.filter((c) => c.status === 'PENDING_REVIEW').length}
          subtitle="Awaiting review"
          icon={<Clock className="w-4 h-4 text-purple-400" />}
          trend="Queue"
          trendPositive={false}
        />
        <StatCard
          title="DEPRECATED"
          value={contracts.filter((c) => c.status === 'DEPRECATED').length}
          subtitle="Phased out"
          icon={<Layers className="w-4 h-4 text-slate-400" />}
          trend="Legacy"
          trendPositive={false}
        />
      </div>

      {/* Filter and search bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search contracts by tool or server..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DRIFTED">DRIFTED</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="PENDING_REVIEW">PENDING_REVIEW</option>
              <option value="DEPRECATED">DEPRECATED</option>
            </select>
          </div>

          {uniqueServers.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Server:</span>
              <select
                value={filterServer}
                onChange={(e) => setFilterServer(e.target.value)}
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
        </div>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Contract list */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Registered Tool Contracts</h2>
              <span className="text-[10px] text-amber-400/80 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
                {isFromMock ? 'Mock Registry' : 'Live Gateway'}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {filteredContracts.length} inventory
            </span>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[560px] overflow-y-auto">
            {filteredContracts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No tool contracts registered or matching criteria.
              </div>
            ) : (
              filteredContracts.map((contract) => {
                const isSelected =
                  selectedContract?.toolName === contract.toolName &&
                  selectedContract?.serverId === contract.serverId
                return (
                  <div
                    key={`${contract.serverId}:${contract.toolName}`}
                    onClick={() => {
                      setSelectedContract(contract)
                      setShowRawSchema(false)
                    }}
                    className={`p-4 cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-950/30 border-l-2 border-indigo-500'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-xs text-slate-200">
                          {contract.toolName}
                        </span>
                        <Badge type={contract.status as ContractStatus} />
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3 text-slate-500" />
                          {contract.serverId}
                        </span>
                        <span>v{contract.version}</span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-600'}`}
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Selected contract detail & drift diff viewer */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          {selectedContract ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-100 font-mono">
                    {selectedContract.toolName}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Server: <span className="text-indigo-300 font-mono">{selectedContract.serverId}</span> • Version: {selectedContract.version}
                  </p>
                  {selectedContract.description && (
                    <p className="text-xs text-slate-400 mt-1">{selectedContract.description}</p>
                  )}
                </div>
                <Badge type={selectedContract.status as ContractStatus} />
              </div>

              {/* Canonical hash comparison card */}
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                    Canonical Definition Hash
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Version {selectedContract.version}
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-300 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 select-all">
                  {selectedContract.definitionHash}
                </div>
              </div>

              {/* Drift details if present */}
              {driftResult && driftResult.hasDrift ? (
                <div className="space-y-3">
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      Contract Drift Detected (GET /api/contracts/:serverId/:toolName/drift)
                    </div>
                    <p className="text-xs text-slate-300">
                      Discrepancy detected between advertised tool definition and registered contract hash.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-slate-400 space-y-0.5 bg-slate-950/50 p-2 rounded">
                      <div>Expected Hash: {driftResult.expectedHash}</div>
                      <div>Actual Hash: &nbsp;&nbsp;{driftResult.actualHash}</div>
                      <div className="text-slate-500">Detected At: &nbsp;{driftResult.detectedAt}</div>
                    </div>
                  </div>

                  {driftResult.schemaDifferences && driftResult.schemaDifferences.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Human-Readable Schema Differences
                      </h4>
                      <div className="space-y-1.5">
                        {driftResult.schemaDifferences.map((diff, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/70 border border-slate-800/80 rounded p-2.5 text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-mono font-medium text-slate-200 mr-2">{diff.path}</span>
                              <span className="text-[11px] text-slate-400">{diff.description}</span>
                            </div>
                            <span
                              className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded ${
                                diff.changeType === 'ADDED'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : diff.changeType === 'REMOVED'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {diff.changeType}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-5 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <h4 className="text-xs font-semibold text-emerald-300">Contract In Strict Sync</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Status: <Badge type={selectedContract.status as ContractStatus} />. Definition hash matches the upstream MCP tool schema. No unauthorized parameter drift detected.
                  </p>
                </div>
              )}

              {/* Raw JSON Schema toggle */}
              {showRawSchema && selectedContract.inputSchema && (
                <div className="bg-slate-950 rounded-lg border border-slate-800 p-3 space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Input Parameter Schema</span>
                  <pre className="text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto">
                    {JSON.stringify(selectedContract.inputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              <FileCode className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              Select a contract from the inventory to view hash integrity and schema drift details.
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 mt-6 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-mono">Route: GET /api/contracts</span>
            {selectedContract && (
              <button
                onClick={() => setShowRawSchema((prev) => !prev)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{showRawSchema ? 'Hide Schema' : 'View Schema JSON'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
