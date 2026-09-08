import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchLinkImageBlob } from '../linkPreview'
import type { Attachment } from '../types'
import { useMediaSrc } from './Media'

export type LightboxSlide =
  | { kind: 'attachment'; attachment: Attachment }
  | { kind: 'url'; url: string }

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
}

export function MediaLightbox({
  slides,
  index,
  onClose,
  onIndexChange,
  isCollectionCover = false,
  onSetCollectionCover,
}: MediaLightboxProps) {
  const count = slides.length
  const current = slides[((index % count) + count) % count]
  const canStep = count > 1
  const slideKey = current.kind === 'url' ? current.url : current.attachment.id

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (!canStep) return
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count)
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canStep, count, index, onClose, onIndexChange])

  return createPortal(
    <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={onClose}>
      <div className="media-lightbox__panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="media-lightbox__close" aria-label="Close" onClick={onClose}>
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
            {isCollectionCover ? 'Idea preview' : 'Use as idea preview'}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
