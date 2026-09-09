import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalBackdropProps {
  onClose: () => void
  children: ReactNode
}

/** Full-screen modal layer, portaled to `document.body` so nesting cannot bury it. */
export function ModalBackdrop({ onClose, children }: ModalBackdropProps) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      {children}
    </div>,
    document.body,
  )
}
