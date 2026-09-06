import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  formatLongDate,
  formatSchedule,
  nextOccurrenceStart,
  recurrenceLabel,
  toISODate,
} from '../dates'
import { boardExtent, resolvePin } from '../pins'
import type { Collection, CollectionCoverPreview, NewItemInput } from '../types'
import { Composer } from './Composer'
import { ItemCard } from './ItemCard'

interface CollectionDetailProps {
  collection: Collection
  currentName: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onAddItem: (input: NewItemInput, boardWidth: number) => void | Promise<void>
  onDeleteItem: (itemId: string) => void
  onMoveItem: (itemId: string, x: number, y: number, boardWidth: number) => void
  onBringItemToFront: (itemId: string) => void
  onAddFiles: (itemId: string, files: File[]) => void
  onAddLink: (itemId: string, url: string) => void
  onRemoveFile: (itemId: string, attachmentId: string) => void
  onReact: (itemId: string, emoji: string) => void
  onReply: (itemId: string, text: string) => void
  onCaption: (itemId: string, caption: string) => void
  onContent: (itemId: string, content: string) => void
  onCyclePreview: (itemId: string, direction: 'forward' | 'backward') => void | Promise<void>
  onSetCollectionCover: (cover: CollectionCoverPreview) => void
}

interface DragState {
  id: string
  x: number
  y: number
  originX: number
  originY: number
  pointerX: number
  pointerY: number
}

export function CollectionDetail({
  collection,
  currentName,
  onBack,
  onEdit,
  onDelete,
  onAddItem,
  onDeleteItem,
  onMoveItem,
  onBringItemToFront,
  onAddFiles,
  onAddLink,
  onRemoveFile,
  onReact,
  onReply,
  onCaption,
  onContent,
  onCyclePreview,
  onSetCollectionCover,
}: CollectionDetailProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [boardSize, setBoardSize] = useState({ w: 900, h: 560 })
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const measure = () => setBoardSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!drag?.id) return

    let finished = false

    const move = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const next = {
        ...current,
        x: Math.max(0, current.originX + event.clientX - current.pointerX),
        y: Math.max(0, current.originY + event.clientY - current.pointerY),
      }
      dragRef.current = next
      setDrag(next)
    }

    const end = () => {
      if (finished) return
      finished = true
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (current) onMoveItem(current.id, current.x, current.y, boardSize.w)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    document.body.classList.add('is-dragging')
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('is-dragging')
    }
  }, [drag?.id, boardSize.w, onMoveItem])

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string, pin: { x: number; y: number }) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next: DragState = {
      id,
      x: pin.x,
      y: pin.y,
      originX: pin.x,
      originY: pin.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    }
    dragRef.current = next
    setDrag(next)
  }

  const schedule = collection.schedule
  const occurrence = schedule ? toISODate(nextOccurrenceStart(schedule)) : null
  const repeat = schedule ? recurrenceLabel(schedule.recurrence) : null
  const extent = boardExtent(
    collection.items.map((item, index) => {
      const pin = resolvePin(item, index, boardSize.w)
      if (drag?.id === item.id) return { ...item, x: drag.x, y: drag.y }
      return { ...item, x: pin.x, y: pin.y }
    }),
    boardSize.w,
    boardSize.h,
  )

  return (
    <section className="detail">
      <header className="detail__top">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="detail__tools">
          <button type="button" className="ghost" onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className="ghost ghost--danger"
            onClick={() => {
              if (window.confirm(`Delete “${collection.title}”? This cannot be undone.`)) onDelete()
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="detail__intro">
        <p className="eyebrow">{collection.kind === 'calendar' ? 'Event' : 'Idea'}</p>
        <h1>{collection.title}</h1>
        {schedule && occurrence ? (
          <p className="detail__when">
            {formatSchedule(schedule, occurrence)}
            {repeat ? ` · ${repeat}` : ''}
            <span className="muted"> — next {formatLongDate(occurrence)}</span>
          </p>
        ) : null}
        {collection.description ? <p className="lede">{collection.description}</p> : null}
      </div>

      <div className="detail__board" ref={boardRef}>
        {collection.items.length === 0 ? (
          <p className="empty-inline">
            Nothing here yet. Pin photos, GIFs, or clips — several in one card if you like.
          </p>
        ) : (
          <div className="detail__canvas" style={{ width: extent.w, height: extent.h }}>
            {collection.items.map((item, index) => {
              const pin = resolvePin(item, index, boardSize.w)
              const live = drag?.id === item.id ? { x: drag.x, y: drag.y, z: 10000 } : pin
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  currentName={currentName}
                  dragging={drag?.id === item.id}
                  pin={live}
                  onReact={(emoji) => onReact(item.id, emoji)}
                  onReply={(text) => onReply(item.id, text)}
                  onDelete={() => onDeleteItem(item.id)}
                  onAddFiles={(files) => onAddFiles(item.id, files)}
                  onAddLink={(url) => onAddLink(item.id, url)}
                  onRemoveFile={(attachmentId) => onRemoveFile(item.id, attachmentId)}
                  onCaption={(caption) => onCaption(item.id, caption)}
                  onContent={(content) => onContent(item.id, content)}
                  onCyclePreview={(direction) => onCyclePreview(item.id, direction)}
                  onDragHandlePointerDown={(event) => beginDrag(event, item.id, live)}
                  onBringToFront={() => onBringItemToFront(item.id)}
                  collectionCoverPreview={collection.coverPreview}
                  onSetCollectionCover={onSetCollectionCover}
                />
              )
            })}
          </div>
        )}
      </div>

      <Composer onAdd={(input) => onAddItem(input, boardSize.w)} />
    </section>
  )
}
