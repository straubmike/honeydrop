export type AppRoute =
  | { name: 'home' }
  | { name: 'join'; code: string }
  | { name: 'board'; boardId: string; collectionId?: string }

/** Parse location pathname into an app route. */
export function parsePath(pathname: string): AppRoute {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }

  if (parts[0] === 'join' && parts[1]) {
    return { name: 'join', code: parts[1].trim().toUpperCase() }
  }

  if (parts[0] === 'board' && parts[1]) {
    const boardId = parts[1]
    if (parts[2] === 'c' && parts[3]) {
      return { name: 'board', boardId, collectionId: parts[3] }
    }
    return { name: 'board', boardId }
  }

  return { name: 'home' }
}

export function homePath(): string {
  return '/'
}

export function joinPath(code: string): string {
  return `/join/${encodeURIComponent(code.trim().toUpperCase())}`
}

export function boardPath(boardId: string, collectionId?: string): string {
  if (collectionId) return `/board/${encodeURIComponent(boardId)}/c/${encodeURIComponent(collectionId)}`
  return `/board/${encodeURIComponent(boardId)}`
}

export function joinUrl(code: string): string {
  if (typeof window === 'undefined') return joinPath(code)
  return `${window.location.origin}${joinPath(code)}`
}

/** Keep existing `?src=` / `?qa=` (etc.) when the new path has no query of its own. */
function withPreservedSearch(path: string): string {
  const next = path.startsWith('/') ? path : `/${path}`
  if (next.includes('?') || typeof window === 'undefined' || !window.location.search) {
    return next
  }
  return `${next}${window.location.search}`
}

/** History state flag: this entry was pushed when opening an idea/event from its board. */
export const COLLECTION_HISTORY_KEY = 'honeydropCollection'

type HistoryState = Record<string, unknown> | null

function readHistoryState(): HistoryState {
  const state = window.history.state
  if (state && typeof state === 'object') return state as Record<string, unknown>
  return null
}

function mergeHistoryState(patch?: Record<string, unknown> | null): HistoryState {
  const prev = readHistoryState() ?? {}
  if (!patch) return Object.keys(prev).length ? prev : null
  const next: Record<string, unknown> = { ...prev }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  return Object.keys(next).length ? next : null
}

/** Update the address bar without a full navigation. */
export function replacePath(path: string, statePatch?: Record<string, unknown> | null): void {
  if (typeof window === 'undefined') return
  const next = withPreservedSearch(path)
  const state = statePatch === undefined ? window.history.state : mergeHistoryState(statePatch)
  if (`${window.location.pathname}${window.location.search}` === next) {
    if (statePatch !== undefined) window.history.replaceState(state, '', next)
    return
  }
  window.history.replaceState(state, '', next)
}

export function pushPath(path: string, statePatch?: Record<string, unknown> | null): void {
  if (typeof window === 'undefined') return
  const next = withPreservedSearch(path)
  if (`${window.location.pathname}${window.location.search}` === next) return
  window.history.pushState(mergeHistoryState(statePatch ?? null), '', next)
}

export function historyHasCollectionEntry(collectionId: string): boolean {
  const state = readHistoryState()
  return Boolean(state && state[COLLECTION_HISTORY_KEY] === collectionId)
}

export async function shareOrCopy(text: string, title = 'Honey Drop'): Promise<'shared' | 'copied' | 'prompted'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url: text.startsWith('http') ? text : undefined })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      /* fall through to clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    window.prompt('Copy this link:', text)
    return 'prompted'
  }
}
