import type { ReactNode } from 'react'
import circleGif from '../assets/hint-circle.gif'

interface PencilHintProps {
  active: boolean
  text: string
  placement?: 'below' | 'below-end' | 'right'
  className?: string
  children: ReactNode
}

/**
 * Hand-drawn red circle + scribbled note layered over a control. The wrapper is always
 * rendered so toggling the hint never shifts layout; overlays ignore pointer events.
 */
export function PencilHint({
  active,
  text,
  placement = 'below',
  className,
  children,
}: PencilHintProps) {
  return (
    <span className={['pencil-hint', className].filter(Boolean).join(' ')}>
      {children}
      {active ? (
        <>
          <img className="pencil-hint__circle" src={circleGif} alt="" aria-hidden="true" />
          <span className={`pencil-hint__note pencil-hint__note--${placement}`} role="note">
            <span className="pencil-hint__beat">{text}</span>
          </span>
          <svg className="pencil-hint__defs" aria-hidden="true" focusable="false">
            <filter id="pencil-hint-grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" />
            </filter>
          </svg>
        </>
      ) : null}
    </span>
  )
}
