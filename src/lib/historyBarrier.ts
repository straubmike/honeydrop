import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type Context,
} from 'react'

const BARRIER_STATE_KEY = 'honeydropBarrier'

type HistoryState = Record<string, unknown> | null

/** Mounted modal/sheet barriers — App must not navigate while > 0. */
let barrierCount = 0

export function getHistoryBarrierCount(): number {
  return barrierCount
}

function readHistoryState(): HistoryState {
  const state = window.history.state
  if (state && typeof state === 'object') return state as Record<string, unknown>
  return null
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function isOwnBarrier(state: HistoryState, id: string): boolean {
  return Boolean(state && state[BARRIER_STATE_KEY] === id)
}

/**
 * Push a same-URL history entry while mounted so hardware Back / history.back()
 * closes the overlay and stays on the current page (lightbox-style).
 *
 * Uses the capture phase so Cancel runs before App route popstate handlers.
 * Nested barriers each get a unique id so Back closes the topmost first.
 * Returns `requestClose` — prefer it over raw onClose so the entry is popped.
 */
export function useHistoryBarrier(onClose: () => void): () => void {
  const onCloseRef = useRef(onClose)
  const id = useId()
  const closedByPopRef = useRef(false)
  const closingRef = useRef(false)
  const ownsEntryRef = useRef(false)
  const stayHrefRef = useRef(currentHref())

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    closedByPopRef.current = false
    closingRef.current = false
    ownsEntryRef.current = false
    stayHrefRef.current = currentHref()
    barrierCount += 1

    if (!isOwnBarrier(readHistoryState(), id)) {
      const prev = readHistoryState()
      window.history.pushState(
        { ...(prev ?? {}), [BARRIER_STATE_KEY]: id },
        '',
        stayHrefRef.current,
      )
      ownsEntryRef.current = true
    } else {
      ownsEntryRef.current = true
    }

    const onPop = () => {
      // Nested barriers: if our id is still the current entry, a child above us
      // was popped — leave this modal open.
      if (isOwnBarrier(readHistoryState(), id)) return
      closedByPopRef.current = true
      closingRef.current = true
      ownsEntryRef.current = false
      try {
        // Cancel: discard unsaved edits, save nothing — same as the Cancel button.
        onCloseRef.current()
      } catch (error) {
        console.error('History barrier onClose failed', error)
      }
      // App's bubble handler undoes any path overshoot while barrierCount > 0.
      // Do not pushState here — that fought route apply and left floating modals.
    }
    // Capture: close/cancel before App navigates the page underneath.
    window.addEventListener('popstate', onPop, true)
    return () => {
      window.removeEventListener('popstate', onPop, true)
      barrierCount = Math.max(0, barrierCount - 1)
      // Unmount without a pop (Cancel / save): drop the flag without history.back()
      // so we never skip past the underlying board / idea / event.
      if (!closedByPopRef.current && ownsEntryRef.current && isOwnBarrier(readHistoryState(), id)) {
        const prev = readHistoryState() ?? {}
        const next = { ...prev }
        delete next[BARRIER_STATE_KEY]
        window.history.replaceState(
          Object.keys(next).length ? next : null,
          '',
          currentHref(),
        )
        ownsEntryRef.current = false
      }
    }
  }, [id])

  return useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (ownsEntryRef.current && isOwnBarrier(readHistoryState(), id)) {
      window.history.back()
      return
    }
    ownsEntryRef.current = false
    closedByPopRef.current = true
    if (isOwnBarrier(readHistoryState(), id)) {
      const prev = readHistoryState() ?? {}
      const next = { ...prev }
      delete next[BARRIER_STATE_KEY]
      window.history.replaceState(
        Object.keys(next).length ? next : null,
        '',
        stayHrefRef.current,
      )
    }
    onCloseRef.current()
  }, [id])
}

const ModalCloseContext: Context<(() => void) | null> = createContext<(() => void) | null>(null)

export const ModalCloseProvider = ModalCloseContext.Provider

/** Prefer the barrier's requestClose when rendered inside ModalBackdrop. */
export function useModalClose(fallback: () => void): () => void {
  return useContext(ModalCloseContext) ?? fallback
}
