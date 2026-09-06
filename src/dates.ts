import type { Collection, Recurrence, Schedule } from './types'

const DAY_MS = 86_400_000

export function uid(): string {
  return crypto.randomUUID()
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function rangeLength(startDate: string, endDate: string): number {
  const start = parseISODate(startDate)
  const end = parseISODate(endDate)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))
}

export function formatLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (Math.abs(mins) < 1) return 'just now'
  if (Math.abs(mins) < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatSchedule(schedule: Schedule, occurrenceDate?: string): string {
  const start = occurrenceDate ?? schedule.startDate
  const span = rangeLength(schedule.startDate, schedule.endDate)
  const end = addDays(start, span)

  if (schedule.allDay) {
    if (span === 0) return `${formatShortDate(start)} · All day`
    return `${formatShortDate(start)} – ${formatShortDate(end)} · All day`
  }

  const startTime = schedule.startTime ? formatTime(schedule.startTime) : ''
  const endTime = schedule.endTime ? formatTime(schedule.endTime) : ''
  if (span === 0) {
    return `${formatShortDate(start)} · ${startTime}${endTime ? ` – ${endTime}` : ''}`
  }
  return `${formatShortDate(start)} ${startTime} – ${formatShortDate(end)} ${endTime}`
}

export function recurrenceLabel(recurrence: Recurrence): string | null {
  if (recurrence === 'yearly') return 'Every year'
  if (recurrence === 'monthly') return 'Every month'
  return null
}

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

/** Dates this collection occupies within a given month (0-indexed month). */
export function datesInMonth(
  collection: Collection,
  year: number,
  month: number,
): string[] {
  const schedule = collection.schedule
  if (!schedule) return []

  const origStart = parseISODate(schedule.startDate)
  const span = rangeLength(schedule.startDate, schedule.endDate)
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const dates: string[] = []

  const pushRange = (rangeStart: Date) => {
    for (let i = 0; i <= span; i += 1) {
      const day = new Date(rangeStart)
      day.setDate(rangeStart.getDate() + i)
      if (day >= monthStart && day <= monthEnd) dates.push(toISODate(day))
    }
  }

  if (schedule.recurrence === 'none') {
    pushRange(origStart)
  } else if (schedule.recurrence === 'yearly') {
    pushRange(clampDay(year, origStart.getMonth(), origStart.getDate()))
  } else {
    pushRange(clampDay(year, month, origStart.getDate()))
  }

  return [...new Set(dates)]
}

export function nextOccurrenceStart(schedule: Schedule, from = new Date()): Date {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const origStart = parseISODate(schedule.startDate)
  const span = rangeLength(schedule.startDate, schedule.endDate)

  const rangeContains = (start: Date) => {
    const end = new Date(start)
    end.setDate(start.getDate() + span)
    return fromDay >= start && fromDay <= end
  }

  if (schedule.recurrence === 'none') {
    return origStart
  }

  if (schedule.recurrence === 'yearly') {
    let candidate = clampDay(fromDay.getFullYear(), origStart.getMonth(), origStart.getDate())
    if (fromDay > new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + span)) {
      candidate = clampDay(fromDay.getFullYear() + 1, origStart.getMonth(), origStart.getDate())
    } else if (rangeContains(candidate)) {
      return fromDay
    }
    return candidate
  }

  let candidate = clampDay(fromDay.getFullYear(), fromDay.getMonth(), origStart.getDate())
  if (fromDay > new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + span)) {
    const nextMonth = new Date(fromDay.getFullYear(), fromDay.getMonth() + 1, 1)
    candidate = clampDay(nextMonth.getFullYear(), nextMonth.getMonth(), origStart.getDate())
  } else if (rangeContains(candidate)) {
    return fromDay
  }
  return candidate
}

export function compareUpcoming(a: Collection, b: Collection): number {
  const now = Date.now()
  const da = a.schedule ? nextOccurrenceStart(a.schedule).getTime() : 0
  const db = b.schedule ? nextOccurrenceStart(b.schedule).getTime() : 0
  const aPast = a.schedule?.recurrence === 'none' && da < now
  const bPast = b.schedule?.recurrence === 'none' && db < now
  if (aPast !== bPast) return aPast ? 1 : -1
  return da - db
}

export function monthCells(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null)
  for (let d = 1; d <= lastDate; d += 1) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
