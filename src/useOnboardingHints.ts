import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'

const KEY = 'ideaboard.hints.v1'
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export type HintStep = 'name' | 'invite' | 'tabs'

type HintProgress = Record<HintStep, boolean>

const FRESH: HintProgress = { name: false, invite: false, tabs: false }
const FINISHED: HintProgress = { name: true, invite: true, tabs: true }

function readStored(): HintProgress | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HintProgress>
    return { name: !!parsed.name, invite: !!parsed.invite, tabs: !!parsed.tabs }
  } catch {
    return null
  }
}

function saveProgress(progress: HintProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Storage can be unavailable (private mode); hints just reappear next visit.
  }
}

export function isCustomName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed !== '' && trimmed.toLowerCase() !== 'you'
}

export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(TOUCH_QUERY).matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia(TOUCH_QUERY)
    const sync = () => setTouch(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return touch
}

/**
 * First-run hints shown one at a time: set your name, then invite a partner,
 * then flip between Calendar and Ideas. Users who already had boards before
 * hints existed on this device skip them entirely.
 */
export function useOnboardingHints({
  ready,
  hasBoards,
  displayName,
}: {
  ready: boolean
  hasBoards: boolean
  displayName: string
}) {
  const [stored] = useState(readStored)
  const [done, setDone] = useState<HintProgress | null>(stored)
  const nameFocused = useRef(false)

  // Decide once, with boards loaded, whether this is a returning user.
  useEffect(() => {
    if (!ready || stored) return
    const initial = hasBoards ? FINISHED : FRESH
    saveProgress(initial)
    setDone((prev) => prev ?? initial)
    // Intentionally only the first ready snapshot — boards created later must not skip hints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stored])

  const complete = useCallback((step: HintStep) => {
    setDone((prev) => {
      if (!prev || prev[step]) return prev
      const next = { ...prev, [step]: true }
      saveProgress(next)
      return next
    })
  }, [])

  const loaded = done !== null

  // Only count the name as set once the user is done typing it.
  useEffect(() => {
    if (loaded && !nameFocused.current && isCustomName(displayName)) complete('name')
  }, [complete, displayName, loaded])

  const nameInputProps = {
    onFocus: () => {
      nameFocused.current = true
    },
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
      nameFocused.current = false
      if (isCustomName(event.currentTarget.value)) complete('name')
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur()
    },
  }

  const current: HintStep | null = !done
    ? null
    : !done.name
      ? 'name'
      : !done.invite
        ? 'invite'
        : !done.tabs
          ? 'tabs'
          : null

  return { current, complete, nameInputProps }
}
