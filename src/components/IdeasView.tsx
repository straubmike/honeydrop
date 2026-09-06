import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Collection } from '../types'
import { CollectionCard } from './CollectionCard'

interface IdeasViewProps {
  collections: Collection[]
  onOpen: (id: string) => void
  onCreate: () => void
  onReorder: (activeId: string, overId: string) => void
}

function collectionIdFromPoint(x: number, y: number): string | null {
  const hit = document.elementsFromPoint(x, y).find(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && Boolean(element.dataset.collectionId),
  )
  return hit?.dataset.collectionId ?? null
}

export function IdeasView({ collections, onOpen, onCreate, onReorder }: IdeasViewProps) {
  const ideas = collections.filter((collection) => collection.kind === 'idea')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const overIdRef = useRef<string | null>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    dragIdRef.current = dragId
  }, [dragId])

  useEffect(() => {
    overIdRef.current = overId
  }, [overId])

  useEffect(() => {
    if (!dragId) return

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
      if (activeId && targetId && activeId !== targetId) onReorder(activeId, targetId)
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
  }, [dragId, onReorder])

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    movedRef.current = false
    dragIdRef.current = id
    setDragId(id)
    setOverId(null)
  }

  const openCollection = (id: string) => {
    if (movedRef.current || dragIdRef.current) return
    onOpen(id)
  }

  return (
    <section className="ideas">
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
      ) : (
        <div className="idea-grid">
          {ideas.map((collection) => (
            <div
              key={collection.id}
              data-collection-id={collection.id}
              className={[
                'idea-card-wrap',
                dragId === collection.id ? 'idea-card-wrap--dragging' : '',
                overId === collection.id && dragId !== collection.id ? 'idea-card-wrap--over' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="item__grip collection-grip"
                aria-label={`Reorder ${collection.title}`}
                onPointerDown={(event) => beginDrag(event, collection.id)}
              >
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </button>
              <CollectionCard collection={collection} onOpen={() => openCollection(collection.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
