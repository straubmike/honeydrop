import type { Collection } from '../types'
import { isSameDay, monthCells, toISODate } from '../dates'
import { layoutMonthWeeks, segmentDayIso } from '../monthLayout'

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
  const weeks = layoutMonthWeeks(cells, collections, year, month)
  const title = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const busyDays = new Set<string>()
  for (const week of weeks) {
    for (const segment of week.segments) {
      for (let col = segment.startCol; col <= segment.endCol; col += 1) {
        const iso = segmentDayIso(week.cells, col)
        if (iso) busyDays.add(iso)
      }
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
        {weeks.map((week) => (
          <div
            key={week.weekIndex}
            className="month__week"
            style={{ ['--lane-count' as string]: Math.max(week.laneCount, 1) }}
          >
            <div className="month__week-days">
              {week.cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${week.weekIndex}-${index}`} className="month__cell month__cell--empty" />
                }
                const iso = toISODate(cell)
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
                      busyDays.has(iso) ? 'month__cell--busy' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectDate(iso)}
                  >
                    <span className="month__num">{cell.getDate()}</span>
                  </button>
                )
              })}
            </div>
            {week.segments.length > 0 ? (
              <div className="month__week-bars" aria-hidden={false}>
                {week.segments.map((segment) => {
                  const startIso = segmentDayIso(week.cells, segment.startCol)
                  const classes = [
                    'month__bar',
                    'month__bar--span',
                    segment.continuesLeft ? 'month__bar--continues-left' : '',
                    segment.continuesRight ? 'month__bar--continues-right' : '',
                    segment.labelOnDark ? 'month__bar--on-dark' : 'month__bar--on-light',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <button
                      key={segment.key}
                      type="button"
                      className={classes}
                      title={segment.collection.title}
                      style={{
                        gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                        gridRow: segment.lane + 1,
                        backgroundColor: segment.color,
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (startIso) onSelectDate(startIso)
                      }}
                    >
                      <span className="month__bar-label">{segment.collection.title}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
