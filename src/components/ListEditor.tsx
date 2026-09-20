import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  createListEntry,
  emptyList,
  formatMoney,
  linkifySegments,
  pruneList,
  sumMoney,
  type ListData,
  type ListEntry,
  type ListExtraMode,
} from '../list'
import { ModalBackdrop } from './ModalBackdrop'

interface ListEditorProps {
  title: string
  initial?: ListData | null
  onClose: () => void
  onSave: (data: ListData) => void
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function LinkifiedText({ text }: { text: string }) {
  const nodes: ReactNode[] = linkifySegments(text).map((segment, index) => {
    if (segment.type === 'text') return <span key={index}>{segment.value}</span>
    return (
      <a key={index} href={segment.href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        {segment.value}
      </a>
    )
  })
  return <>{nodes}</>
}

export function ListEditor({ title, initial, onClose, onSave }: ListEditorProps) {
  const headingId = useId()
  const [mode, setMode] = useState<ListExtraMode>(initial?.mode ?? 'off')
  const [entries, setEntries] = useState<ListEntry[]>(() =>
    initial?.entries.length ? initial.entries.map((entry) => ({ ...entry })) : emptyList().entries,
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const updateEntry = (id: string, patch: Partial<ListEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const removeEntry = (id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return [createListEntry()]
      return prev.filter((entry) => entry.id !== id)
    })
  }

  const addEntry = () => {
    setEntries((prev) => [...prev, createListEntry()])
  }

  const save = () => {
    onSave(pruneList({ mode, entries }))
  }

  const total = sumMoney({ mode, entries })

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        className="modal list-editor"
        role="dialog"
        aria-labelledby={headingId}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={headingId}>{title}</h2>
          <div className="list-editor__header-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" className="primary" onClick={save}>
              Save
            </button>
          </div>
        </header>

        <div className="list-mode" role="group" aria-label="Extra column">
          {(
            [
              { value: 'off', label: 'Off' },
              { value: 'qty', label: '#' },
              { value: 'money', label: '$' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={mode === option.value ? 'list-mode__btn list-mode__btn--on' : 'list-mode__btn'}
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <ol className="list-editor__rows">
          {entries.map((entry, index) => (
            <li key={entry.id} className={mode === 'off' ? 'list-editor__row' : 'list-editor__row list-editor__row--extra'}>
              <span className="list-editor__num" aria-hidden="true">
                {index + 1}.
              </span>
              <div className="list-editor__fields">
                <input
                  className="list-editor__text"
                  value={entry.text}
                  onChange={(event) => updateEntry(entry.id, { text: event.target.value })}
                  placeholder="Item"
                  aria-label={`Item ${index + 1}`}
                />
                <input
                  className="list-editor__note"
                  value={entry.note ?? ''}
                  onChange={(event) => updateEntry(entry.id, { note: event.target.value })}
                  placeholder="Note or link…"
                  aria-label={`Note for item ${index + 1}`}
                />
              </div>
              {mode === 'qty' ? (
                <input
                  className="list-editor__extra"
                  inputMode="decimal"
                  value={entry.qty == null ? '' : String(entry.qty)}
                  onChange={(event) => updateEntry(entry.id, { qty: parseOptionalNumber(event.target.value) })}
                  placeholder="#"
                  aria-label={`Quantity for item ${index + 1}`}
                />
              ) : null}
              {mode === 'money' ? (
                <input
                  className="list-editor__extra"
                  inputMode="decimal"
                  value={entry.amount == null ? '' : String(entry.amount)}
                  onChange={(event) =>
                    updateEntry(entry.id, { amount: parseOptionalNumber(event.target.value) })
                  }
                  placeholder="$"
                  aria-label={`Amount for item ${index + 1}`}
                />
              ) : null}
              <button
                type="button"
                className="text-btn list-editor__remove"
                onClick={() => removeEntry(entry.id)}
                aria-label={`Remove item ${index + 1}`}
              >
                ×
              </button>
            </li>
          ))}
        </ol>

        <div className="list-editor__footer">
          <button type="button" className="ghost" onClick={addEntry}>
            Add item
          </button>
          {mode === 'money' ? (
            <p className="list-editor__total">
              Total <strong>${formatMoney(total)}</strong>
            </p>
          ) : null}
        </div>
      </div>
    </ModalBackdrop>
  )
}
