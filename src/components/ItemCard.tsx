import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { isMediaItem, isCollectionCoverPreview, itemLinkAttachments, itemMediaAttachments } from '../attachments'
import { relativeTime } from '../dates'
import {
  classifyMedia,
  clipboardMediaFiles,
  MEDIA_ACCEPT,
  normalizeUrl,
  parseEntryUrl,
} from '../images'
import { fetchRemoteMediaFile } from '../linkPreview'
import type { CollectionCoverPreview, Item } from '../types'
import { parseDrawing } from '../drawing'
import { EmojiPicker, LinkChip } from './Composer'
import { DrawingPreview } from './DrawingCanvas'
import { MediaLightbox, type LightboxSlide } from './MediaLightbox'
import { MediaPart } from './Media'

interface ItemCardProps {
  item: Item
  currentName: string
  dragging: boolean
  pin: { x: number; y: number; z: number }
  layout?: 'freeform' | 'flow'
  floating?: boolean
  onReact: (emoji: string) => void
  onReply: (text: string) => void
  onDelete: () => void
  onAddFiles: (files: File[]) => void
  onAddLink: (url: string) => void
  onRemoveFile: (attachmentId: string) => void
  onCaption: (caption: string) => void
  onContent: (content: string) => void
  onCyclePreview: (direction: 'forward' | 'backward') => void | Promise<void>
  onDragHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onBringToFront: () => void
  collectionCoverPreview?: CollectionCoverPreview
  onSetCollectionCover: (cover: CollectionCoverPreview) => void
  onEditDrawing?: () => void
}

const CARD_INTERACTIVE =
  'button, a, input, textarea, select, video, audio, .polaroid__open, .link-chip, .caption-form, .item__link-form, .item__import, .reply-form, .emoji-picker, .reaction-wrap, .item__drawing-wrap'

function isCardBackgroundClick(target: EventTarget | null, card: HTMLElement): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target === card) return true
  return !target.closest(CARD_INTERACTIVE)
}

function CaptionEditor({
  value,
  placeholder,
  onSave,
}: {
  value?: string
  placeholder: string
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const skipBlur = useRef(false)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commit = () => {
    skipBlur.current = false
    const next = draft.trim()
    if (next !== (value ?? '').trim()) onSave(draft)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={value ? 'item__caption' : 'item__caption item__caption--empty'}
        onClick={() => setEditing(true)}
      >
        {value || placeholder}
      </button>
    )
  }

  return (
    <form
      className="caption-form"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label="Caption"
        autoFocus
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false
            return
          }
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            skipBlur.current = true
            setDraft(value ?? '')
            setEditing(false)
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </form>
  )
}

export function ItemCard({
  item,
  currentName,
  dragging,
  pin,
  layout = 'freeform',
  floating = false,
  onReact,
  onReply,
  onDelete,
  onAddFiles,
  onAddLink,
  onRemoveFile,
  onCaption,
  onContent,
  onCyclePreview,
  onDragHandlePointerDown,
  onBringToFront,
  collectionCoverPreview,
  onSetCollectionCover,
  onEditDrawing,
}: ItemCardProps) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [textDraft, setTextDraft] = useState(item.content)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importDraft, setImportDraft] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [cycling, setCycling] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const skipTextBlur = useRef(false)

  const cyclePreview = (direction: 'forward' | 'backward') => {
    setCycling(true)
    void (async () => {
      try {
        await onCyclePreview(direction)
      } finally {
        setCycling(false)
      }
    })()
  }
  const mine = item.author.trim() === currentName.trim()
  const media = itemMediaAttachments(item)
  const extraLinks = itemLinkAttachments(item)
  const previewCandidates = item.previewCandidates ?? []
  const lightboxUsesCandidates = item.type === 'link' && previewCandidates.length > 0
  const lightboxSlides = useMemo<LightboxSlide[]>(() => {
    if (lightboxUsesCandidates) {
      return previewCandidates.map((url) => ({ kind: 'url', url }))
    }
    return media.map((attachment) => ({ kind: 'attachment', attachment }))
  }, [lightboxUsesCandidates, media, previewCandidates])

  const openLightboxAt = (mediaIndex: number) => {
    if (lightboxUsesCandidates) {
      const base = item.previewIndex ?? 0
      setLightboxIndex((base + mediaIndex) % previewCandidates.length)
      return
    }
    setLightboxIndex(mediaIndex)
  }

  const currentLightboxSlide =
    lightboxIndex !== null ? lightboxSlides[lightboxIndex] ?? null : null

  const coverForCurrentSlide = useMemo((): CollectionCoverPreview | null => {
    if (!currentLightboxSlide) return null
    if (currentLightboxSlide.kind === 'url') {
      return { itemId: item.id, candidateUrl: currentLightboxSlide.url }
    }
    if (
      currentLightboxSlide.attachment.type === 'image' ||
      currentLightboxSlide.attachment.type === 'video'
    ) {
      return { itemId: item.id, attachmentId: currentLightboxSlide.attachment.id }
    }
    return null
  }, [currentLightboxSlide, item.id])

  const isCollectionCover =
    coverForCurrentSlide != null &&
    isCollectionCoverPreview(collectionCoverPreview, item.id, coverForCurrentSlide)
  const showCaption = media.length > 0 || item.type === 'link'
  const canSeeMore = item.type === 'link' && (item.previewCandidates?.length ?? 0) > 2
  const drawing = item.type === 'drawing' ? parseDrawing(item.content) : null

  useEffect(() => {
    setTextDraft(item.content)
  }, [item.content])

  const sendReply = (event: FormEvent) => {
    event.preventDefault()
    const text = replyText.trim()
    if (!text) return
    onReply(text)
    setReplyText('')
    setReplyOpen(true)
  }

  const saveText = () => {
    const next = textDraft.trim()
    if (next && next !== item.content) onContent(next)
    else setTextDraft(item.content)
    setEditingText(false)
  }

  const addLink = (event: FormEvent) => {
    event.preventDefault()
    const url = normalizeUrl(linkDraft)
    if (!url) return
    onAddLink(url)
    setLinkDraft('')
    setLinkOpen(false)
  }

  const closeImport = () => {
    setImportOpen(false)
    setImportDraft('')
    setImportBusy(false)
  }

  const importMediaFiles = (files: File[]) => {
    if (!files.length) return
    onAddFiles(files)
    closeImport()
  }

  const importFromUrl = async (raw: string) => {
    const url = parseEntryUrl(raw)
    if (!url) {
      window.alert('Paste a direct photo or video link.')
      return
    }
    setImportBusy(true)
    try {
      const file = await fetchRemoteMediaFile(url)
      if (!file || !classifyMedia(file)) {
        window.alert('That link is not a photo or video file.')
        return
      }
      importMediaFiles([file])
    } finally {
      setImportBusy(false)
    }
  }

  const submitImportPaste = (event: FormEvent) => {
    event.preventDefault()
    void importFromUrl(importDraft)
  }

  const handleImportPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const url = parseEntryUrl(event.clipboardData.getData('text/plain'))
    if (url) {
      event.preventDefault()
      setImportDraft(url)
      void importFromUrl(url)
      return
    }

    const pastedMedia = clipboardMediaFiles(event.clipboardData)
    if (pastedMedia.length) {
      event.preventDefault()
      importMediaFiles(pastedMedia)
    }
  }

  return (
    <article
      className={[
        'item',
        layout === 'flow' ? 'item--flow' : '',
        floating ? 'item--floating' : '',
        dragging ? 'item--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-item-id={item.id}
      style={
        layout === 'freeform'
          ? { left: pin.x, top: pin.y, zIndex: dragging ? 10000 : pin.z }
          : floating
            ? { zIndex: 10000 }
            : undefined
      }
      onPointerDown={(event) => {
        if (event.button !== 0 || dragging || layout === 'flow') return
        if (isCardBackgroundClick(event.target, event.currentTarget)) onBringToFront()
      }}
    >
      <header className="item__meta">
        <button
          type="button"
          className="item__grip"
          aria-label={layout === 'flow' ? 'Long-press to reorder' : 'Drag anywhere on the board'}
          onPointerDown={onDragHandlePointerDown}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <strong>{item.author}</strong>
        <span>{relativeTime(item.createdAt)}</span>
        {mine ? (
          <button
            type="button"
            className="text-btn item__remove"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            Remove
          </button>
        ) : null}
      </header>

      {media.length ? (
        <div className="item__media-block">
          <div className={media.length > 1 ? 'media-grid' : 'media-single'}>
            {media.map((part, mediaIndex) => (
              <MediaPart
                key={part.id}
                attachment={part}
                onOpen={() => openLightboxAt(mediaIndex)}
                onRemove={mine ? () => onRemoveFile(part.id) : undefined}
              />
            ))}
          </div>
          {lightboxIndex !== null ? (
            <MediaLightbox
              slides={lightboxSlides}
              index={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onIndexChange={setLightboxIndex}
              isCollectionCover={isCollectionCover}
              onSetCollectionCover={
                coverForCurrentSlide
                  ? () => onSetCollectionCover(coverForCurrentSlide)
                  : undefined
              }
            />
          ) : null}
          {canSeeMore ? (
            <div className="item__preview-nav">
              <button
                type="button"
                className="text-btn item__preview-nav-btn"
                disabled={cycling}
                onClick={() => cyclePreview('backward')}
              >
                {cycling ? 'Loading…' : 'See previous'}
              </button>
              <button
                type="button"
                className="text-btn item__preview-nav-btn"
                disabled={cycling}
                onClick={() => cyclePreview('forward')}
              >
                {cycling ? 'Loading…' : 'See more'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {item.type === 'link' ? (
        <div className="item__links">
          <LinkChip url={item.content} />
          {extraLinks.map((link) => (
            <LinkChip
              key={link.id}
              url={link.content}
              onRemove={mine ? () => onRemoveFile(link.id) : undefined}
            />
          ))}
        </div>
      ) : null}

      {showCaption ? (
        <CaptionEditor value={item.caption} placeholder="Add a caption" onSave={onCaption} />
      ) : null}

      {item.type === 'drawing' ? (
        <button type="button" className="item__drawing-wrap" onClick={onEditDrawing}>
          {drawing ? <DrawingPreview data={drawing} /> : <span className="muted">Drawing</span>}
        </button>
      ) : null}

      {item.type === 'text' ? (
        editingText ? (
          <form
            className="caption-form"
            onSubmit={(event) => {
              event.preventDefault()
              saveText()
            }}
          >
            <textarea
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              rows={3}
              autoFocus
              onBlur={() => {
                if (skipTextBlur.current) {
                  skipTextBlur.current = false
                  return
                }
                saveText()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  skipTextBlur.current = true
                  setTextDraft(item.content)
                  setEditingText(false)
                }
              }}
            />
          </form>
        ) : (
          <button type="button" className="item__text item__text--edit" onClick={() => setEditingText(true)}>
            {item.content}
          </button>
        )
      ) : null}

      {isMediaItem(item) || item.type === 'link' || item.type === 'drawing' ? (
        <div className="item__tools">
          {item.type === 'drawing' ? (
            <button type="button" className="text-btn" onClick={onEditDrawing}>
              Edit
            </button>
          ) : isMediaItem(item) ? (
            importOpen ? (
              <div className="item__import">
                <button
                  type="button"
                  className="ghost"
                  disabled={importBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  Import
                </button>
                <form className="item__link-form" onSubmit={submitImportPaste}>
                  <input
                    value={importDraft}
                    onChange={(event) => setImportDraft(event.target.value)}
                    onPaste={handleImportPaste}
                    placeholder="Paste a link or image…"
                    autoFocus
                    disabled={importBusy}
                  />
                  <button type="submit" className="ghost" disabled={!importDraft.trim() || importBusy}>
                    {importBusy ? 'Adding…' : 'Add'}
                  </button>
                  <button type="button" className="ghost" disabled={importBusy} onClick={closeImport}>
                    Cancel
                  </button>
                </form>
              </div>
            ) : (
              <button type="button" className="text-btn" onClick={() => setImportOpen(true)}>
                Add files
              </button>
            )
          ) : linkOpen ? (
            <form className="item__link-form" onSubmit={addLink}>
              <input
                value={linkDraft}
                onChange={(event) => setLinkDraft(event.target.value)}
                placeholder="https://…"
                autoFocus
              />
              <button type="submit" className="ghost" disabled={!linkDraft.trim()}>
                Add
              </button>
              <button type="button" className="ghost" onClick={() => setLinkOpen(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="text-btn" onClick={() => setLinkOpen(true)}>
              Add link
            </button>
          )}
        </div>
      ) : null}

      <footer className="item__social">
        <div className="reactions">
          {item.reactions.map((reaction) => {
            const active = reaction.authors.includes(currentName)
            return (
              <button
                key={reaction.emoji}
                type="button"
                className={active ? 'reaction reaction--on' : 'reaction'}
                title={reaction.authors.join(', ')}
                onClick={() => onReact(reaction.emoji)}
              >
                {reaction.emoji} {reaction.authors.length}
              </button>
            )
          })}
          <div className="reaction-wrap">
            <button
              type="button"
              className="reaction reaction--add"
              aria-label="Add reaction"
              onClick={() => setPickerOpen((open) => !open)}
            >
              ☺
            </button>
            {pickerOpen ? (
              <EmojiPicker
                onPick={(emoji) => {
                  onReact(emoji)
                  setPickerOpen(false)
                }}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
          </div>
        </div>
        <button type="button" className="text-btn item__reply-btn" onClick={() => setReplyOpen((open) => !open)}>
          {item.replies.length ? `Replies (${item.replies.length})` : 'Reply'}
        </button>
      </footer>

      {item.replies.length || replyOpen ? (
        <div className="replies">
          {item.replies.map((reply) => (
            <p key={reply.id} className="reply">
              <strong>{reply.author}</strong>
              <span className="muted"> {relativeTime(reply.createdAt)}</span>
              <br />
              {reply.text}
            </p>
          ))}
          {replyOpen ? (
            <form className="reply-form" onSubmit={sendReply}>
              <input
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="Write a reply…"
              />
              <button type="submit" className="ghost" disabled={!replyText.trim()}>
                Reply
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          if (files.length) importMediaFiles(files)
          event.target.value = ''
        }}
      />
    </article>
  )
}
