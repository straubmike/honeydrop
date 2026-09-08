import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  formatLongDate,
  formatSchedule,
  nextOccurrenceStart,
  recurrenceLabel,
  toISODate,
} from '../dates'
import { parseDrawing, stringifyDrawing, type DrawingData } from '../drawing'
import { boardExtent, resolvePin } from '../pins'
import type { Collection, CollectionCoverPreview, NewItemInput } from '../types'
import { useCompactViewport } from '../useCompactViewport'
import { Composer } from './Composer'
import { DrawingCanvas } from './DrawingCanvas'
import { ItemCard } from './ItemCard'

interface CollectionDetailProps {
  collection: Collection
  currentUserId: string
  nameByUserId: Record<string, string>
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onAddItem: (input: NewItemInput, boardWidth: number) => void | Promise<void>
  onDeleteItem: (itemId: string) => void
  onMoveItem: (itemId: string, x: number, y: number, boardWidth: number) => void
  onReorderItem: (activeId: string, toIndex: number) => void
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

interface FreeformDragState {
  id: string
  x: number
  y: number
  originX: number
  originY: number
  pointerX: number
  pointerY: number
}

interface CompactDragState {
  id: string
  insertIndex: number
  x: number
  y: number
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const LONG_PRESS_MS = 400
const LONG_PRESS_MOVE_PX = 10
const AUTO_SCROLL_EDGE_PX = 72
const AUTO_SCROLL_MAX_SPEED = 18

function itemIdFromPoint(clientX: number, clientY: number): string | null {
  const hit = document.elementsFromPoint(clientX, clientY).find(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && Boolean(element.dataset.itemSlotId),
  )
  return hit?.dataset.itemSlotId ?? null
}

function insertIndexFromPoint(
  clientX: number,
  clientY: number,
  orderedIds: string[],
  activeId: string,
): number {
  const others = orderedIds.filter((id) => id !== activeId)
  if (!others.length) return 0

  const overId = itemIdFromPoint(clientX, clientY)
  if (overId && overId !== activeId) {
    const overEl = document.querySelector(`[data-item-slot-id="${overId}"]`)
    if (overEl instanceof HTMLElement) {
      const rect = overEl.getBoundingClientRect()
      const overIndex = others.indexOf(overId)
      if (overIndex >= 0) {
        const after = clientY > rect.top + rect.height / 2
        return after ? overIndex + 1 : overIndex
      }
    }
  }

  let bestIndex = others.length
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < others.length; index += 1) {
    const el = document.querySelector(`[data-item-slot-id="${others[index]}"]`)
    if (!(el instanceof HTMLElement)) continue
    const rect = el.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const distance = Math.abs(clientY - midY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = clientY < midY ? index : index + 1
    }
  }
  return bestIndex
}

export function CollectionDetail({
  collection,
  currentUserId,
  nameByUserId,
  onBack,
  onEdit,
  onDelete,
  onAddItem,
  onDeleteItem,
  onMoveItem,
  onReorderItem,
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
  const compact = useCompactViewport()
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<FreeformDragState | null>(null)
  const compactDragRef = useRef<CompactDragState | null>(null)
  const seenCount = useRef(collection.items.length)
  const longPressTimer = useRef<number | null>(null)
  const longPressOrigin = useRef<{ id: string; x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const [boardSize, setBoardSize] = useState({ w: 900, h: 560 })
  const [drag, setDrag] = useState<FreeformDragState | null>(null)
  const [compactDrag, setCompactDrag] = useState<CompactDragState | null>(null)
  const [drawing, setDrawing] = useState<{ mode: 'new' } | { mode: 'edit'; itemId: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteHeadingId = useId()

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
    const count = collection.items.length
    if (count > seenCount.current) {
      const newest = collection.items[count - 1]
      const reveal = () => {
        const node = boardRef.current?.querySelector(`[data-item-id="${newest?.id}"]`)
        node?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
      requestAnimationFrame(() => requestAnimationFrame(reveal))
    }
    seenCount.current = count
  }, [collection.items])

  useEffect(() => {
    if (!drag?.id || compact) return

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
  }, [drag?.id, compact, boardSize.w, onMoveItem])

  useEffect(() => {
    if (!compactDrag?.id) return

    let finished = false
    let rafId = 0
    const orderedIds = collection.items.map((item) => item.id)
    const pointer = { x: 0, y: 0 }
    const initial = compactDragRef.current
    if (initial) {
      pointer.x = initial.x + initial.offsetX
      pointer.y = initial.y + initial.offsetY
    }

    const syncFromPointer = () => {
      const dragState = compactDragRef.current
      if (!dragState) return
      const insertIndex = insertIndexFromPoint(pointer.x, pointer.y, orderedIds, dragState.id)
      const next: CompactDragState = {
        ...dragState,
        x: pointer.x - dragState.offsetX,
        y: pointer.y - dragState.offsetY,
        insertIndex,
      }
      compactDragRef.current = next
      setCompactDrag(next)
    }

    const autoScrollStep = () => {
      if (finished || !compactDragRef.current) return
      const board = boardRef.current
      if (board) {
        const rect = board.getBoundingClientRect()
        const maxScroll = board.scrollHeight - board.clientHeight
        let delta = 0

        if (maxScroll > 0) {
          if (pointer.y < rect.top + AUTO_SCROLL_EDGE_PX) {
            const intensity = Math.min(1, (rect.top + AUTO_SCROLL_EDGE_PX - pointer.y) / AUTO_SCROLL_EDGE_PX)
            delta = -Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity)
          } else if (pointer.y > rect.bottom - AUTO_SCROLL_EDGE_PX) {
            const intensity = Math.min(
              1,
              (pointer.y - (rect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX,
            )
            delta = Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity)
          }
        }

        if (delta !== 0) {
          const before = board.scrollTop
          board.scrollTop = Math.max(0, Math.min(maxScroll, before + delta))
          if (board.scrollTop !== before) syncFromPointer()
        }
      }

      rafId = window.requestAnimationFrame(autoScrollStep)
    }

    const move = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      syncFromPointer()
    }

    const end = () => {
      if (finished) return
      finished = true
      window.cancelAnimationFrame(rafId)
      const dragState = compactDragRef.current
      compactDragRef.current = null
      setCompactDrag(null)
      document.body.classList.remove('is-dragging')
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      if (!dragState) return
      onReorderItem(dragState.id, dragState.insertIndex)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    document.body.classList.add('is-dragging')
    rafId = window.requestAnimationFrame(autoScrollStep)
    return () => {
      finished = true
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('is-dragging')
    }
  }, [compactDrag?.id, collection.items, onReorderItem])

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    longPressOrigin.current = null
  }

  const beginFreeformDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    pin: { x: number; y: number },
  ) => {
    if (event.button !== 0 || compact) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next: FreeformDragState = {
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

  const armCompactLongPress = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (!compact || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    clearLongPress()
    longPressOrigin.current = { id, x: event.clientX, y: event.clientY }
    const pointerId = event.pointerId
    const target = event.currentTarget

    const onMove = (moveEvent: PointerEvent) => {
      const origin = longPressOrigin.current
      if (!origin) return
      const dx = moveEvent.clientX - origin.x
      const dy = moveEvent.clientY - origin.y
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearLongPress()
    }
    const onUp = () => {
      clearLongPress()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      const origin = longPressOrigin.current
      longPressOrigin.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!origin || origin.id !== id) return

      const card = boardRef.current?.querySelector(`[data-item-id="${id}"]`)
      if (!(card instanceof HTMLElement)) return
      const rect = card.getBoundingClientRect()
      const fromIndex = collection.items.findIndex((item) => item.id === id)
      navigator.vibrate?.(10)
      suppressClickRef.current = true
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      const next: CompactDragState = {
        id,
        insertIndex: Math.max(0, fromIndex),
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX: origin.x - rect.left,
        offsetY: origin.y - rect.top,
      }
      compactDragRef.current = next
      setCompactDrag(next)
    }, LONG_PRESS_MS)
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

  const renderCard = (
    item: (typeof collection.items)[number],
    pin: { x: number; y: number; z: number },
    options: { dragging?: boolean; layout: 'freeform' | 'flow'; floating?: boolean },
  ) => (
    <ItemCard
      key={options.floating ? `float-${item.id}` : item.id}
      item={item}
      currentUserId={currentUserId}
      nameByUserId={nameByUserId}
      dragging={Boolean(options.dragging)}
      layout={options.layout}
      floating={options.floating}
      pin={pin}
      onReact={(emoji) => onReact(item.id, emoji)}
      onReply={(text) => onReply(item.id, text)}
      onDelete={() => onDeleteItem(item.id)}
      onAddFiles={(files) => onAddFiles(item.id, files)}
      onAddLink={(url) => onAddLink(item.id, url)}
      onRemoveFile={(attachmentId) => onRemoveFile(item.id, attachmentId)}
      onCaption={(caption) => onCaption(item.id, caption)}
      onContent={(content) => onContent(item.id, content)}
      onCyclePreview={(direction) => onCyclePreview(item.id, direction)}
      onDragHandlePointerDown={(event) => {
        if (compact) armCompactLongPress(event, item.id)
        else beginFreeformDrag(event, item.id, pin)
      }}
      onBringToFront={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        onBringItemToFront(item.id)
      }}
      collectionCoverPreview={collection.coverPreview}
      onSetCollectionCover={onSetCollectionCover}
      onEditDrawing={
        item.type === 'drawing' ? () => setDrawing({ mode: 'edit', itemId: item.id }) : undefined
      }
    />
  )

  const compactSlots = (() => {
    if (!compactDrag) {
      return collection.items.map((item) => ({ type: 'item' as const, item }))
    }
    const others = collection.items.filter((item) => item.id !== compactDrag.id)
    const insertAt = Math.max(0, Math.min(compactDrag.insertIndex, others.length))
    const slots: Array<{ type: 'item'; item: (typeof collection.items)[number] } | { type: 'gap' }> =
      others.map((item) => ({ type: 'item', item }))
    slots.splice(insertAt, 0, { type: 'gap' })
    return slots
  })()

  const floatingItem = compactDrag
    ? collection.items.find((item) => item.id === compactDrag.id) ?? null
    : null

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
          <button type="button" className="ghost ghost--danger" onClick={() => setConfirmDelete(true)}>
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

      <div className={['detail__board', compact ? 'detail__board--compact' : ''].filter(Boolean).join(' ')} ref={boardRef}>
        {collection.items.length === 0 ? (
          <p className="empty-inline">
            Nothing here yet. Pin photos, GIFs, or clips — several in one card if you like.
          </p>
        ) : compact ? (
          <div className="detail__flow">
            {compactSlots.map((slot, index) => {
              if (slot.type === 'gap') {
                return (
                  <div
                    key={`gap-${index}`}
                    className="item-slot item-slot--gap"
                    style={compactDrag ? { minHeight: compactDrag.height } : undefined}
                  />
                )
              }
              return (
                <div key={slot.item.id} className="item-slot" data-item-slot-id={slot.item.id}>
                  {renderCard(slot.item, { x: 0, y: 0, z: index + 1 }, { layout: 'flow' })}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="detail__canvas" style={{ width: extent.w, height: extent.h }}>
            {collection.items.map((item, index) => {
              const pin = resolvePin(item, index, boardSize.w)
              const live = drag?.id === item.id ? { x: drag.x, y: drag.y, z: 10000 } : pin
              return renderCard(item, live, { dragging: drag?.id === item.id, layout: 'freeform' })
            })}
          </div>
        )}
      </div>

      {floatingItem && compactDrag ? (
        <div
          className="detail__float"
          style={{
            width: compactDrag.width,
            transform: `translate(${compactDrag.x}px, ${compactDrag.y}px)`,
          }}
        >
          {renderCard(floatingItem, { x: 0, y: 0, z: 10000 }, { dragging: true, layout: 'flow', floating: true })}
        </div>
      ) : null}

      <Composer onAdd={(input) => onAddItem(input, boardSize.w)} onDraw={() => setDrawing({ mode: 'new' })} />

      {drawing ? (
        <DrawingCanvas
          initial={
            drawing.mode === 'edit'
              ? parseDrawing(collection.items.find((item) => item.id === drawing.itemId)?.content ?? '')
              : null
          }
          onClose={() => setDrawing(null)}
          onSave={(data: DrawingData) => {
            const content = stringifyDrawing(data)
            if (drawing.mode === 'new') {
              void onAddItem({ type: 'drawing', content }, boardSize.w)
            } else {
              onContent(drawing.itemId, content)
            }
            setDrawing(null)
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-labelledby={deleteHeadingId}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal__header">
              <h2 id={deleteHeadingId}>
                Delete {collection.kind === 'calendar' ? 'event' : 'idea'}
              </h2>
            </header>
            <p className="lede">
              Are you sure you want to delete “{collection.title.trim() || 'Untitled'}”? This cannot be
              undone.
            </p>
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary primary--danger"
                onClick={() => {
                  setConfirmDelete(false)
                  onDelete()
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
