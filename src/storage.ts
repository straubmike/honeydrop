import type { AppState } from './types'
import { seedState } from './seed'
import { createInviteCode } from './lib/inviteCode'

export { createInviteCode }

const KEY = 'ideaboard.v1'

/** @deprecated Local-only fallback; cloud mode uses Supabase. */
export function loadApp(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (Array.isArray(parsed.boards)) {
      return {
        userId: parsed.userId?.trim() || seedState().userId,
        displayName: parsed.displayName?.trim() || 'You',
        boards: parsed.boards,
      }
    }
    return seedState()
  } catch {
    return seedState()
  }
}

/** @deprecated Local-only fallback; cloud mode uses Supabase. */
export function saveApp(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

/** @deprecated */
export function loadBoard(): AppState {
  return loadApp()
}

/** @deprecated */
export function saveBoard(state: AppState): void {
  saveApp(state)
}
