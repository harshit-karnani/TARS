import { useState } from 'react'
import { Navigation } from './components/Navigation'
import { SecurityEventsPage } from './components/pages/SecurityEventsPage'
import { ToolContractsPage } from './components/pages/ToolContractsPage'
import { ReplayPage } from './components/pages/ReplayPage'
import { DecisionEvidencePage } from './components/pages/DecisionEvidencePage'
import { TarsIntroModal } from './components/common/TarsIntroModal'
import { apiClient } from './api/client'
import { Terminal, Shield, RefreshCw } from 'lucide-react'
import type { NavTab, AuditEvent } from './types'

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('events')
  const [inspectedEvent, setInspectedEvent] = useState<AuditEvent | null>(null)
  const [isIntroOpen, setIsIntroOpen] = useState(true)

  const handleInspectEvidence = (event: AuditEvent) => {
    setInspectedEvent(event)
    setCurrentTab('evidence')
  }

  const handleBackToEvents = () => {
    setCurrentTab('events')
  }

  return (
    <div className="flex h-screen w-screen bg-[#f4f1ea] text-[#1A1614] overflow-hidden font-body selection:bg-[#1A1614] selection:text-[#fcf9f2]">
      {/* Decryption Intro Sequence Modal */}
      <TarsIntroModal isOpen={isIntroOpen} onClose={() => setIsIntroOpen(false)} />

      {/* Sidebar Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenIntro={() => setIsIntroOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f4f1ea]">
        {/* Top Minimalist Header */}
        <header className="h-16 border-b-[1.5px] border-[#1A1614] bg-[#fcf9f2] px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-[#1A1614] text-[#fcf9f2] flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-[#1A1614] uppercase">
                  {currentTab === 'events' && 'SECURITY EVENTS & DECISION STREAM'}
                  {currentTab === 'contracts' && 'TOOL CONTRACTS & CANONICAL DRIFT'}
                  {currentTab === 'replay' && 'SECURITY REPLAY & REGRESSION SUITE'}
                  {currentTab === 'evidence' && 'AUDITABLE DECISION EVIDENCE'}
                </span>
                <span className="text-[10px] bg-[#BF6B45] text-white px-2 py-0.5 border border-[#1A1614] font-mono font-bold">
                  ENFORCING
                </span>
              </div>
              <p className="text-[11px] text-[#1A1614]/70 font-mono tracking-tight">
                Runtime Contract Security Gateway for Model Context Protocol
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsIntroOpen(true)}
              className="text-xs font-mono text-[#1A1614] hover:bg-[#1A1614] hover:text-[#fcf9f2] bg-transparent border-[1.5px] border-[#1A1614] px-3.5 py-1.5 flex items-center gap-1.5 transition-colors cursor-pointer shadow-[2px_2px_0px_#1A1614] active:translate-x-[1px] active:translate-y-[1px]"
              title="Launch the Fullscreen CRT Decryption Intro"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Decryption Replay</span>
            </button>

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#f4f1ea] border-[1.5px] border-[#1A1614] text-[11px] font-mono font-bold text-[#1A1614]">
              <Shield className="w-3.5 h-3.5 text-[#BF6B45]" />
              <span>GW: <code className="text-[#914724]">{apiClient.getBaseUrl()}</code></span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#2F6B3F] text-white text-[10px] font-mono font-bold tracking-wider border-[1.5px] border-[#1A1614]">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
              <span>SYNCHRONIZED</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Views with Stitch Broad-form Layout */}
        <main className="flex-1 overflow-y-auto p-8 lg:p-12 max-w-[1440px] w-full mx-auto">
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
