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

/** Update the address bar without a full navigation. */
export function replacePath(path: string): void {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  if (`${window.location.pathname}${window.location.search}` === next) return
  window.history.replaceState(window.history.state, '', next)
}

export function pushPath(path: string): void {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  if (`${window.location.pathname}${window.location.search}` === next) return
  window.history.pushState(window.history.state, '', next)
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
