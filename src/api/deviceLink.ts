import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from '../lib/supabase'

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
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter a device code.' }

  const supabase = getSupabase()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    return { ok: false, reason: 'You need to be signed in to link a device.' }
  }

  let response: Response
  try {
    response = await fetch(`${getSupabaseUrl()}/functions/v1/device-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: getSupabaseAnonKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { ok: false, reason: 'Could not reach the linking service. Try again in a moment.' }
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: string
    user_id?: string
    access_token?: string | null
    refresh_token?: string | null
    same_user?: boolean
  } | null

  if (!response.ok) {
    const err = payload?.error ?? ''
    if (err.includes('NOT_FOUND')) return { ok: false, reason: 'No device link found with that code.' }
    if (err.includes('EXPIRED')) {
      return { ok: false, reason: 'That code expired. Create a new one on your other device.' }
    }
    if (err.includes('ALREADY_USED')) return { ok: false, reason: 'That code was already used.' }
    if (err.includes('INVALID_CODE')) return { ok: false, reason: 'Enter a valid device code.' }
    if (response.status === 404 || /function|not found|Failed to fetch/i.test(err)) {
      return {
        ok: false,
        reason:
          'Device linking service is not deployed yet. Ask Mike to deploy the device-link function.',
      }
    }
    return { ok: false, reason: err || 'Could not link this device.' }
  }

  const userId = payload?.user_id
  const accessToken = payload?.access_token
  const refreshToken = payload?.refresh_token
  if (!userId) return { ok: false, reason: 'Could not link this device.' }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { ok: false, reason: error.message || 'Could not switch to the linked account.' }
  } else if (!payload?.same_user) {
    return { ok: false, reason: 'Could not switch to the linked account.' }
  }

  return { ok: true, userId }
}
