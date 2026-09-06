import { useId } from 'react'

/** Honey dipper — head on top, handle down; two-tone wood with tall narrow grooves. */
export function LocationPin({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="loc-pin"
      aria-label={`Show ${label} on the map`}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <BrandMark className="pin pin--inline" />
    </button>
  )
}

export function BrandMark({ className = 'pin' }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const light = `dipper-light-${uid}`
  const dark = `dipper-dark-${uid}`

  return (
    <svg
      className={className}
      viewBox="0 0 28 56"
      width="22"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={light} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0a84a" />
          <stop offset="100%" stopColor="#c9923a" />
        </linearGradient>
        <linearGradient id={dark} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c0562a" />
          <stop offset="100%" stopColor="#8f3a16" />
        </linearGradient>
      </defs>

      {/* compact rounded tip (light) — same width, less height */}
      <path
        fill={`url(#${light})`}
        d="M14 1.8c3.4 0 6 1.5 6 3.4 0 .7-.3 1.3-.8 1.8H8.8C8.3 6.5 8 5.9 8 5.2c0-1.9 2.6-3.4 6-3.4Z"
      />

      {/* shorter groove stack, still narrow */}
      <rect x="8.2" y="6.8" width="11.6" height="2.5" rx="1.2" fill={`url(#${dark})`} />
      <rect x="8.6" y="9.5" width="10.8" height="2.1" rx="1" fill={`url(#${light})`} />
      <rect x="7.8" y="11.8" width="12.4" height="2.5" rx="1.2" fill={`url(#${dark})`} />
      <rect x="8.4" y="14.5" width="11.2" height="2.1" rx="1" fill={`url(#${light})`} />
      <rect x="8" y="16.8" width="12" height="2.5" rx="1.2" fill={`url(#${dark})`} />

      {/* taper into handle */}
      <path
        fill={`url(#${dark})`}
        d="M9.2 19.5h9.6c.3 1.2-.4 2.3-1.7 2.9-.9.4-2 0-2.7 0s-1.8.4-2.7 0c-1.3-.6-2-1.7-1.7-2.9Z"
      />

      {/* longer handle */}
      <rect x="12.15" y="22.2" width="3.7" height="29.2" rx="1.7" fill={`url(#${dark})`} />
      <rect x="12.65" y="22.6" width="2.7" height="28.2" rx="1.35" fill={`url(#${light})`} />

      {/* end knob */}
      <ellipse cx="14" cy="52.8" rx="2.6" ry="1.7" fill={`url(#${dark})`} />
      <ellipse cx="14" cy="52.5" rx="1.7" ry="1" fill={`url(#${light})`} />
    </svg>
  )
}
