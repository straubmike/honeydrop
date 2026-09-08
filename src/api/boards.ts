import { createInviteCode } from '../lib/inviteCode'
import { getSupabase } from '../lib/supabase'
import type { Collection, GeoPoint, IdeaBoard, BoardMember } from '../types'

export type BoardRow = {
  id: string
  title: string
  invite_code: string
  collections: Collection[] | null
  pending_deletion: IdeaBoard['pendingDeletion'] | null
  created_at: string
  updated_at: string
}

export type MemberRow = {
  board_id: string
  user_id: string
  name: string
  location: GeoPoint | null
}

function memberFromRow(row: MemberRow): BoardMember {
  return {
    userId: row.user_id,
    name: row.name,
    location: row.location ?? undefined,
  }
}

export function boardFromRows(board: BoardRow, members: MemberRow[]): IdeaBoard {
  return {
    id: board.id,
    title: board.title,
    createdAt: board.created_at,
    updatedAt: board.updated_at,
    inviteCode: board.invite_code,
    members: members.map(memberFromRow),
    collections: Array.isArray(board.collections) ? board.collections : [],
    pendingDeletion: board.pending_deletion ?? undefined,
  }
}

export async function ensureAnonymousSession(): Promise<{ userId: string }> {
  const supabase = getSupabase()
  const { data: existing, error: existingError } = await supabase.auth.getSession()
  if (existingError) throw existingError
  if (existing.session?.user?.id) {
    return { userId: existing.session.user.id }
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user?.id) throw new Error('Anonymous sign-in failed')
  return { userId: data.user.id }
}

export async function loadProfile(userId: string): Promise<{ displayName: string }> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      display_name: 'You',
    })
    if (insertError) throw insertError
    return { displayName: 'You' }
  }
  return { displayName: data.display_name?.trim() || 'You' }
}

export async function updateProfileName(userId: string, displayName: string): Promise<void> {
  const supabase = getSupabase()
  const name = displayName.trim() || 'You'
  const { error } = await supabase.from('profiles').upsert({ id: userId, display_name: name })
  if (error) throw error
}

export async function fetchMyBoards(): Promise<IdeaBoard[]> {
  const supabase = getSupabase()
  const { data: memberships, error: memberError } = await supabase
    .from('board_members')
    .select('board_id')
  if (memberError) throw memberError

  const boardIds = [...new Set((memberships ?? []).map((row) => row.board_id as string))]
  if (!boardIds.length) return []

  const { data: boards, error: boardError } = await supabase
    .from('boards')
    .select('*')
    .in('id', boardIds)
    .order('updated_at', { ascending: false })
  if (boardError) throw boardError

  const { data: members, error: allMembersError } = await supabase
    .from('board_members')
    .select('*')
    .in('board_id', boardIds)
  if (allMembersError) throw allMembersError

  const membersByBoard = new Map<string, MemberRow[]>()
  for (const row of (members ?? []) as MemberRow[]) {
    const list = membersByBoard.get(row.board_id) ?? []
    list.push(row)
    membersByBoard.set(row.board_id, list)
  }

  return ((boards ?? []) as BoardRow[]).map((board) =>
    boardFromRows(board, membersByBoard.get(board.id) ?? []),
  )
}

export async function fetchBoard(boardId: string): Promise<IdeaBoard | null> {
  const supabase = getSupabase()
  const { data: board, error } = await supabase.from('boards').select('*').eq('id', boardId).maybeSingle()
  if (error) throw error
  if (!board) return null

  const { data: members, error: memberError } = await supabase
    .from('board_members')
    .select('*')
    .eq('board_id', boardId)
  if (memberError) throw memberError

  return boardFromRows(board as BoardRow, (members ?? []) as MemberRow[])
}

export async function createRemoteBoard(title: string, displayName: string): Promise<string> {
  const supabase = getSupabase()
  const invite = createInviteCode()
  const { data, error } = await supabase.rpc('create_board', {
    p_title: title.trim() || 'Ours',
    p_invite_code: invite,
    p_name: displayName.trim() || 'You',
  })
  if (error) throw error
  if (!data) throw new Error('create_board returned no id')
  return data as string
}

export async function joinRemoteBoard(
  code: string,
  displayName: string,
): Promise<{ ok: true; boardId: string } | { ok: false; reason: string }> {
  const supabase = getSupabase()
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) return { ok: false, reason: 'Enter an invite code.' }

  const { data, error } = await supabase.rpc('join_board', {
    p_code: trimmed,
    p_name: displayName.trim() || 'You',
  })

  if (error) {
    const message = error.message ?? ''
    if (message.includes('NOT_FOUND')) {
      return { ok: false, reason: 'No board found with that invite code.' }
    }
    if (message.includes('BOARD_FULL')) {
      return { ok: false, reason: 'This board already has two people.' }
    }
    return { ok: false, reason: message || 'Could not join that board.' }
  }

  if (!data) return { ok: false, reason: 'Could not join that board.' }
  return { ok: true, boardId: data as string }
}

export async function persistBoard(board: IdeaBoard): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('boards')
    .update({
      title: board.title,
      collections: board.collections,
      pending_deletion: board.pendingDeletion ?? null,
      updated_at: board.updatedAt,
    })
    .eq('id', board.id)
  if (error) throw error
}

export async function persistMyMembership(
  boardId: string,
  userId: string,
  patch: { name?: string; location?: GeoPoint | null },
): Promise<void> {
  const supabase = getSupabase()
  const updates: Record<string, unknown> = {}
  if (patch.name !== undefined) updates.name = patch.name.trim() || 'You'
  if (patch.location !== undefined) updates.location = patch.location
  if (!Object.keys(updates).length) return

  const { error } = await supabase
    .from('board_members')
    .update(updates)
    .eq('board_id', boardId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function deleteRemoteBoard(boardId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('boards').delete().eq('id', boardId)
  if (error) throw error
}

export function subscribeToBoards(
  boardIds: string[],
  onChange: (boardId: string) => void,
): () => void {
  if (!boardIds.length) return () => undefined
  const supabase = getSupabase()
  const channel = supabase
    .channel(`boards:${boardIds.slice().sort().join(',')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'boards' },
      (payload) => {
        const id = (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id
        if (id && boardIds.includes(id)) onChange(id)
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'board_members' },
      (payload) => {
        const id =
          (payload.new as { board_id?: string } | null)?.board_id ??
          (payload.old as { board_id?: string } | null)?.board_id
        if (id && boardIds.includes(id)) onChange(id)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
