/**
 * Formats a given ISO timestamp string or Date into readable Indian Standard Time (IST)
 * using Intl.DateTimeFormat with Asia/Kolkata timezone.
 *
 * Example: 15 Oct 2026, 4:28:09 AM IST
 * Safely returns '—' for null/undefined or the raw value if invalid.
 */
export function formatIST(timestamp?: string | null): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return String(timestamp)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date)

  const p: Record<string, string> = {}
  for (const part of parts) {
    p[part.type] = part.value
  }

  const period = (p.dayPeriod || '').toUpperCase()
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} ${period} IST`
}

