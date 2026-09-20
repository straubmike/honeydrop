import { uid } from './dates'

export type ListExtraMode = 'off' | 'qty' | 'money'

export interface ListEntry {
  id: string
  text: string
  note?: string
  qty?: number | null
  amount?: number | null
}

export interface ListData {
  mode: ListExtraMode
  entries: ListEntry[]
}

export type TextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string }

const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

function isListExtraMode(value: unknown): value is ListExtraMode {
  return value === 'off' || value === 'qty' || value === 'money'
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeEntry(raw: unknown): ListEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Partial<ListEntry>
  const text = typeof entry.text === 'string' ? entry.text : ''
  const note = typeof entry.note === 'string' ? entry.note : undefined
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : uid(),
    text,
    note: note || undefined,
    qty: asOptionalNumber(entry.qty),
    amount: asOptionalNumber(entry.amount),
  }
}

export function createListEntry(partial?: Partial<Omit<ListEntry, 'id'>>): ListEntry {
  return {
    id: uid(),
    text: partial?.text ?? '',
    note: partial?.note,
    qty: partial?.qty,
    amount: partial?.amount,
  }
}

export function emptyList(): ListData {
  return {
    mode: 'off',
    entries: [createListEntry()],
  }
}

export function parseList(raw: string): ListData | null {
  try {
    const data = JSON.parse(raw) as Partial<ListData>
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) return null
    const entries = data.entries.map(normalizeEntry).filter((entry): entry is ListEntry => entry != null)
    return {
      mode: isListExtraMode(data.mode) ? data.mode : 'off',
      entries,
    }
  } catch {
    return null
  }
}

export function stringifyList(data: ListData): string {
  return JSON.stringify(data)
}

/** Drop fully blank rows before persisting; keep structure otherwise. */
export function pruneList(data: ListData): ListData {
  const entries = data.entries.filter((entry) => {
    if (entry.text.trim()) return true
    if (entry.note?.trim()) return true
    if (data.mode === 'qty' && entry.qty != null && Number.isFinite(entry.qty)) return true
    if (data.mode === 'money' && entry.amount != null && Number.isFinite(entry.amount)) return true
    return false
  })
  return { mode: data.mode, entries }
}

export function sumMoney(data: ListData): number {
  if (data.mode !== 'money') return 0
  return data.entries.reduce((total, entry) => {
    const amount = entry.amount
    return total + (typeof amount === 'number' && Number.isFinite(amount) ? amount : 0)
  }, 0)
}

export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

export function formatQty(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

export function linkifySegments(text: string): TextSegment[] {
  if (!text) return []
  const segments: TextSegment[] = []
  let lastIndex = 0
  URL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = URL_RE.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    const value = match[0]
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`
    segments.push({ type: 'link', value, href })
    lastIndex = match.index + value.length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments.length ? segments : [{ type: 'text', value: text }]
}
