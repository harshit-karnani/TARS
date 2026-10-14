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
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    {
      id: 'events' as NavTab,
      label: 'Security Events',
      icon: <ShieldAlert className="w-4 h-4 mr-2" />,
      badge: 'MOCK',
    },
    {
      id: 'contracts' as NavTab,
      label: 'Tool Contracts & Drift',
      icon: <FileCode2 className="w-4 h-4 mr-2" />,
      badge: 'PREVIEW',
    },
    {
      id: 'replay' as NavTab,
      label: 'Replay & Regression',
      icon: <PlaySquare className="w-4 h-4 mr-2" />,
      badge: 'SIMULATED',
    },
    {
      id: 'evidence' as NavTab,
      label: 'Decision Evidence',
      icon: <FileCheck2 className="w-4 h-4 mr-2" />,
    },
  ]

  return (
    <aside className="w-64 bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between shrink-0">
      <div>
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wide text-slate-100 flex items-center gap-1.5">
                TARS
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-indigo-500/30">
                  MVP
                </span>
              </span>
              <p className="text-[11px] text-slate-500 font-medium">Contract Security Gateway</p>
            </div>
          </div>
        </div>

        <div className="px-3 py-4">
          <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Operations
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = currentTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                        active
                          ? 'bg-indigo-800 text-indigo-100'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800/80">
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span className="font-semibold text-slate-300">Gateway Status</span>
          </div>
          <p className="text-slate-400 text-[11px]">Backend API: Standby</p>
          <p className="text-slate-500 text-[10px] mt-0.5 font-mono">Audit: In Alignment Phase</p>
        </div>
      </div>
    </aside>
  )
}
