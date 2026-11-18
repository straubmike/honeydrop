/** Persisted QA / tester marker for signup telemetry. */
export const TESTER_STORAGE_KEY = 'hd_tester'

/** First-touch `?src=` attribution, kept until (and written at) signup. */
export const SRC_STORAGE_KEY = 'hd_src'

/**
 * Read signup attribution params from the URL and update localStorage.
 * - `?qa=1` or `?tester=1` → set `hd_tester=1`
 * - `?qa=0` → clear the tester flag
 * - `?src=…` → store first-touch value in `hd_src` (does not overwrite an existing value)
 * Safe to call on every boot; qa/tester query params win over a prior stored tester value.
 */
export function syncTesterFlagFromUrl(search = typeof window !== 'undefined' ? window.location.search : ''): void {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(search)

    if (params.has('qa')) {
      const qa = params.get('qa')
      if (qa === '0') {
        localStorage.removeItem(TESTER_STORAGE_KEY)
      } else if (qa === '1') {
        localStorage.setItem(TESTER_STORAGE_KEY, '1')
      }
    } else if (params.get('tester') === '1') {
      localStorage.setItem(TESTER_STORAGE_KEY, '1')
    }

    const src = params.get('src')?.trim()
    if (src && !localStorage.getItem(SRC_STORAGE_KEY)) {
      localStorage.setItem(SRC_STORAGE_KEY, src)
    }
  } catch {
    /* ignore storage / URL errors */
  }
}

export function isTesterFlagSet(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(TESTER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function getStoredSrc(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(SRC_STORAGE_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}
