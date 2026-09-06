import type { Collection } from '../types'
import { datesInMonth, isSameDay, monthCells, toISODate } from '../dates'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface MonthGridProps {
  cursor: Date
  collections: Collection[]
  selectedDate: string | null
  onSelectDate: (iso: string) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function MonthGrid({
  cursor,
  collections,
  selectedDate,
  onSelectDate,
  onPrev,
  onNext,
  onToday,
}: MonthGridProps) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = new Date()
  const cells = monthCells(year, month)
  const title = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const eventsByDay = new Map<string, Collection[]>()
  for (const collection of collections) {
    for (const iso of datesInMonth(collection, year, month)) {
      const list = eventsByDay.get(iso) ?? []
      list.push(collection)
      eventsByDay.set(iso, list)
    }
  }

  return (
    <section className="month">
      <header className="month__nav">
        <h2>{title}</h2>
        <div className="month__actions">
          <button type="button" className="ghost" onClick={onToday}>
            Today
          </button>
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
            ›
          </button>
        </div>
      </header>
      <div className="month__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month__grid">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} className="month__cell month__cell--empty" />
          const iso = toISODate(cell)
          const events = eventsByDay.get(iso) ?? []
          const selected = selectedDate === iso
          const isToday = isSameDay(cell, today)
          return (
            <button
              key={iso}
              type="button"
              className={[
                'month__cell',
                isToday ? 'month__cell--today' : '',
                selected ? 'month__cell--selected' : '',
                events.length ? 'month__cell--busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(iso)}
            >
              <span className="month__num">{cell.getDate()}</span>
              <span className="month__dots">
                {events.slice(0, 3).map((event) => (
                  <span key={event.id} className="dot" title={event.title} />
                ))}
              </span>
              {events[0] ? <span className="month__label">{events[0].title}</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
