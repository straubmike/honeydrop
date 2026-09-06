import { CollectionCard } from './CollectionCard'
import { MonthGrid } from './MonthGrid'
import type { Collection } from '../types'
import { compareUpcoming, datesInMonth, formatLongDate } from '../dates'

interface CalendarViewProps {
  collections: Collection[]
  cursor: Date
  selectedDate: string | null
  onCursor: (date: Date) => void
  onSelectDate: (iso: string | null) => void
  onOpen: (id: string) => void
  onCreate: () => void
}

export function CalendarView({
  collections,
  cursor,
  selectedDate,
  onCursor,
  onSelectDate,
  onOpen,
  onCreate,
}: CalendarViewProps) {
  const events = collections.filter((collection) => collection.kind === 'calendar')
  const monthEvents = selectedDate
    ? events.filter((collection) =>
        datesInMonth(collection, cursor.getFullYear(), cursor.getMonth()).includes(selectedDate),
      )
    : [...events].sort(compareUpcoming)

  return (
    <div className="calendar-layout">
      <MonthGrid
        cursor={cursor}
        collections={events}
        selectedDate={selectedDate}
        onSelectDate={(iso) => onSelectDate(selectedDate === iso ? null : iso)}
        onPrev={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        onNext={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        onToday={() => {
          const now = new Date()
          onCursor(new Date(now.getFullYear(), now.getMonth(), 1))
          onSelectDate(null)
        }}
      />

      <section className="list-pane">
        <header className="list-pane__header">
          <div>
            <h2>{selectedDate ? formatLongDate(selectedDate) : 'Upcoming'}</h2>
          </div>
          <button type="button" className="primary" onClick={onCreate}>
            New event
          </button>
        </header>

        {monthEvents.length === 0 ? (
          <div className="empty">
            <p>No events here yet.</p>
            <button type="button" className="primary" onClick={onCreate}>
              Add one
            </button>
          </div>
        ) : (
          <div className="stack">
            {monthEvents.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onOpen={() => onOpen(collection.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
