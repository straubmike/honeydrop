import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function deviceEmail(userId: string): string {
  return `device-${userId.replace(/-/g, '')}@users.honeydrop.internal`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: 'Server is missing Supabase configuration.' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'NOT_AUTHENTICATED' })
  }

  let body: { code?: string }
  try {
    body = (await req.json()) as { code?: string }
  } catch {
    return json(400, { error: 'INVALID_BODY' })
  }

  const code = (body.code ?? '').trim().toUpperCase()
  if (code.length < 4) return json(400, { error: 'INVALID_CODE' })

  const claimerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user: claimer },
    error: claimerError,
  } = await claimerClient.auth.getUser()
  if (claimerError || !claimer?.id) return json(401, { error: 'NOT_AUTHENTICATED' })

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error: lookupError } = await admin
    .from('device_links')
    .select('code, user_id, expires_at, claimed_at')
    .eq('code', code)
    .maybeSingle()

  if (lookupError) return json(500, { error: lookupError.message })
  if (!row) return json(404, { error: 'NOT_FOUND' })
  if (row.claimed_at) return json(409, { error: 'ALREADY_USED' })
  if (new Date(row.expires_at).getTime() < Date.now()) return json(410, { error: 'EXPIRED' })

  const fromUserId = row.user_id as string

  if (fromUserId === claimer.id) {
    await admin
      .from('device_links')
      .update({ claimed_at: new Date().toISOString(), claimed_by: claimer.id })
      .eq('code', code)
    const { data: existing } = await claimerClient.auth.getSession()
    return json(200, {
      user_id: fromUserId,
      access_token: existing.session?.access_token ?? null,
      refresh_token: existing.session?.refresh_token ?? null,
      same_user: true,
    })
  }

  const email = deviceEmail(fromUserId)
  const { error: emailError } = await admin.auth.admin.updateUserById(fromUserId, {
    email,
    email_confirm: true,
  })
  if (emailError) {
    return json(500, { error: emailError.message || 'Could not prepare source account.' })
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return json(500, { error: linkError?.message || 'Could not create a login for the source account.' })
  }

  const sessionClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: verified, error: verifyError } = await sessionClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError || !verified.session) {
    return json(500, { error: verifyError?.message || 'Could not open a session for the source account.' })
  }

  const { error: claimUpdateError } = await admin
    .from('device_links')
    .update({
      claimed_at: new Date().toISOString(),
      claimed_by: claimer.id,
    })
    .eq('code', code)
    .is('claimed_at', null)

  if (claimUpdateError) {
    return json(500, { error: claimUpdateError.message })
  }

  // Best-effort: drop the temporary anonymous user from this device.
  try {
    await admin.auth.admin.deleteUser(claimer.id)
  } catch {
    /* ignore */
  }

  return json(200, {
    user_id: fromUserId,
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    same_user: false,
  })
})
