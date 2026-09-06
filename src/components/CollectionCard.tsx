import { resolveCollectionCover } from '../attachments'
import {
  formatSchedule,
  nextOccurrenceStart,
  recurrenceLabel,
  toISODate,
} from '../dates'
import { mediaKindLabel } from '../images'
import type { Collection } from '../types'
import { CollectionCoverThumb } from './Media'

interface CollectionCardProps {
  collection: Collection
  onOpen: () => void
}

export function CollectionCard({ collection, onOpen }: CollectionCardProps) {
  const preview = resolveCollectionCover(collection)
  const last = collection.items[collection.items.length - 1]
  const itemCount = collection.items.length

  if (collection.kind === 'calendar' && collection.schedule) {
    const next = nextOccurrenceStart(collection.schedule)
    const nextIso = toISODate(next)
    const month = next.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
    const day = String(next.getDate())
    const repeat = recurrenceLabel(collection.schedule.recurrence)

    return (
      <button type="button" className="event-card" onClick={onOpen}>
        <div className="event-card__date" aria-hidden="true">
          <span className="event-card__month">{month}</span>
          <span className="event-card__day">{day}</span>
        </div>
        <div className="event-card__body">
          <h3>{collection.title}</h3>
          <p className="muted">
            {formatSchedule(collection.schedule, nextIso)}
            {repeat ? ` · ${repeat}` : ''}
          </p>
          {collection.description ? <p className="clamp">{collection.description}</p> : null}
          <p className="event-card__meta">
            {itemCount === 0 ? 'Empty event' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
          </p>
        </div>
      </button>
    )
  }

  return (
    <div
      className="idea-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      {preview ? (
        <CollectionCoverThumb cover={preview} className="idea-card__image" />
      ) : (
        <div className="idea-card__swatch" aria-hidden="true" />
      )}
      <div className="idea-card__body">
        <h3>{collection.title}</h3>
        {collection.description ? <p className="clamp">{collection.description}</p> : null}
        <p className="muted">
          {itemCount === 0
            ? 'No notes yet'
            : last
              ? `${last.author}: ${last.type === 'text' ? last.content : last.caption || mediaKindLabel(last.type)}`
              : ''}
        </p>
        <p className="event-card__meta">
          {itemCount} {itemCount === 1 ? 'drop' : 'drops'}
        </p>
      </div>
    </div>
  )
}
