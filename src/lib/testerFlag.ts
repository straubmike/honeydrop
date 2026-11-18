/** Persisted QA / tester marker for signup telemetry. */
export const TESTER_STORAGE_KEY = 'hd_tester'

/**
 * Read `?qa=` / `?tester=` from the URL and update localStorage.
 * - `?qa=1` or `?tester=1` → set `hd_tester=1`
 * - `?qa=0` → clear the flag
 * Safe to call on every boot; query params win over a prior stored value.
 */
export function syncTesterFlagFromUrl(search = typeof window !== 'undefined' ? window.location.search : ''): void {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(search)
    if (params.has('qa')) {
      const qa = params.get('qa')
      if (qa === '0') {
        localStorage.removeItem(TESTER_STORAGE_KEY)
        return
      }
      if (qa === '1') {
        localStorage.setItem(TESTER_STORAGE_KEY, '1')
        return
      }
    }
    if (params.get('tester') === '1') {
      localStorage.setItem(TESTER_STORAGE_KEY, '1')
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
