import { useCallback, useEffect, useState } from 'react'

const KEY = 'ideaboard.hints.v1'
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

export type HintStep = 'invite' | 'tabs'

type HintProgress = Record<HintStep, boolean>

const FRESH: HintProgress = { invite: false, tabs: false }
const FINISHED: HintProgress = { invite: true, tabs: true }

function readStored(): HintProgress | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HintProgress> & { name?: boolean }
    // Legacy rows may still have a `name` flag; ignore it and only keep invite/tabs.
    return { invite: !!parsed.invite, tabs: !!parsed.tabs }
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
 * First-run hints shown one at a time: invite a partner, then flip between
 * Calendar and Ideas. Users who already had boards before hints existed on
 * this device skip them entirely. Init waits for a real userId so welcome /
 * reclaim / device-link on a fresh browser is not marked fresh early.
 */
export function useOnboardingHints({
  ready,
  userId,
  hasBoards,
}: {
  ready: boolean
  userId: string
  hasBoards: boolean
}) {
  const [stored] = useState(readStored)
  const [done, setDone] = useState<HintProgress | null>(stored)

  // Decide once boards are loaded for a signed-in user whether this is returning.
  useEffect(() => {
    if (!ready || !userId || stored) return
    const initial = hasBoards ? FINISHED : FRESH
    saveProgress(initial)
    setDone((prev) => prev ?? initial)
    // Intentionally only the first ready+userId snapshot — boards created later must not skip hints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, stored])

  const complete = useCallback((step: HintStep) => {
    setDone((prev) => {
      if (!prev || prev[step]) return prev
      const next = { ...prev, [step]: true }
      saveProgress(next)
      return next
    })
  }, [])

  const current: HintStep | null = !done
    ? null
    : !done.invite
      ? 'invite'
      : !done.tabs
        ? 'tabs'
        : null

  return { current, complete }
}
