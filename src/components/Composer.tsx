import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import {
  classifyMedia,
  clipboardMediaFiles,
  hostFromUrl,
  MEDIA_ACCEPT,
  MAX_MEDIA_BYTES,
  normalizeUrl,
  parseEntryUrl,
  shortenUrlDisplay,
} from '../images'
import { fetchLinkPreview, fetchRemoteMediaFile } from '../linkPreview'
import type { MediaKind, NewItemInput } from '../types'

const EMOJIS = ['❤️', '👍', '🎉', '😍', '😂', '🔥', '👏', '🎂', '🎁', '✈️', '💡', '⭐']

interface PendingFile {
  id: string
  file: File
  url: string
  kind: MediaKind
}

interface ComposerProps {
  onAdd: (input: NewItemInput) => void | Promise<void>
  onDraw: () => void
}

export function Composer({ onAdd, onDraw }: ComposerProps) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'link' | 'media'>('text')
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [pending, setPending] = useState<PendingFile[]>([])
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [linkPreview, setLinkPreview] = useState<{
    title?: string
    files: File[]
    thumbs: string[]
    candidates: string[]
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const revokeAll = (files: PendingFile[]) => {
    for (const entry of files) {
      if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url)
    }
  }

  const resetExtras = () => {
    revokeAll(pending)
    if (linkPreview) {
      for (const thumb of linkPreview.thumbs) URL.revokeObjectURL(thumb)
    }
    setMode('text')
    setUrl('')
    setCaption('')
    setPending([])
    setLinkPreview(null)
    setMenuOpen(false)
  }

  const sendText = async (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    if (!content) return

    const entryUrl = parseEntryUrl(content)
    if (entryUrl) {
      setBusy(true)
      try {
        const file = await fetchRemoteMediaFile(entryUrl)
        if (file && classifyMedia(file)) {
          await onAdd({ type: classifyMedia(file)!, files: [file] })
          setText('')
          return
        }

        const preview = await fetchLinkPreview(entryUrl)
        await onAdd({
          type: 'link',
          content: entryUrl,
          caption: preview.title,
          files: preview.files,
          fileSource: 'preview',
          previewCandidates: preview.candidates,
        })
        setText('')
      } catch {
        try {
          await onAdd({ type: 'link', content: entryUrl })
          setText('')
        } catch {
          window.alert('Could not add that link.')
        }
      } finally {
        setBusy(false)
      }
      return
    }

    void onAdd({ type: 'text', content })
    setText('')
  }

  const openLinkEntry = (entryUrl: string) => {
    setText('')
    setUrl(entryUrl)
    setMode('link')
    setMenuOpen(false)
    void loadPreview(entryUrl)
  }

  const importMediaUrl = async (entryUrl: string) => {
    setText('')
    setLinkPreview(null)
    setPreviewBusy(true)
    try {
      const file = await fetchRemoteMediaFile(entryUrl)
      if (!file || !classifyMedia(file)) return false
      addFiles([file], { replace: true })
      return true
    } finally {
      setPreviewBusy(false)
    }
  }

  const handleBarPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const entryUrl = parseEntryUrl(event.clipboardData.getData('text/plain'))
    if (entryUrl) {
      event.preventDefault()
      void (async () => {
        if (await importMediaUrl(entryUrl)) return
        openLinkEntry(entryUrl)
      })()
      return
    }

    const pastedMedia = clipboardMediaFiles(event.clipboardData)
    if (pastedMedia.length) {
      event.preventDefault()
      setText('')
      setLinkPreview(null)
      addFiles(pastedMedia, { replace: true })
    }
  }

  const sendLink = async (event: FormEvent) => {
    event.preventDefault()
    const content = normalizeUrl(url)
    if (!content) return
    setBusy(true)
    try {
      const preview = linkPreview ?? (await fetchLinkPreview(content))
      await onAdd({
        type: 'link',
        content,
        caption: caption.trim() || preview.title,
        files: preview.files,
        fileSource: 'preview',
        previewCandidates: preview.candidates,
      })
      resetExtras()
    } catch {
      try {
        await onAdd({
          type: 'link',
          content,
          caption: caption.trim() || undefined,
        })
        resetExtras()
      } catch {
        window.alert('Could not add that link.')
      }
    } finally {
      setBusy(false)
    }
  }

  const loadPreview = async (raw: string) => {
    const content = normalizeUrl(raw)
    if (!content) {
      setLinkPreview(null)
      return
    }
    setPreviewBusy(true)
    try {
      const file = await fetchRemoteMediaFile(content)
      if (file && classifyMedia(file)) {
        setLinkPreview(null)
        setUrl('')
        addFiles([file], { replace: true })
        return
      }

      const preview = await fetchLinkPreview(content)
      setLinkPreview((prev) => {
        if (prev) for (const thumb of prev.thumbs) URL.revokeObjectURL(thumb)
        return {
          title: preview.title,
          files: preview.files,
          thumbs: preview.files.map((file) => URL.createObjectURL(file)),
          candidates: preview.candidates,
        }
      })
      setCaption((current) => current || preview.title || '')
    } finally {
      setPreviewBusy(false)
    }
  }

  const sendMedia = async (event: FormEvent) => {
    event.preventDefault()
    if (!pending.length) return
    setBusy(true)
    try {
      await onAdd({
        type: pending[0].kind,
        files: pending.map((entry) => entry.file),
        caption: caption.trim() || undefined,
      })
      resetExtras()
    } catch {
      window.alert('Could not save those files. Try smaller ones.')
    } finally {
      setBusy(false)
    }
  }

  const addFiles = (list: FileList | File[] | undefined, options?: { replace?: boolean }) => {
    if (!list?.length) return
    const next: PendingFile[] = []
    for (const file of Array.from(list)) {
      if (file.size > MAX_MEDIA_BYTES) {
        window.alert(`${file.name} is too large. Try something under 40 MB.`)
        continue
      }
      const kind = classifyMedia(file)
      if (!kind) {
        window.alert(`${file.name} isn’t a common web format.`)
        continue
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        kind,
      })
    }
    if (!next.length) return
    setPending((prev) => {
      if (options?.replace) {
        revokeAll(prev)
        return next
      }
      return [...prev, ...next]
    })
    setMode('media')
    setMenuOpen(false)
  }

  const removePending = (id: string) => {
    setPending((prev) => {
      const doomed = prev.find((entry) => entry.id === id)
      if (doomed?.url.startsWith('blob:')) URL.revokeObjectURL(doomed.url)
      const rest = prev.filter((entry) => entry.id !== id)
      if (!rest.length) setMode('text')
      return rest
    })
  }

  return (
    <div className="composer" ref={wrapRef}>
      {mode === 'link' ? (
        <form className="composer__panel" onSubmit={(event) => void sendLink(event)}>
          <p className="composer__label">Add a link</p>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={() => void loadPreview(url)}
            placeholder="https://…"
            autoFocus
          />
          {previewBusy ? <p className="muted">Looking for photos on the page…</p> : null}
          {linkPreview?.thumbs.length ? (
            <div className="composer__thumbs">
              {linkPreview.thumbs.map((thumb) => (
                <div key={thumb} className="composer__thumb">
                  <img src={thumb} alt="" />
                </div>
              ))}
            </div>
          ) : null}
          {linkPreview && !previewBusy && !linkPreview.thumbs.length ? (
            <p className="muted">No preview photos found — the link will still be saved.</p>
          ) : null}
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Optional note"
          />
          <div className="composer__row">
            <button type="button" className="ghost" onClick={resetExtras}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add link'}
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'media' ? (
        <form className="composer__panel" onSubmit={(event) => void sendMedia(event)}>
          <p className="composer__label">
            {pending.length === 1 ? 'Add to board' : `Add ${pending.length} files`}
          </p>
          <div className="composer__thumbs">
            {pending.map((entry) => (
              <div key={entry.id} className="composer__thumb">
                {entry.kind === 'image' ? (
                  <img src={entry.url} alt="" />
                ) : entry.kind === 'video' ? (
                  <video src={entry.url} muted playsInline />
                ) : (
                  <span>Audio</span>
                )}
                <button
                  type="button"
                  className="media-remove"
                  aria-label={`Remove ${entry.file.name}`}
                  onClick={() => removePending(entry.id)}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="composer__add-more" onClick={() => fileRef.current?.click()}>
              +
            </button>
          </div>
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Optional caption"
          />
          <div className="composer__row">
            <button type="button" className="ghost" onClick={resetExtras}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!pending.length || busy}>
              {busy ? 'Adding…' : 'Pin to board'}
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'text' ? (
        <form className="composer__bar" onSubmit={(event) => void sendText(event)}>
          <div className="composer__plus">
            <button
              type="button"
              className="plus-btn"
              aria-expanded={menuOpen}
              aria-label="Add media, link, or drawing"
              onClick={() => setMenuOpen((open) => !open)}
            >
              +
            </button>
            {menuOpen ? (
              <div className="plus-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    fileRef.current?.click()
                  }}
                >
                  Photo or video
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setMode('link')
                  }}
                >
                  Link
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onDraw()
                  }}
                >
                  Drawing
                </button>
              </div>
            ) : null}
          </div>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPaste={handleBarPaste}
            placeholder="Share a thought, paste a link, or paste a photo…"
          />
          <button type="submit" className="primary" disabled={!text.trim() || busy}>
            {busy ? 'Adding…' : 'Send'}
          </button>
        </form>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files ?? undefined)
          event.target.value = ''
        }}
      />
    </div>
  )
}

interface EmojiPickerProps {
  onPick: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div className="emoji-picker" ref={ref} role="listbox" aria-label="Reactions">
      {EMOJIS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onPick(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  )
}

export function LinkChip({
  url,
  caption,
  onRemove,
}: {
  url: string
  caption?: string
  onRemove?: () => void
}) {
  const label = caption?.trim() || shortenUrlDisplay(url)
  return (
    <div className="link-chip-wrap">
      <a className="link-chip" href={url} target="_blank" rel="noreferrer" title={url}>
        <span className="link-chip__host">{hostFromUrl(url)}</span>
        <span className="link-chip__url">{label}</span>
      </a>
      {onRemove ? (
        <button type="button" className="link-chip__remove" aria-label="Remove link" onClick={onRemove}>
          ×
        </button>
      ) : null}
    </div>
  )
}
