import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchLinkImageBlob } from '../linkPreview'
import type { Attachment } from '../types'
import { useMediaSrc } from './Media'

export type LightboxSlide =
  | { kind: 'attachment'; attachment: Attachment }
  | { kind: 'url'; url: string }

const LIGHTBOX_STATE_KEY = 'honeydropLightbox'

type HistoryState = Record<string, unknown> | null

function readHistoryState(): HistoryState {
  const state = window.history.state
  if (state && typeof state === 'object') return state as Record<string, unknown>
  return null
}

function isLightboxHistoryState(state: HistoryState): boolean {
  return Boolean(state && state[LIGHTBOX_STATE_KEY])
}

function useRemoteImageSrc(url: string): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined
    void fetchLinkImageBlob(url)
      .then((blob) => {
        if (cancelled) return
        if (!blob) {
          setSrc(null)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return src
}

function AttachmentLightboxSlide({ attachment }: { attachment: Attachment }) {
  const src = useMediaSrc(attachment.content, attachment.id)
  if (src === undefined) return <p className="muted">Loading…</p>
  if (!src) return <p className="muted">Media isn’t available on this device.</p>

  if (attachment.type === 'video') {
    return <video src={src} controls playsInline className="media-lightbox__media" />
  }
  if (attachment.type === 'audio') {
    return (
      <div className="media-lightbox__audio">
        <audio src={src} controls />
      </div>
    )
  }
  return <img src={src} alt="" className="media-lightbox__media" />
}

function UrlLightboxSlide({ url }: { url: string }) {
  const src = useRemoteImageSrc(url)
  if (src === undefined) return <p className="muted">Loading…</p>
  if (!src) return <p className="muted">Media isn’t available on this device.</p>
  return <img src={src} alt="" className="media-lightbox__media" />
}

function LightboxSlideView({ slide }: { slide: LightboxSlide }) {
  if (slide.kind === 'url') return <UrlLightboxSlide url={slide.url} />
  return <AttachmentLightboxSlide attachment={slide.attachment} />
}

interface MediaLightboxProps {
  slides: LightboxSlide[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
  isCollectionCover?: boolean
  onSetCollectionCover?: () => void
  /** Label context for the cover button (defaults to generic “preview”). */
  coverLabel?: 'idea' | 'event' | 'preview'
}

export function MediaLightbox({
  slides,
  index,
  onClose,
  onIndexChange,
  isCollectionCover = false,
  onSetCollectionCover,
  coverLabel = 'preview',
}: MediaLightboxProps) {
  const count = slides.length
  const current = slides[((index % count) + count) % count]
  const canStep = count > 1
  const slideKey = current.kind === 'url' ? current.url : current.attachment.id
  const onCloseRef = useRef(onClose)
  /** True after we consume the lightbox history entry (Back or guarded × / Escape). */
  const closedByPopRef = useRef(false)
  /** True once close was requested — blocks a second history.back(). */
  const closingRef = useRef(false)
  /** True when this mount pushed (or adopted) a lightbox history entry. */
  const ownsEntryRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Push a same-URL history entry so mobile Back closes the slideshow only
  // (collection /board/<id>/c/<collectionId> routing stays put).
  useEffect(() => {
    closedByPopRef.current = false
    closingRef.current = false
    ownsEntryRef.current = false

    if (!isLightboxHistoryState(readHistoryState())) {
      const prev = readHistoryState()
      window.history.pushState(
        { ...(prev ?? {}), [LIGHTBOX_STATE_KEY]: true },
        '',
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      )
      ownsEntryRef.current = true
    } else {
      ownsEntryRef.current = true
    }

    const onPop = () => {
      closedByPopRef.current = true
      closingRef.current = true
      ownsEntryRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Unmount without a pop (e.g. navigating away): drop the flag on this entry
      // without history.back() so we never skip past the idea/event.
      if (!closedByPopRef.current && ownsEntryRef.current && isLightboxHistoryState(readHistoryState())) {
        const prev = readHistoryState() ?? {}
        const next = { ...prev }
        delete next[LIGHTBOX_STATE_KEY]
        window.history.replaceState(
          Object.keys(next).length ? next : null,
          '',
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
        )
        ownsEntryRef.current = false
      }
    }
  }, [])

  const requestClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    // Only pop when our lightbox entry is still on the stack — never double-back.
    if (ownsEntryRef.current && isLightboxHistoryState(readHistoryState())) {
      window.history.back()
      return
    }
    ownsEntryRef.current = false
    onClose()
  }

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestCloseRef.current()
        return
      }
      if (!canStep) return
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count)
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canStep, count, index, onIndexChange])

  const coverNoun = coverLabel === 'idea' ? 'idea' : coverLabel === 'event' ? 'event' : ''
  const coverIdleLabel = coverNoun ? `Use as ${coverNoun} preview` : 'Use as preview'
  const coverActiveLabel = coverNoun ? `${coverNoun[0]!.toUpperCase()}${coverNoun.slice(1)} preview` : 'Preview'

  return createPortal(
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={requestClose}
    >
      <div className="media-lightbox__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="media-lightbox__close" aria-label="Close" onClick={requestClose}>
          ×
        </button>
        {canStep ? (
          <button
            type="button"
            className="media-lightbox__prev"
            aria-label="Previous"
            onClick={() => onIndexChange((index - 1 + count) % count)}
          >
            ‹
          </button>
        ) : null}
        <div className="media-lightbox__stage">
          <LightboxSlideView key={slideKey} slide={current} />
        </div>
        {canStep ? (
          <button
            type="button"
            className="media-lightbox__next"
            aria-label="Next"
            onClick={() => onIndexChange((index + 1) % count)}
          >
            ›
          </button>
        ) : null}
        {canStep ? (
          <p className="media-lightbox__counter">
            {index + 1} / {count}
          </p>
        ) : null}
        {onSetCollectionCover ? (
          <button
            type="button"
            className={[
              'media-lightbox__cover',
              isCollectionCover ? 'media-lightbox__cover--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onSetCollectionCover}
          >
            {isCollectionCover ? coverActiveLabel : coverIdleLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
