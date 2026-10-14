import React from 'react'
import type { SecurityAction, ContractStatus } from '../../types'

export const Badge: React.FC<{
  type: SecurityAction | ContractStatus | string
  label?: string
}> = ({ type, label }) => {
  const text = label || type

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700'

  switch (type) {
    // Positive statuses & Allow
    case 'ALLOW':
    case 'ACTIVE':
    case 'PASSED':
    case 'SUCCESS':
      colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      break

    // SecurityAction: REQUIRE_APPROVAL - amber badge per requirement
    case 'REQUIRE_APPROVAL':
      colorClasses = 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-xs'
      break

    // Hard blocked / failed states: BLOCK & BLOCKED
    case 'BLOCK':
    case 'BLOCKED':
    case 'FAILED':
    case 'ERROR':
      colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      break

    // ContractStatus: DRIFTED (warning/orange)
    case 'DRIFTED':
      colorClasses = 'bg-orange-500/10 text-orange-400 border-orange-500/30'
      break

    // ContractStatus: PENDING_REVIEW (purple / violet)
    case 'PENDING_REVIEW':
      colorClasses = 'bg-purple-500/10 text-purple-400 border-purple-500/30'
      break

    // ContractStatus: DEPRECATED (neutral slate)
    case 'DEPRECATED':
      colorClasses = 'bg-slate-700/40 text-slate-400 border-slate-600/40'
      break
  }

  const formatText = (val: string) => {
    if (val === 'REQUIRE_APPROVAL') return 'REQUIRE APPROVAL'
    if (val === 'PENDING_REVIEW') return 'PENDING REVIEW'
    return val
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses}`}
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
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-100">{value}</span>
        {trend && (
          <span
            className={`text-xs font-medium ${trendPositive ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {trend}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}
