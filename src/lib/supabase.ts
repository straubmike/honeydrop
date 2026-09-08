import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url?.trim() && anonKey?.trim())

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    client = createClient(url!.trim(), anonKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

export function getSupabaseAnonKey(): string {
  if (!anonKey?.trim()) throw new Error('Missing VITE_SUPABASE_ANON_KEY')
  return anonKey.trim()
}

export function getSupabaseUrl(): string {
  if (!url?.trim()) throw new Error('Missing VITE_SUPABASE_URL')
  return url.trim()
}
