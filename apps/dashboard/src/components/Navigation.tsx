import React from 'react'
import {
  ShieldAlert,
  FileCode2,
  PlaySquare,
  FileCheck2,
  Layers,
} from 'lucide-react'
import type { NavTab } from '../types'

interface NavigationProps {
  currentTab: NavTab
  onSelectTab: (tab: NavTab) => void
  onOpenIntro?: () => void
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    {
      id: 'events' as NavTab,
      label: 'Security Events',
      icon: <ShieldAlert className="w-4 h-4 mr-2.5 text-emerald-400" />,
    },
    {
      id: 'contracts' as NavTab,
      label: 'Tool Contracts & Drift',
      icon: <FileCode2 className="w-4 h-4 mr-2.5 text-cyan-400" />,
    },
    {
      id: 'replay' as NavTab,
      label: 'Replay & Regression',
      icon: <PlaySquare className="w-4 h-4 mr-2.5 text-amber-400" />,
    },
    {
      id: 'evidence' as NavTab,
      label: 'Decision Evidence',
      icon: <FileCheck2 className="w-4 h-4 mr-2.5 text-purple-400" />,
    },
    {
      id: 'mlRisk' as NavTab,
      label: 'ML Risk Classification',
      icon: <Layers className="w-4 h-4 mr-2.5 text-rose-400" />,
    },
  ]

  return (
    <aside className="w-68 bg-[#fcf9f2] border-r-[1.5px] border-[#1A1614] flex flex-col justify-between shrink-0 font-mono select-none">
      <div>
        {/* Brand Header */}
        <div className="h-18 flex items-center px-6 border-b-[1.5px] border-[#1A1614] bg-[#f4f1ea]">
          <span className="font-headline text-3xl tracking-wider text-[#1A1614]">
            TARS
          </span>
        </div>

        {/* Navigation list */}
        <div className="px-3 py-6">
          <div className="flex items-center justify-between px-3 mb-4">
            <span className="text-[10px] font-bold text-[#1A1614]/60 uppercase tracking-widest font-mono">
              01 // OPERATIONS
            </span>
            <span className="h-2 w-2 bg-[#2F6B3F] inline-block"></span>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = currentTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer border-[1.5px] border-[#1A1614] ${
                    active
                      ? 'bg-[#1A1614] text-[#fcf9f2] shadow-[3px_3px_0px_#BF6B45]'
                      : 'bg-[#fcf9f2] text-[#1A1614] hover:bg-[#E8B79A]/40'
                  }`}
                >
                  <div className="flex items-center">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </aside>
  )
}

