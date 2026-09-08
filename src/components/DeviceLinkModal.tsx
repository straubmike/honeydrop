import { useEffect, useId, useState, type FormEvent } from 'react'

interface DeviceLinkModalProps {
  onClose: () => void
  onCreateCode: () => Promise<string>
  onClaimCode: (code: string) => Promise<{ ok: true } | { ok: false; reason: string }>
}

export function DeviceLinkModal({ onClose, onCreateCode, onClaimCode }: DeviceLinkModalProps) {
  const headingId = useId()
  const [tab, setTab] = useState<'share' | 'enter'>('share')
  const [code, setCode] = useState<string | null>(null)
  const [enterCode, setEnterCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (tab !== 'share') return
    let cancelled = false
    setBusy(true)
    setError('')
    void onCreateCode()
      .then((next) => {
        if (!cancelled) setCode(next)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not create a code.')
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [onCreateCode, tab])

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copy this device code:', code)
    }
  }

  const submitClaim = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    void onClaimCode(enterCode)
      .then((result) => {
        if (!result.ok) {
          setError(result.reason)
          return
        }
        setDone(true)
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-labelledby={headingId}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={headingId}>Use another device</h2>
        </header>

        <div className="device-link-tabs" role="tablist" aria-label="Device link">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'share'}
            className={tab === 'share' ? 'tab tab--on' : 'tab'}
            onClick={() => {
              setTab('share')
              setError('')
              setDone(false)
            }}
          >
            Show code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enter'}
            className={tab === 'enter' ? 'tab tab--on' : 'tab'}
            onClick={() => {
              setTab('enter')
              setError('')
              setDone(false)
            }}
          >
            Enter code
          </button>
        </div>

        {tab === 'share' ? (
          <>
            <p className="lede">
              On your other device, open Honey Drop and enter this code. Expires in 15 minutes.
            </p>
            {busy && !code ? <p className="muted">Creating code…</p> : null}
            {code ? (
              <div className="invite-code">
                <span className="invite-code__value">{code}</span>
                <button type="button" className="primary" onClick={() => void copyCode()}>
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>
            ) : null}
            {error ? <p className="field-error">{error}</p> : null}
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : done ? (
          <>
            <p className="lede">Linked. Your boards from the other device should appear on this one.</p>
            <div className="modal__actions">
              <button type="button" className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitClaim}>
            <p className="lede">
              Enter the code from your other device to have your boards visible here.
            </p>
            <label className="field">
              <span>Device code</span>
              <input
                value={enterCode}
                onChange={(event) => {
                  setEnterCode(event.target.value.toUpperCase())
                  setError('')
                }}
                placeholder="ABC123"
                maxLength={12}
                autoFocus
              />
            </label>
            {error ? <p className="field-error">{error}</p> : null}
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Linking…' : 'Link device'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** Browser-style desktop / mobile responsive toggle glyph. */
export function DeviceLinkIcon() {
  return (
    <svg className="device-link-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 17.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="12" y="10" width="9" height="10" rx="1.5" fill="var(--card)" stroke="currentColor" strokeWidth="1.75" />
      <path d="M14.5 18.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
