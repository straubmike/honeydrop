import { useEffect, useId, useState } from 'react'
import { joinUrl, shareOrCopy } from '../lib/routes'
import { ModalBackdrop } from './ModalBackdrop'

interface InviteModalProps {
  boardTitle: string
  inviteCode: string
  hasPartner: boolean
  partnerName?: string
  onClose: () => void
  onCreateRecovery?: () => Promise<string>
}

export function InviteModal({
  boardTitle,
  inviteCode,
  hasPartner,
  partnerName,
  onClose,
  onCreateRecovery,
}: InviteModalProps) {
  const headingId = useId()
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  useEffect(() => {
    setRecoveryCode(null)
    setRecoveryError('')
  }, [hasPartner, inviteCode])

  const inviteLink = joinUrl(inviteCode)
  const recoveryLink = recoveryCode ? joinUrl(recoveryCode) : null

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copy this:', text)
    }
  }

  const shareText = async (text: string) => {
    try {
      const result = await shareOrCopy(text, `Join ${boardTitle} on Honey Drop`)
      if (result === 'shared' || result === 'copied') {
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
      }
    } catch {
      /* user aborted share sheet */
    }
  }

  const startRecovery = () => {
    if (!onCreateRecovery) return
    setRecoveryBusy(true)
    setRecoveryError('')
    void onCreateRecovery()
      .then((code) => setRecoveryCode(code))
      .catch((err) => {
        setRecoveryError(err instanceof Error ? err.message : 'Could not create a recovery code.')
      })
      .finally(() => setRecoveryBusy(false))
  }

  const partnerLabel = partnerName?.trim() || 'your partner'

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby={headingId}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={headingId}>{hasPartner ? 'Recovery Code' : `Invite to ${boardTitle}`}</h2>
        </header>

        {hasPartner ? (
          <>
            <p className="lede">
              If {partnerLabel} has lost access to the board, generate and share with them a recovery
              code below.
            </p>
            {recoveryCode && recoveryLink ? (
              <>
                <div className="invite-code">
                  <span className="invite-code__value">{recoveryCode}</span>
                  <button type="button" className="primary" onClick={() => void copyText(recoveryCode)}>
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                <div className="invite-code" style={{ marginTop: '0.75rem' }}>
                  <span className="invite-code__value invite-code__value--link">{recoveryLink}</span>
                  <button type="button" className="primary" onClick={() => void shareText(recoveryLink)}>
                    {shared ? 'Shared' : 'Share link'}
                  </button>
                </div>
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  Code expires in about an hour.
                </p>
              </>
            ) : (
              <>
                {recoveryError ? <p className="field-error">{recoveryError}</p> : null}
                <div className="modal__actions" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={recoveryBusy || !onCreateRecovery}
                    onClick={startRecovery}
                  >
                    {recoveryBusy ? 'Creating…' : 'Generate recovery code'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="lede">
              Send this code or link to your partner. They can join from the home screen with{' '}
              <strong>Join with code</strong>, or open the link directly.
            </p>
            <div className="invite-code">
              <span className="invite-code__value">{inviteCode}</span>
              <button type="button" className="primary" onClick={() => void copyText(inviteCode)}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <div className="invite-code" style={{ marginTop: '0.75rem' }}>
              <span className="invite-code__value invite-code__value--link">{inviteLink}</span>
              <button type="button" className="primary" onClick={() => void shareText(inviteLink)}>
                {shared ? 'Shared' : 'Share link'}
              </button>
            </div>
          </>
        )}

        <div className="modal__actions">
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}
