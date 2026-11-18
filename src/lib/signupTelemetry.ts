import { getSupabase } from './supabase'
import { isTesterFlagSet } from './testerFlag'

export type DeviceType = 'phone' | 'tablet' | 'desktop'

export type ClientEnvironment = {
  userAgent: string
  deviceType: DeviceType
  browser: string
  os: string
  isStandalone: boolean
  referrer: string | null
}

export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayStandalone = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return displayStandalone || iosStandalone
}

export function parseClientEnvironment(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  referrer = typeof document !== 'undefined' ? document.referrer : '',
): ClientEnvironment {
  const ua = userAgent || ''
  const lower = ua.toLowerCase()

  let os = 'unknown'
  if (/iphone|ipad|ipod/.test(lower)) os = 'iOS'
  else if (/android/.test(lower)) os = 'Android'
  else if (/mac os x|macintosh/.test(lower)) os = 'macOS'
  else if (/windows/.test(lower)) os = 'Windows'
  else if (/cros/.test(lower)) os = 'Chrome OS'
  else if (/linux/.test(lower)) os = 'Linux'

  let browser = 'unknown'
  if (/edg\//.test(lower)) browser = 'Edge'
  else if (/opr\/|opera/.test(lower)) browser = 'Opera'
  else if (/firefox|fxios/.test(lower)) browser = 'Firefox'
  else if (/crios|chrome|chromium/.test(lower) && !/edg\//.test(lower)) browser = 'Chrome'
  else if (/safari/.test(lower) && !/chrome|chromium|crios|android/.test(lower)) browser = 'Safari'

  let deviceType: DeviceType = 'desktop'
  if (/ipad|tablet|playbook|silk/.test(lower) || (/android/.test(lower) && !/mobile/.test(lower))) {
    deviceType = 'tablet'
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(lower)) {
    deviceType = 'phone'
  }

  return {
    userAgent: ua,
    deviceType,
    browser,
    os,
    isStandalone: detectStandalone(),
    referrer: referrer?.trim() ? referrer.trim() : null,
  }
}

/**
 * Best-effort one-row signup insert. Never throws; safe to fire-and-forget
 * after a brand-new anonymous session.
 */
export async function recordAccountSignup(userId: string): Promise<void> {
  try {
    const env = parseClientEnvironment()
    const supabase = getSupabase()
    const { error } = await supabase.from('account_signups').upsert(
      {
        user_id: userId,
        user_agent: env.userAgent || null,
        device_type: env.deviceType,
        browser: env.browser,
        os: env.os,
        is_standalone: env.isStandalone,
        referrer: env.referrer,
        is_tester: isTesterFlagSet(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    if (error) {
      console.warn('[honeydrop] account signup telemetry skipped:', error.message)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[honeydrop] account signup telemetry skipped:', message)
  }
}
