import { getSupabase } from '../lib/supabase'

export type JoinCodeKind = 'invite' | 'recovery' | 'device_link'

export type JoinCodeStatus =
  | 'valid'
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'board_full'
  | 'seat_gone'

export type JoinCodeLookup = {
  kind: JoinCodeKind | null
  status: JoinCodeStatus
}

export function joinCodeErrorMessage(lookup: JoinCodeLookup): string {
  switch (lookup.status) {
    case 'not_found':
      return 'No board or code found with that value.'
    case 'expired':
      return lookup.kind === 'device_link'
        ? 'That code expired. Create a new one on your other device.'
        : 'That recovery code expired. Ask your partner for a new one.'
    case 'already_used':
      return lookup.kind === 'device_link'
        ? 'That code was already used.'
        : 'That recovery code was already used.'
    case 'board_full':
      return 'This board already has two people. If you lost access, ask your partner to open Invite → Partner lost access and send you a new code.'
    case 'seat_gone':
      return 'That partner seat is no longer on the board.'
    case 'valid':
      return ''
    default:
      return 'Could not check that code.'
  }
}

/** Pre-signup code check. Safe for anon — returns kind + status only. */
export async function lookupJoinCode(rawCode: string): Promise<JoinCodeLookup> {
  const code = rawCode.trim().toUpperCase()
  if (code.length < 4) {
    return { kind: null, status: 'not_found' }
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('lookup_join_code', { p_code: code })

  if (error) {
    const message = error.message ?? ''
    if (/Could not find the function|schema cache|does not exist/i.test(message)) {
      return { kind: null, status: 'not_found' }
    }
    throw new Error(message || 'Could not check that code.')
  }

  const payload = data as { kind?: string | null; status?: string } | null
  const kind =
    payload?.kind === 'invite' || payload?.kind === 'recovery' || payload?.kind === 'device_link'
      ? payload.kind
      : null
  const status = (payload?.status ?? 'not_found') as JoinCodeStatus
  const allowed: JoinCodeStatus[] = [
    'valid',
    'not_found',
    'expired',
    'already_used',
    'board_full',
    'seat_gone',
  ]
  return {
    kind,
    status: allowed.includes(status) ? status : 'not_found',
  }
}
