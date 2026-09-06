import type { AppState, IdeaBoard, LegacyBoardState } from './types'
import { seedState } from './seed'
import { uid } from './dates'

const KEY = 'ideaboard.v1'

function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

export function createInviteCode(): string {
  return inviteCode()
}

function migrateLegacy(parsed: LegacyBoardState): AppState {
  const userId = uid()
  const displayName = parsed.displayName?.trim() || 'You'
  const partnerName = parsed.partnerName?.trim()
  const now = new Date().toISOString()
  const members = [{ userId, name: displayName }]
  if (partnerName && partnerName.toLowerCase() !== displayName.toLowerCase()) {
    members.push({ userId: uid(), name: partnerName })
  }
  const board: IdeaBoard = {
    id: uid(),
    title: parsed.boardTitle?.trim() || 'Ours',
    createdAt: now,
    updatedAt: now,
    inviteCode: createInviteCode(),
    members,
    collections: parsed.collections ?? [],
  }
  return { userId, displayName, boards: [board] }
}

export function loadApp(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as Partial<AppState> & LegacyBoardState
    if (Array.isArray(parsed.boards)) {
      return {
        userId: parsed.userId?.trim() || uid(),
        displayName: parsed.displayName?.trim() || 'You',
        boards: parsed.boards,
      }
    }
    if (parsed.collections && Array.isArray(parsed.collections)) {
      return migrateLegacy(parsed)
    }
    return seedState()
  } catch {
    return seedState()
  }
}

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
