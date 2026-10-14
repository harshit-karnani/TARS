import { useState } from 'react'
import { Navigation } from './components/Navigation'
import { SecurityEventsPage } from './components/pages/SecurityEventsPage'
import { ToolContractsPage } from './components/pages/ToolContractsPage'
import { ReplayPage } from './components/pages/ReplayPage'
import { DecisionEvidencePage } from './components/pages/DecisionEvidencePage'
import { apiClient } from './api/client'
import type { NavTab, AuditEvent } from './types'

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('events')
  const [inspectedEvent, setInspectedEvent] = useState<AuditEvent | null>(null)

  const handleInspectEvidence = (event: AuditEvent) => {
    setInspectedEvent(event)
    setCurrentTab('evidence')
  }

  const handleBackToEvents = () => {
    setCurrentTab('events')
  }

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Navigation currentTab={currentTab} onSelectTab={setCurrentTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-950/60 px-8 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-semibold text-slate-100 tracking-tight">
              {currentTab === 'events' && 'Security Events & Decision Stream'}
              {currentTab === 'contracts' && 'Tool Contracts & Canonical Drift'}
              {currentTab === 'replay' && 'Security Replay & Regression Suite'}
              {currentTab === 'evidence' && 'Auditable Decision Evidence'}
            </h1>
            <p className="text-xs text-slate-500">
              Contract-aware runtime security gateway for Model Context Protocol
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
              Gateway Base: {apiClient.getBaseUrl()}
            </span>
            <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="flex-1 overflow-y-auto p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'events' && (
            <SecurityEventsPage onInspectEvidence={handleInspectEvidence} />
          )}
          {currentTab === 'contracts' && <ToolContractsPage />}
          {currentTab === 'replay' && <ReplayPage />}
          {currentTab === 'evidence' && (
            <DecisionEvidencePage
              selectedEvidence={inspectedEvent}
              onBackToEvents={handleBackToEvents}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
