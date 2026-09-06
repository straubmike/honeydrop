import { useEffect, useRef, useState } from 'react'

export const LOCATION_HELP =
  'Enable Location Services on your Mobile or Browser + OS settings in order to get your current location. Else, you can search for any location and set it for yourself or events!'

export function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v3.25M12 18.25v3.25M2.5 12h3.25M18.25 12h3.25" />
        <circle cx="12" cy="12" r="5.5" />
      </g>
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
    </svg>
  )
}

export function LocateMeButton({
  busy,
  onClick,
}: {
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="ghost board-map__locate"
      disabled={busy}
      aria-label="Use my location"
      title="Use my location"
      onClick={onClick}
    >
      <LocateIcon />
    </button>
  )
}

export function LocationHelpButton() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const autoClose = window.setTimeout(() => setOpen(false), 10_000)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(autoClose)
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="location-help" ref={wrapRef}>
      <button
        type="button"
        className="ghost board-map__locate location-help__btn"
        aria-label="Location help"
        aria-expanded={open}
        title="Location help"
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open ? (
        <div className="location-help__pop" role="dialog" aria-label="Location help">
          <p>{LOCATION_HELP}</p>
        </div>
      ) : null}
    </div>
  )
}
