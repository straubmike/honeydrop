import { useEffect, useId, useState, type FormEvent } from 'react'
import { uid } from '../dates'
import type { Collection, CollectionKind, Recurrence, Schedule } from '../types'

interface CollectionFormProps {
  kind: CollectionKind
  initial?: Collection | null
  defaultDate?: string | null
  onClose: () => void
  onSave: (collection: Collection) => void
}

export function CollectionForm({ kind, initial, defaultDate, onClose, onSave }: CollectionFormProps) {
  const headingId = useId()
  const today = new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [startDate, setStartDate] = useState(initial?.schedule?.startDate ?? defaultDate ?? today)
  const [endDate, setEndDate] = useState(initial?.schedule?.endDate ?? defaultDate ?? today)
  const [allDay, setAllDay] = useState(initial?.schedule?.allDay ?? true)
  const [startTime, setStartTime] = useState(initial?.schedule?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(initial?.schedule?.endTime ?? '10:00')
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.schedule?.recurrence ?? 'none')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    let schedule: Schedule | undefined
    if (kind === 'calendar') {
      const start = startDate
      const end = endDate < startDate ? startDate : endDate
      schedule = {
        startDate: start,
        endDate: end,
        allDay,
        recurrence,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
      }
    }

    const now = new Date().toISOString()
    onSave({
      id: initial?.id ?? uid(),
      kind,
      title: trimmed,
      description: description.trim(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      schedule,
      coverPreview: initial?.coverPreview,
      items: initial?.items ?? [],
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-labelledby={headingId}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__header">
          <h2 id={headingId}>
            {initial ? 'Edit' : 'New'} {kind === 'calendar' ? 'event' : 'idea'}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label className="field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === 'calendar' ? 'Anniversary, trip, birthday…' : 'Gift ideas, recipes…'}
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder={
              kind === 'calendar'
                ? 'Optional context for this event'
                : 'Optional context for anyone looking at this idea'
            }
          />
        </label>

        {kind === 'calendar' ? (
          <>
            <div className="field-row">
              <label className="field">
                <span>Starts</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    const next = event.target.value
                    setStartDate(next)
                    if (endDate < next) setEndDate(next)
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>Ends</span>
                <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required />
              </label>
            </div>

            <label className="check">
              <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
              All day
            </label>

            {!allDay ? (
              <div className="field-row">
                <label className="field">
                  <span>Start time</span>
                  <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                </label>
                <label className="field">
                  <span>End time</span>
                  <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
                </label>
              </div>
            ) : null}

            <label className="field">
              <span>Repeats</span>
              <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>
                <option value="none">Does not repeat</option>
                <option value="yearly">Every year</option>
                <option value="monthly">Every month</option>
              </select>
            </label>
          </>
        ) : null}

        <footer className="modal__footer">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {initial ? 'Save changes' : kind === 'calendar' ? 'Create event' : 'Create idea'}
          </button>
        </footer>
      </form>
    </div>
  )
}
