import { getSupabase } from '../lib/supabase'
import { rewriteBoardAuthorship } from '../lib/rewriteAuthorship'
import { fetchBoard, persistBoard } from './boards'

export async function createSeatRecoveryCode(boardId: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('create_seat_recovery', {
    p_board_id: boardId,
  })
  if (error) {
    const message = error.message ?? ''
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      throw new Error(
        'Seat recovery is not set up yet. Run supabase/migrations/003_seat_recovery.sql in the Supabase SQL editor.',
      )
    }
    if (message.includes('NOT_MEMBER')) throw new Error('You are not on this board.')
    if (message.includes('NO_PARTNER')) throw new Error('There is no partner seat to recover yet.')
    throw new Error(message || 'Could not create a recovery code.')
  }
  if (!data || typeof data !== 'string') throw new Error('Could not create a recovery code.')
  return data
}

export async function claimSeatRecoveryCode(
  rawCode: string,
  displayName: string,
): Promise<
  | { ok: true; boardId: string; fromUserId: string; toUserId: string }
  | { ok: false; reason: string }
> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter an invite code.' }

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('claim_seat_recovery', {
    p_code: code,
    p_name: displayName.trim() || 'You',
  })

  if (error) {
    const message = error.message ?? ''
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      return { ok: false, reason: 'No board found with that invite code.' }
    }
    if (message.includes('NOT_FOUND')) return { ok: false, reason: 'No board found with that invite code.' }
    if (message.includes('EXPIRED')) {
      return { ok: false, reason: 'That recovery code expired. Ask your partner for a new one.' }
    }
    if (message.includes('ALREADY_USED')) {
      return { ok: false, reason: 'That recovery code was already used.' }
    }
    if (message.includes('OWN_CODE')) {
      return { ok: false, reason: 'Use this code on the device that lost access, not your own.' }
    }
    if (message.includes('ALREADY_MEMBER')) {
      return { ok: false, reason: 'You are already on this board.' }
    }
    if (message.includes('SEAT_GONE')) {
      return { ok: false, reason: 'That partner seat is no longer on the board.' }
    }
    if (message.includes('INVALID_CODE')) return { ok: false, reason: 'Enter a valid invite code.' }
    return { ok: false, reason: message || 'Could not reclaim that seat.' }
  }

  const payload = data as {
    board_id?: string
    from_user_id?: string
    to_user_id?: string
  } | null

  const boardId = payload?.board_id
  const fromUserId = payload?.from_user_id
  const toUserId = payload?.to_user_id
  if (!boardId || !fromUserId || !toUserId) {
    return { ok: false, reason: 'Could not reclaim that seat.' }
  }

  const board = await fetchBoard(boardId)
  if (board) {
    const next = rewriteBoardAuthorship(board, fromUserId, toUserId)
    const changed =
      JSON.stringify(next.collections) !== JSON.stringify(board.collections) ||
      JSON.stringify(next.pendingDeletion) !== JSON.stringify(board.pendingDeletion)
    if (changed) await persistBoard(next)
  }

  return { ok: true, boardId, fromUserId, toUserId }
}
