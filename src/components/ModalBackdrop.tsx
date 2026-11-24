import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseProvider, useHistoryBarrier, useModalClose } from '../lib/historyBarrier'

interface ModalBackdropProps {
  onClose: () => void
  children: ReactNode
}

/** Full-screen modal layer, portaled to `document.body` so nesting cannot bury it. */
export function ModalBackdrop({ onClose, children }: ModalBackdropProps) {
  const requestClose = useHistoryBarrier(onClose)

  return createPortal(
    <ModalCloseProvider value={requestClose}>
      <div className="modal-backdrop" onClick={requestClose} role="presentation">
        {children}
      </div>
    </ModalCloseProvider>,
    document.body,
  )
}

/** Cancel / Close control that pops the modal history barrier (same as hardware Back). */
export function ModalDismissButton({
  onClose,
  children,
  ...rest
}: {
  onClose: () => void
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const close = useModalClose(onClose)
  return (
    <button type="button" {...rest} onClick={close}>
      {children}
    </button>
  )
}
