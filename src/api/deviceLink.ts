import { getSupabase } from '../lib/supabase'
import { rewriteBoardAuthorship } from '../lib/rewriteAuthorship'
import { fetchMyBoards, persistBoard } from './boards'

export async function createDeviceLinkCode(): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('create_device_link')
  if (error) {
    const message = error.message ?? ''
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      throw new Error(
        'Device linking is not set up yet. Run supabase/migrations/002_device_links.sql in the Supabase SQL editor.',
      )
    }
    throw new Error(message || 'Could not create a code.')
  }
  if (!data || typeof data !== 'string') throw new Error('Could not create a code.')
  return data
}

export async function claimDeviceLinkCode(
  rawCode: string,
): Promise<{ ok: true; fromUserId: string } | { ok: false; reason: string }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter a device code.' }

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('claim_device_link', { p_code: code })

  if (error) {
    const message = error.message ?? ''
    if (message.includes('NOT_FOUND')) return { ok: false, reason: 'No device link found with that code.' }
    if (message.includes('EXPIRED')) return { ok: false, reason: 'That code expired. Create a new one on your other device.' }
    if (message.includes('ALREADY_USED')) return { ok: false, reason: 'That code was already used.' }
    if (message.includes('INVALID_CODE')) return { ok: false, reason: 'Enter a valid device code.' }
    return { ok: false, reason: message || 'Could not link this device.' }
  }

  const payload = data as { from_user_id?: string; to_user_id?: string } | null
  const fromUserId = payload?.from_user_id
  const toUserId = payload?.to_user_id
  if (!fromUserId || !toUserId) {
    return { ok: false, reason: 'Could not link this device.' }
  }

  // Rewrite authorship on transferred boards so ownership UI stays correct
  const boards = await fetchMyBoards()
  await Promise.all(
    boards.map(async (board) => {
      const next = rewriteBoardAuthorship(board, fromUserId, toUserId)
      if (next === board) return
      const changed =
        JSON.stringify(next.collections) !== JSON.stringify(board.collections) ||
        JSON.stringify(next.pendingDeletion) !== JSON.stringify(board.pendingDeletion)
      if (changed) await persistBoard(next)
    }),
  )

  return { ok: true, fromUserId }
}
