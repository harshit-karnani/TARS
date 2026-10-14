import React from 'react'
import type { SecurityAction, ContractStatus } from '../../types'

export const Badge: React.FC<{
  type: SecurityAction | ContractStatus | string
  label?: string
}> = ({ type, label }) => {
  const text = label || type

  let colorClasses = 'bg-[#10171d] text-slate-300 border-slate-700/60'

  switch (type) {
    // Positive statuses & Allow: Deep forest green (#2F6B3F)
    case 'ALLOW':
    case 'ACTIVE':
    case 'PASSED':
    case 'SUCCESS':
      colorClasses = 'bg-[#2F6B3F] text-white border-[#1A1614]'
      break

    // SecurityAction: REQUIRE_APPROVAL - Rich Mustard (#C99A1F) with black ink text per Stitch spec
    case 'REQUIRE_APPROVAL':
      colorClasses = 'bg-[#C99A1F] text-[#1A1614] border-[#1A1614] font-bold'
      break

    // Hard blocked / failed states: Brick Red (#B3261E)
    case 'BLOCK':
    case 'BLOCKED':
    case 'FAILED':
    case 'ERROR':
      colorClasses = 'bg-[#B3261E] text-white border-[#1A1614]'
      break

    // ContractStatus: DRIFTED (Burnt Terracotta/Orange)
    case 'DRIFTED':
      colorClasses = 'bg-[#BF6B45] text-white border-[#1A1614]'
      break

    // ContractStatus: PENDING_REVIEW (Muted Ochre / Warm Stamp)
    case 'PENDING_REVIEW':
      colorClasses = 'bg-[#D9906C] text-[#1A1614] border-[#1A1614]'
      break

    // ContractStatus: DEPRECATED (Neutral slate / paper tint)
    case 'DEPRECATED':
      colorClasses = 'bg-[#E5E2DB] text-[#54433C] border-[#1A1614]'
      break
  }

  const formatText = (val: string) => {
    if (val === 'REQUIRE_APPROVAL') return 'REQUIRE APPROVAL'
    if (val === 'PENDING_REVIEW') return 'PENDING REVIEW'
    return val
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-none font-mono text-[10px] font-bold uppercase tracking-wider border-[1.5px] ${colorClasses}`}
    >
      {formatText(text)}
    </span>
  )
}

export const StatCard: React.FC<{
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: string
  trendPositive?: boolean
}> = ({ title, value, subtitle, icon, trend, trendPositive }) => {
  return (
    <div className="bg-[#fcf9f2] border-[1.5px] border-[#1A1614] p-5 shadow-[4px_4px_0px_#1A1614] transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono font-bold text-[#1A1614]/70 uppercase tracking-widest">{title}</span>
        {icon && <div className="text-[#BF6B45]">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-headline tracking-tight text-[#1A1614]">{value}</span>
        {trend && (
          <span
            className={`text-xs font-mono font-bold ${trendPositive ? 'text-[#2F6B3F]' : 'text-[#B3261E]'}`}
          >
            {trend}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs font-mono text-[#1A1614]/60 mt-1">{subtitle}</p>}
    </div>
  )
}
