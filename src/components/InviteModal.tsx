import { useId, useState } from 'react'

interface InviteModalProps {
  boardTitle: string
  inviteCode: string
  hasPartner: boolean
  partnerName?: string
  onClose: () => void
}

export function InviteModal({
  boardTitle,
  inviteCode,
  hasPartner,
  partnerName,
  onClose,
}: InviteModalProps) {
  const headingId = useId()
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Copy this invite code:', inviteCode)
    }
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
          <h2 id={headingId}>Invite to {boardTitle}</h2>
        </header>

        {hasPartner ? (
          <p className="lede">
            {partnerName || 'Your partner'} is already on this board. New invites are full for now
            (two people per board).
          </p>
        ) : (
          <>
            <p className="lede">
              Send this code to your partner. They can join from the home screen with{' '}
              <strong>Join with code</strong>.
            </p>
            <div className="invite-code">
              <span className="invite-code__value">{inviteCode}</span>
              <button type="button" className="primary" onClick={() => void copyCode()}>
                {copied ? 'Copied' : 'Copy code'}
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
    </div>
  )
}
