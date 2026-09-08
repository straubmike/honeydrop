import { useEffect, useState } from 'react'

const COMPACT_QUERY = '(max-width: 860px)'

export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(COMPACT_QUERY).matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY)
    const sync = () => setCompact(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return compact
}
