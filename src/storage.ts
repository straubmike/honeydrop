import type { AppState, IdeaBoard, LegacyBoardState } from './types'
import { seedState } from './seed'
import { uid } from './dates'

const KEY = 'ideaboard.v1'
const DEMO_PENDING_TITLE = 'Cabin plans'
const DEMO_PENDING_FLAG = 'ideaboard.demoPendingBoard.v1'

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

/** One-shot: add a partner-initiated pending-delete board for UI review. */
function withDemoPendingBoard(state: AppState): AppState {
  try {
    if (localStorage.getItem(DEMO_PENDING_FLAG)) return state
  } catch {
    return state
  }
  if (state.boards.some((board) => board.title === DEMO_PENDING_TITLE)) {
    try {
      localStorage.setItem(DEMO_PENDING_FLAG, '1')
    } catch {
      /* ignore */
    }
    return state
  }

  const partnerId =
    state.boards
      .flatMap((board) => board.members)
      .find((member) => member.userId !== state.userId)?.userId ?? uid()
  const partnerName =
    state.boards
      .flatMap((board) => board.members)
      .find((member) => member.userId === partnerId)?.name ?? 'Alex'
  const now = new Date().toISOString()

  const demo: IdeaBoard = {
    id: uid(),
    title: DEMO_PENDING_TITLE,
    createdAt: now,
    updatedAt: now,
    inviteCode: createInviteCode(),
    members: [
      { userId: state.userId, name: state.displayName.trim() || 'You' },
      { userId: partnerId, name: partnerName },
    ],
    collections: [],
    pendingDeletion: {
      requestedBy: partnerId,
      requestedAt: now,
    },
  }

  try {
    localStorage.setItem(DEMO_PENDING_FLAG, '1')
  } catch {
    /* ignore */
  }

  return { ...state, boards: [...state.boards, demo] }
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
      return withDemoPendingBoard({
        userId: parsed.userId?.trim() || uid(),
        displayName: parsed.displayName?.trim() || 'You',
        boards: parsed.boards,
      })
    }
    if (parsed.collections && Array.isArray(parsed.collections)) {
      return withDemoPendingBoard(migrateLegacy(parsed))
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
