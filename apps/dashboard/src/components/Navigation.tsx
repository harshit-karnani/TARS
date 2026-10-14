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

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab, onOpenIntro }) => {
  const navItems = [
    {
      id: 'events' as NavTab,
      label: 'Security Events',
      icon: <ShieldAlert className="w-4 h-4 mr-2.5 text-emerald-400" />,
      badge: 'MOCK',
    },
    {
      id: 'contracts' as NavTab,
      label: 'Tool Contracts & Drift',
      icon: <FileCode2 className="w-4 h-4 mr-2.5 text-cyan-400" />,
      badge: 'PREVIEW',
    },
    {
      id: 'replay' as NavTab,
      label: 'Replay & Regression',
      icon: <PlaySquare className="w-4 h-4 mr-2.5 text-amber-400" />,
      badge: 'SIMULATED',
    },
    {
      id: 'evidence' as NavTab,
      label: 'Decision Evidence',
      icon: <FileCheck2 className="w-4 h-4 mr-2.5 text-purple-400" />,
    },
  ]

  return (
    <aside className="w-68 bg-[#fcf9f2] border-r-[1.5px] border-[#1A1614] flex flex-col justify-between shrink-0 font-mono select-none">
      <div>
        {/* Brand Header */}
        <div className="h-18 flex items-center px-6 border-b-[1.5px] border-[#1A1614] bg-[#f4f1ea]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-[#1A1614] text-[#fcf9f2] border-[1.5px] border-[#1A1614] flex items-center justify-center shadow-[2px_2px_0px_#BF6B45]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-headline text-2xl tracking-wider text-[#1A1614] flex items-center gap-2">
                TARS
                <span className="text-[10px] bg-[#BF6B45] text-white font-mono px-1.5 py-0.5 border border-[#1A1614] font-bold">
                  MCP
                </span>
              </span>
              <p className="text-[10px] text-[#1A1614]/70 font-mono tracking-wider uppercase font-semibold">
                SECURITY GATEWAY
              </p>
            </div>
          </div>
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
                  {item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 font-mono font-bold tracking-wider border border-[#1A1614] ${
                        active
                          ? 'bg-[#BF6B45] text-white'
                          : 'bg-[#f4f1ea] text-[#1A1614]'
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

      {/* Footer System Box */}
      <div className="p-4 border-t-[1.5px] border-[#1A1614] bg-[#f4f1ea]">
        <div className="border-[1.5px] border-[#1A1614] bg-[#fcf9f2] p-3 shadow-[3px_3px_0px_#1A1614] mb-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#1A1614]/70 mb-1">
            <span>AUDIT ENCLAVE</span>
            <span className="text-[#2F6B3F] font-bold uppercase">ARMED</span>
          </div>
          <p className="text-[10px] text-[#1A1614]/70 font-mono mb-2">
            Deterministic Runtime Policy Firewall
          </p>
          {onOpenIntro && (
            <button
              onClick={onOpenIntro}
              className="w-full text-center text-[10px] font-mono font-bold uppercase text-[#1A1614] bg-[#BF6B45] text-white hover:bg-[#1A1614] border-[1.5px] border-[#1A1614] py-1.5 shadow-[2px_2px_0px_#1A1614] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer"
            >
              ↺ Decryption Sequence (5s)
            </button>
          )}
        </div>
        <div className="flex justify-between items-center text-[9px] text-[#1A1614]/70 font-mono tracking-wider font-semibold">
          <span>GW: MCP-SFO-01</span>
          <span className="text-[#2F6B3F] font-bold">ONLINE</span>
        </div>
      </div>
    </aside>
  )
}

