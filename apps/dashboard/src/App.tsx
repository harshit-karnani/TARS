import { useState } from 'react'
import { Navigation } from './components/Navigation'
import { SecurityEventsPage } from './components/pages/SecurityEventsPage'
import { ToolContractsPage } from './components/pages/ToolContractsPage'
import { ReplayPage } from './components/pages/ReplayPage'
import { DecisionEvidencePage } from './components/pages/DecisionEvidencePage'
import { MLRiskClassificationPage } from './components/pages/MLRiskClassificationPage'
import { TarsIntroModal } from './components/common/TarsIntroModal'
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
        {/* Dynamic Page Views with Stitch Broad-form Layout */}
        <main className={`flex-1 overflow-y-auto ${currentTab === 'mlRisk' ? 'p-0 bg-[#f4eee5]' : 'p-8 lg:p-12 max-w-[1440px] w-full mx-auto'}`}>
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
          {currentTab === 'mlRisk' && <MLRiskClassificationPage />}
        </main>
      </div>
    </div>
  )
}

export default App
