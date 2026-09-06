import { useEffect, useState } from 'react'
import { getMedia, isStoredMedia } from '../mediaStore'
import type { CollectionCover } from '../attachments'
import type { Attachment } from '../types'

export function useMediaSrc(content: string, id: string): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(() =>
    isStoredMedia(content) ? undefined : content,
  )

  useEffect(() => {
    if (!isStoredMedia(content)) {
      setSrc(content)
      return
    }

    let cancelled = false
    let objectUrl: string | undefined
    void getMedia(id).then((blob) => {
      if (cancelled) return
      if (!blob) {
        setSrc(null)
        return
      }
      objectUrl = URL.createObjectURL(blob)
      if (cancelled) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      setSrc(objectUrl)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [content, id])

  return src
}

export function MediaPart({
  attachment,
  onRemove,
  onOpen,
}: {
  attachment: Attachment
  onRemove?: () => void
  onOpen?: () => void
}) {
  const src = useMediaSrc(attachment.content, attachment.id)
  if (src === undefined) return <figure className="polaroid polaroid--pending" aria-hidden="true" />
  if (!src) return <p className="muted">Media isn’t available on this device.</p>

  const media =
    attachment.type === 'video' ? (
      <video src={src} playsInline preload="metadata" {...(onOpen ? {} : { controls: true })} />
    ) : attachment.type === 'audio' ? (
      <audio src={src} controls preload="metadata" />
    ) : (
      <img src={src} alt="" />
    )

  const body =
    onOpen && attachment.type !== 'audio' ? (
      <button type="button" className="polaroid__open" onClick={onOpen} aria-label="View full size">
        {media}
      </button>
    ) : (
      media
    )

  if (attachment.type === 'audio') {
    return (
      <div className="audio-card">
        {onRemove ? (
          <button type="button" className="media-remove" onClick={onRemove} aria-label="Remove file">
            ×
          </button>
        ) : null}
        {onOpen ? (
          <button type="button" className="polaroid__open polaroid__open--audio" onClick={onOpen}>
            {media}
          </button>
        ) : (
          media
        )}
      </div>
    )
  }

  return (
    <figure className="polaroid">
      {body}
      {onRemove ? (
        <button type="button" className="media-remove" onClick={onRemove} aria-label="Remove file">
          ×
        </button>
      ) : null}
    </figure>
  )
}

export function MediaThumb({ attachment, className }: { attachment: Attachment; className?: string }) {
  const src = useMediaSrc(attachment.content, attachment.id)
  if (!src) return <div className={className} aria-hidden="true" />
  if (attachment.type === 'video') {
    return <video src={src} muted playsInline preload="metadata" className={className} />
  }
  if (attachment.type !== 'image') return <div className={className} aria-hidden="true" />
  return <img src={src} alt="" className={className} />
}

function useRemoteCoverSrc(url: string): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined
    void fetch(`/api/link-image?url=${encodeURIComponent(url)}`)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled) return
        if (!blob || blob.size < 80) {
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

export function CollectionCoverThumb({
  cover,
  className,
}: {
  cover: CollectionCover
  className?: string
}) {
  if (cover.kind === 'attachment') {
    return <MediaThumb attachment={cover.attachment} className={className} />
  }

  const src = useRemoteCoverSrc(cover.url)
  if (src === undefined || !src) return <div className={className} aria-hidden="true" />
  return <img src={src} alt="" className={className} />
}
