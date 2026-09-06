import { useId, useState, type FormEvent } from 'react'
import type { IdeaBoard } from '../types'
import { BrandMark } from './BrandMark'

interface HomeViewProps {
  boards: IdeaBoard[]
  displayName: string
  onDisplayName: (name: string) => void
  onOpen: (boardId: string) => void
  onCreate: (title: string) => void
  onJoin: (code: string) => { ok: true; boardId: string } | { ok: false; reason: string }
  onDelete: (boardId: string) => void
}

function boardBlurb(board: IdeaBoard): string {
  const names = board.members.map((member) => member.name.trim() || 'Someone')
  if (names.length >= 2) return `${names[0]} & ${names[1]}`
  return names[0] ? `${names[0]} · waiting for partner` : 'Just you so far'
}

export function HomeView({
  boards,
  displayName,
  onDisplayName,
  onOpen,
  onCreate,
  onJoin,
  onDelete,
}: HomeViewProps) {
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<IdeaBoard | null>(null)
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const createHeadingId = useId()
  const joinHeadingId = useId()
  const deleteHeadingId = useId()

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim() || 'Ours'
    onCreate(next)
    setTitle('')
    setCreating(false)
  }

  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    const result = onJoin(code)
    if (!result.ok) {
      setJoinError(result.reason)
      return
    }
    setCode('')
    setJoinError('')
    setJoining(false)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    onDelete(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Honey Drop</h1>
            <p className="brand__sub">Your shared idea boards</p>
          </div>
        </div>
        <label className="who">
          <span>Your name</span>
          <input
            value={displayName}
            onChange={(event) => onDisplayName(event.target.value)}
            maxLength={32}
            placeholder="You"
            aria-label="Your name"
          />
        </label>
      </header>

      <section className="home">
        <header className="list-pane__header">
          <h2>Boards</h2>
          <button type="button" className="ghost" onClick={() => setJoining(true)}>
            Join with code
          </button>
        </header>

        <div className="board-list">
          {boards.map((board) => {
            const ideaCount = board.collections.filter((entry) => entry.kind === 'idea').length
            return (
              <div key={board.id} className="board-card">
                <button
                  type="button"
                  className="board-card__open"
                  onClick={() => onOpen(board.id)}
                >
                  <h3>{board.title}</h3>
                  <p className="muted">{boardBlurb(board)}</p>
                  <p className="event-card__meta">
                    {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'}
                  </p>
                </button>
                <button
                  type="button"
                  className="board-card__delete"
                  aria-label={`Delete ${board.title}`}
                  onClick={() => setPendingDelete(board)}
                >
                  ×
                </button>
              </div>
            )
          })}
          <button type="button" className="board-card board-card--new" onClick={() => setCreating(true)}>
            + New Board
          </button>
        </div>
      </section>

      {creating ? (
        <div className="modal-backdrop" onClick={() => setCreating(false)} role="presentation">
          <form
            className="modal"
            role="dialog"
            aria-labelledby={createHeadingId}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitCreate}
          >
            <header className="modal__header">
              <h2 id={createHeadingId}>New board</h2>
              <button type="button" className="icon-btn" onClick={() => setCreating(false)} aria-label="Close">
                ×
              </button>
            </header>
            <label className="field">
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ours"
                maxLength={40}
                autoFocus
              />
            </label>
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {joining ? (
        <div className="modal-backdrop" onClick={() => setJoining(false)} role="presentation">
          <form
            className="modal"
            role="dialog"
            aria-labelledby={joinHeadingId}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitJoin}
          >
            <header className="modal__header">
              <h2 id={joinHeadingId}>Join a board</h2>
              <button type="button" className="icon-btn" onClick={() => setJoining(false)} aria-label="Close">
                ×
              </button>
            </header>
            <label className="field">
              <span>Invite code</span>
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase())
                  setJoinError('')
                }}
                placeholder="ABC123"
                maxLength={12}
                autoFocus
              />
            </label>
            {joinError ? <p className="field-error">{joinError}</p> : null}
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={() => setJoining(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Join
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="modal-backdrop" onClick={() => setPendingDelete(null)} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-labelledby={deleteHeadingId}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal__header">
              <h2 id={deleteHeadingId}>Delete board</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPendingDelete(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <p className="lede">
              Are you sure you want to delete “{pendingDelete.title.trim() || 'Ours'}”?
            </p>
            <div className="modal__actions">
              <button type="button" className="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="primary primary--danger" onClick={confirmDelete}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
