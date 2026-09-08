import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Collection } from '../types'
import { useCompactViewport } from '../useCompactViewport'
import { CollectionCard } from './CollectionCard'

interface IdeasViewProps {
  collections: Collection[]
  onOpen: (id: string) => void
  onCreate: () => void
  onReorder: (activeId: string, toIndex: number) => void
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

function collectionIdFromPoint(x: number, y: number): string | null {
  const hit = document.elementsFromPoint(x, y).find(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && Boolean(element.dataset.collectionId),
  )
  return hit?.dataset.collectionId ?? null
}

function insertIndexFromPoint(
  clientX: number,
  clientY: number,
  orderedIds: string[],
  activeId: string,
): number {
  const others = orderedIds.filter((id) => id !== activeId)
  if (!others.length) return 0

  const overId = collectionIdFromPoint(clientX, clientY)
  if (overId && overId !== activeId) {
    const overEl = document.querySelector(`[data-collection-id="${overId}"]`)
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
    const el = document.querySelector(`[data-collection-id="${others[index]}"]`)
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

function scrollParentDelta(pointerY: number): { el: Element; delta: number } | null {
  const scrolling = document.scrollingElement
  if (!(scrolling instanceof HTMLElement)) return null
  const maxScroll = scrolling.scrollHeight - scrolling.clientHeight
  if (maxScroll <= 0) return null

  const viewportTop = 0
  const viewportBottom = window.innerHeight

  if (pointerY < viewportTop + AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(1, (viewportTop + AUTO_SCROLL_EDGE_PX - pointerY) / AUTO_SCROLL_EDGE_PX)
    return { el: scrolling, delta: -Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity) }
  }
  if (pointerY > viewportBottom - AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(1, (pointerY - (viewportBottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX)
    return { el: scrolling, delta: Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity) }
  }
  return null
}

export function IdeasView({ collections, onOpen, onCreate, onReorder }: IdeasViewProps) {
  const compact = useCompactViewport()
  const ideas = collections.filter((collection) => collection.kind === 'idea')
  const gridRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<number | null>(null)
  const longPressOrigin = useRef<{ id: string; x: number; y: number } | null>(null)
  const compactDragRef = useRef<CompactDragState | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const overIdRef = useRef<string | null>(null)
  const movedRef = useRef(false)

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [compactDrag, setCompactDrag] = useState<CompactDragState | null>(null)

  useEffect(() => {
    dragIdRef.current = dragId
  }, [dragId])

  useEffect(() => {
    overIdRef.current = overId
  }, [overId])

  // Desktop: immediate grip drag with hover target
  useEffect(() => {
    if (!dragId || compact) return

    const onMove = (event: PointerEvent) => {
      movedRef.current = true
      const nextOver = collectionIdFromPoint(event.clientX, event.clientY)
      if (nextOver && nextOver !== dragIdRef.current) {
        setOverId(nextOver)
      }
    }

    const finish = () => {
      const activeId = dragIdRef.current
      const targetId = overIdRef.current
      dragIdRef.current = null
      overIdRef.current = null
      setDragId(null)
      setOverId(null)
      document.body.classList.remove('is-dragging')
      if (activeId && targetId && activeId !== targetId) {
        const toIndex = ideas.findIndex((collection) => collection.id === targetId)
        if (toIndex >= 0) onReorder(activeId, toIndex)
      }
      window.setTimeout(() => {
        movedRef.current = false
      }, 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    document.body.classList.add('is-dragging')
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.classList.remove('is-dragging')
    }
  }, [dragId, compact, ideas, onReorder])

  // Mobile: long-press floating drag with insertion gap
  useEffect(() => {
    if (!compactDrag?.id) return

    let finished = false
    let rafId = 0
    const orderedIds = ideas.map((collection) => collection.id)
    const pointer = {
      x: compactDrag.x + compactDrag.offsetX,
      y: compactDrag.y + compactDrag.offsetY,
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
      const scroll = scrollParentDelta(pointer.y)
      if (scroll) {
        const before = scroll.el.scrollTop
        scroll.el.scrollTop = Math.max(0, before + scroll.delta)
        if (scroll.el.scrollTop !== before) syncFromPointer()
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
        movedRef.current = false
      }, 0)
      if (!dragState) return
      onReorder(dragState.id, dragState.insertIndex)
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
  }, [compactDrag?.id, ideas, onReorder])

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    longPressOrigin.current = null
  }

  const beginDesktopDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || compact) return
    event.preventDefault()
    event.stopPropagation()
    movedRef.current = false
    dragIdRef.current = id
    setDragId(id)
    setOverId(null)
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

      const card = gridRef.current?.querySelector(`[data-collection-id="${id}"]`)
      if (!(card instanceof HTMLElement)) return
      const rect = card.getBoundingClientRect()
      const fromIndex = ideas.findIndex((collection) => collection.id === id)
      navigator.vibrate?.(10)
      movedRef.current = true
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

  const openCollection = (id: string) => {
    if (movedRef.current || dragIdRef.current || compactDragRef.current) return
    onOpen(id)
  }

  const compactSlots = (() => {
    if (!compactDrag) {
      return ideas.map((collection) => ({ type: 'item' as const, collection }))
    }
    const others = ideas.filter((collection) => collection.id !== compactDrag.id)
    const insertAt = Math.max(0, Math.min(compactDrag.insertIndex, others.length))
    const slots: Array<
      { type: 'item'; collection: Collection } | { type: 'gap' }
    > = others.map((collection) => ({ type: 'item', collection }))
    slots.splice(insertAt, 0, { type: 'gap' })
    return slots
  })()

  const floatingCollection = compactDrag
    ? ideas.find((collection) => collection.id === compactDrag.id) ?? null
    : null

  const renderWrap = (collection: Collection, options?: { dragging?: boolean; over?: boolean }) => (
    <div
      key={collection.id}
      data-collection-id={collection.id}
      className={[
        'idea-card-wrap',
        options?.dragging ? 'idea-card-wrap--dragging' : '',
        options?.over ? 'idea-card-wrap--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="item__grip collection-grip"
        aria-label={
          compact ? `Long-press to reorder ${collection.title}` : `Reorder ${collection.title}`
        }
        onPointerDown={(event) =>
          compact ? armCompactLongPress(event, collection.id) : beginDesktopDrag(event, collection.id)
        }
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      <CollectionCard collection={collection} onOpen={() => openCollection(collection.id)} />
    </div>
  )

  return (
    <section className={['ideas', compact ? 'ideas--compact' : ''].filter(Boolean).join(' ')}>
      <header className="list-pane__header">
        <button type="button" className="primary" onClick={onCreate}>
          New idea
        </button>
      </header>

      {ideas.length === 0 ? (
        <div className="empty">
          <p>Start an idea — gift lists, recipes, a renovation rabbit hole.</p>
          <button type="button" className="primary" onClick={onCreate}>
            Create idea
          </button>
        </div>
      ) : compact ? (
        <div className="idea-grid idea-grid--compact" ref={gridRef}>
          {compactSlots.map((slot, index) => {
            if (slot.type === 'gap') {
              return (
                <div
                  key={`gap-${index}`}
                  className="idea-card-wrap idea-card-wrap--gap"
                  style={compactDrag ? { minHeight: compactDrag.height } : undefined}
                />
              )
            }
            return renderWrap(slot.collection)
          })}
        </div>
      ) : (
        <div className="idea-grid" ref={gridRef}>
          {ideas.map((collection) =>
            renderWrap(collection, {
              dragging: dragId === collection.id,
              over: overId === collection.id && dragId !== collection.id,
            }),
          )}
        </div>
      )}

      {floatingCollection && compactDrag ? (
        <div
          className="ideas__float"
          style={{
            width: compactDrag.width,
            transform: `translate(${compactDrag.x}px, ${compactDrag.y}px)`,
          }}
        >
          <div className="idea-card-wrap idea-card-wrap--floating">
            <CollectionCard collection={floatingCollection} onOpen={() => {}} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
