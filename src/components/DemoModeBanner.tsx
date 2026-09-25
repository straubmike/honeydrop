import { isDemoMode } from '../lib/supabase'

/** Unmissable banner when running without Supabase — never ship this as “live.” */
export function DemoModeBanner() {
  if (!isDemoMode) return null

  return (
    <div className="demo-mode-banner" role="status" aria-live="polite">
      <strong className="demo-mode-banner__title">LOCAL DEMO — NOT LIVE</strong>
      <span className="demo-mode-banner__body">
        Sample boards only. Nothing saves to the real Honey Drop database. Link previews use this
        computer’s preview server. When the UI checks out, say merge — production stays on real
        Supabase.
      </span>
    </div>
  )
}
