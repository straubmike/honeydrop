import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandMark, LocationPin } from './components/BrandMark'
import { CalendarView } from './components/CalendarView'
import { CollectionDetail } from './components/CollectionDetail'
import { CollectionForm } from './components/CollectionForm'
import { HomeView } from './components/HomeView'
import { IdeasView } from './components/IdeasView'
import { InviteModal } from './components/InviteModal'
import type { BoardMember, Collection, CollectionKind, GeoPoint, Tab } from './types'
import { useApp } from './useBoard'

function boardSubtitle(members: BoardMember[]): string {
  const names = members.map((member) => member.name.trim() || 'You')
  if (names.length >= 2) {
    const left = names[0]!
    const right = names[1]!
    const possessive = /s$/i.test(right) ? `${right}'` : `${right}'s`
    return `${left} and ${possessive} Shared Idea Board`
  }
  const only = names[0] || 'You'
  const possessive = /s$/i.test(only) ? `${only}'` : `${only}'s`
  return `${possessive} Shared Idea Board`
}

function BoardTitle({
  value,
  onSave,
}: {
  value: string
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const skipBlur = useRef(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    skipBlur.current = false
    const next = draft.trim() || 'Ours'
    onSave(next)
    setDraft(next)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button type="button" className="brand__title" onClick={() => setEditing(true)}>
        <h1>{value.trim() || 'Ours'}</h1>
      </button>
    )
  }

  return (
    <input
      className="brand__title-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      maxLength={40}
      aria-label="Board title"
      autoFocus
      onBlur={() => {
        if (skipBlur.current) {
          skipBlur.current = false
          return
        }
        commit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          skipBlur.current = true
          setDraft(value)
          setEditing(false)
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}

export default function App() {
  const app = useApp()
  const [tab, setTab] = useState<Tab>('calendar')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formKind, setFormKind] = useState<CollectionKind | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [mapFocus, setMapFocus] = useState<GeoPoint | null>(null)

  const board = app.activeBoard
  const collections = board?.collections ?? []
  const selected = useMemo(
    () => collections.find((collection) => collection.id === selectedId) ?? null,
    [collections, selectedId],
  )
  const editing = collections.find((collection) => collection.id === editingId) ?? null
  const partner = board?.members.find((member) => member.userId !== app.userId)
  const hasPartner = Boolean(partner)
  const me = board?.members.find((member) => member.userId === app.userId)

  const focusLocation = (point: GeoPoint) => {
    setSelectedId(null)
    setTab('calendar')
    setMapFocus(point)
  }

  useEffect(() => {
    if (!board) {
      document.title = 'Honey Drop · Idea Board'
      return
    }
    document.title = `${board.title.trim() || 'Ours'} · Idea Board`
  }, [board])

  useEffect(() => {
    setSelectedId(null)
    setFormKind(null)
    setEditingId(null)
    setInviteOpen(false)
    setTab('calendar')
    setSelectedDate(null)
  }, [board?.id])

  const openForm = (kind: CollectionKind, collection?: Collection) => {
    setFormKind(kind)
    setEditingId(collection?.id ?? null)
  }

  if (!app.ready) {
    return (
      <div className="shell">
        <header className="masthead">
          <div className="brand">
            <BrandMark />
            <div>
              <h1>Honey Drop</h1>
              <p className="brand__sub">Loading your boards…</p>
            </div>
          </div>
        </header>
      </div>
    )
  }

  if (app.bootError) {
    return (
      <div className="shell">
        <header className="masthead">
          <div className="brand">
            <BrandMark />
            <div>
              <h1>Honey Drop</h1>
              <p className="brand__sub">Setup needed</p>
            </div>
          </div>
        </header>
        <section className="home">
          <p className="muted">{app.bootError}</p>
        </section>
      </div>
    )
  }

  if (!board) {
    return (
      <HomeView
        boards={app.boards}
        userId={app.userId}
        displayName={app.displayName}
        onDisplayName={app.setDisplayName}
        onOpen={app.openBoard}
        onCreate={(title) => void app.createBoard(title)}
        onJoin={app.joinBoard}
        onRequestDelete={app.requestBoardDeletion}
        onCancelDelete={app.cancelBoardDeletion}
        onConfirmDelete={app.confirmBoardDeletion}
        busy={app.busy}
      />
    )
  }

  const nameByUserId = Object.fromEntries(
    board.members.map((member) => [member.userId, member.name.trim() || 'You']),
  )

  if (selected) {
    return (
      <div className="shell shell--detail">
        <CollectionDetail
          collection={selected}
          currentUserId={app.userId}
          nameByUserId={nameByUserId}
          onBack={() => setSelectedId(null)}
          onEdit={() => openForm(selected.kind, selected)}
          onDelete={() => {
            app.deleteCollection(selected.id)
            setSelectedId(null)
          }}
          onAddItem={(input, boardWidth) => app.addItem(selected.id, input, boardWidth)}
          onDeleteItem={(itemId) => app.deleteItem(selected.id, itemId)}
          onMoveItem={(itemId, x, y, boardWidth) => app.moveItem(selected.id, itemId, x, y, boardWidth)}
          onReorderItem={(activeId, toIndex) => app.reorderItems(selected.id, activeId, toIndex)}
          onBringItemToFront={(itemId) => app.bringItemToFront(selected.id, itemId)}
          onAddFiles={(itemId, files) => void app.addAttachments(selected.id, itemId, files)}
          onAddLink={(itemId, url) => app.addLink(selected.id, itemId, url)}
          onRemoveFile={(itemId, attachmentId) => app.deleteAttachment(selected.id, itemId, attachmentId)}
          onCaption={(itemId, caption) => app.updateCaption(selected.id, itemId, caption)}
          onContent={(itemId, content) => app.updateContent(selected.id, itemId, content)}
          onCyclePreview={(itemId, direction) => app.cycleLinkPreview(selected.id, itemId, direction)}
          onSetCollectionCover={(cover) => app.setCollectionCover(selected.id, cover)}
          onReact={(itemId, emoji) => app.toggleReaction(selected.id, itemId, emoji)}
          onReply={(itemId, text) => app.addReply(selected.id, itemId, text)}
        />
        {formKind ? (
          <CollectionForm
            kind={formKind}
            initial={editing}
            defaultDate={selectedDate}
            onClose={() => {
              setFormKind(null)
              setEditingId(null)
            }}
            onSave={(collection) => {
              app.upsertCollection(collection)
              setFormKind(null)
              setEditingId(null)
              setSelectedId(collection.id)
              setTab(collection.kind === 'calendar' ? 'calendar' : 'ideas')
            }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <BrandMark />
          <div>
            <BoardTitle value={board.title} onSave={app.setBoardTitle} />
            <p className="brand__sub">{boardSubtitle(board.members)}</p>
          </div>
        </div>
        <div className="who-row">
          <button type="button" className="back-btn" onClick={app.closeBoard} aria-label="Back to all boards">
            ←
          </button>
          <div className="who">
            <span>You</span>
            <div className="who__field">
              {me?.location ? (
                <LocationPin label={me.name || 'You'} onClick={() => focusLocation(me.location!)} />
              ) : null}
              <input
                value={app.displayName}
                onChange={(event) => app.setDisplayName(event.target.value)}
                maxLength={32}
                placeholder="You"
                aria-label="Your name"
              />
            </div>
          </div>
          <div className="who">
            <span>Partner</span>
            <div className="who__field">
              {partner?.location ? (
                <LocationPin label={partner.name || 'Partner'} onClick={() => focusLocation(partner.location!)} />
              ) : null}
              {hasPartner ? (
                <input
                  value={partner?.name ?? 'Partner'}
                  readOnly
                  aria-label="Partner name"
                />
              ) : (
                <button
                  type="button"
                  className="primary who__invite"
                  onClick={() => setInviteOpen(true)}
                  aria-label="Invite partner"
                >
                  Invite code
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Board sections">
        <button
          type="button"
          className={tab === 'calendar' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('calendar')}
        >
          Calendar
        </button>
        <button
          type="button"
          className={tab === 'ideas' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('ideas')}
        >
          Ideas
        </button>
      </nav>

      {tab === 'calendar' ? (
        <CalendarView
          collections={collections}
          members={board.members}
          userId={app.userId}
          cursor={cursor}
          selectedDate={selectedDate}
          onCursor={setCursor}
          onSelectDate={setSelectedDate}
          onOpen={setSelectedId}
          onCreate={() => openForm('calendar')}
          onSetMyLocation={app.setMemberLocation}
          focusPoint={mapFocus}
          onFocusLocation={focusLocation}
          onMapFocused={() => setMapFocus(null)}
        />
      ) : (
        <IdeasView
          collections={collections}
          onOpen={setSelectedId}
          onCreate={() => openForm('idea')}
          onReorder={(activeId, toIndex) => app.reorderCollections('idea', activeId, toIndex)}
        />
      )}

      {formKind ? (
        <CollectionForm
          kind={formKind}
          initial={editing}
          defaultDate={formKind === 'calendar' ? selectedDate : null}
          onClose={() => {
            setFormKind(null)
            setEditingId(null)
          }}
          onSave={(collection) => {
            app.upsertCollection(collection)
            setFormKind(null)
            setEditingId(null)
            setSelectedId(collection.id)
            setTab(collection.kind === 'calendar' ? 'calendar' : 'ideas')
          }}
        />
      ) : null}

      {inviteOpen ? (
        <InviteModal
          boardTitle={board.title}
          inviteCode={board.inviteCode}
          hasPartner={hasPartner}
          partnerName={partner?.name}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </div>
  )
}
