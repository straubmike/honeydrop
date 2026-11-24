import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrandMark, LocationPin } from './components/BrandMark'
import { CalendarView } from './components/CalendarView'
import { CollectionDetail } from './components/CollectionDetail'
import { CollectionForm } from './components/CollectionForm'
import { DeviceLinkIcon, DeviceLinkModal } from './components/DeviceLinkModal'
import { HomeView } from './components/HomeView'
import { IdeasView } from './components/IdeasView'
import { InstallPrompt } from './components/InstallPrompt'
import { InviteModal } from './components/InviteModal'
import { PencilHint } from './components/PencilHint'
import { SyncStatusBanner } from './components/SyncStatusBanner'
import { DemoModeBanner } from './components/DemoModeBanner'
import { WelcomeView } from './components/WelcomeView'
import { getHistoryBarrierCount } from './lib/historyBarrier'
import {
  boardPath,
  COLLECTION_HISTORY_KEY,
  historyHasCollectionEntry,
  homePath,
  parsePath,
  pushPath,
  replacePath,
  type AppRoute,
} from './lib/routes'
import {
  formatSchedule,
  nextOccurrenceStart,
  toISODate,
  uid,
} from './dates'
import type { BoardMember, Collection, CollectionKind, GeoPoint, Item, Tab } from './types'
import { useApp } from './useBoard'
import { useOnboardingHints } from './useOnboardingHints'

/** Text drop capturing event when/where before schedule is cleared on convert. */
function eventWhenWhereItem(
  collection: Collection,
  author: string,
  authorUserId: string,
): Item | null {
  const lines: string[] = []
  if (collection.schedule) {
    const occurrence = toISODate(nextOccurrenceStart(collection.schedule))
    lines.push(`When: ${formatSchedule(collection.schedule, occurrence)}`)
  }
  const where = collection.location?.label?.trim()
  if (where) {
    lines.push(`Where: ${where}`)
  } else if (collection.location) {
    lines.push(`Where: ${collection.location.lat.toFixed(5)}, ${collection.location.lng.toFixed(5)}`)
  }
  if (!lines.length) return null
  const now = new Date().toISOString()
  return {
    id: uid(),
    type: 'text',
    content: lines.join('\n'),
    author,
    authorUserId,
    createdAt: now,
    reactions: [],
    replies: [],
  }
}

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
  const [deviceLinkOpen, setDeviceLinkOpen] = useState(false)
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null)
  const [welcomeJoinCode, setWelcomeJoinCode] = useState<string | null>(null)
  const [prefillJoinCode, setPrefillJoinCode] = useState<string | null>(null)
  const [routeNotice, setRouteNotice] = useState<string | null>(null)
  const joinHandledRef = useRef<string | null>(null)
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
  const hints = useOnboardingHints({
    ready: app.ready,
    userId: app.userId,
    hasBoards: app.boards.length > 0,
  })
  const { complete: completeHint } = hints

  // popstate must read latest boards / activeBoardId — the ready effect's closure goes stale.
  const appRef = useRef(app)
  const selectedIdRef = useRef(selectedId)
  const formKindRef = useRef(formKind)
  const inviteOpenRef = useRef(inviteOpen)
  const deviceLinkOpenRef = useRef(deviceLinkOpen)
  appRef.current = app
  selectedIdRef.current = selectedId
  formKindRef.current = formKind
  inviteOpenRef.current = inviteOpen
  deviceLinkOpenRef.current = deviceLinkOpen
  /** Last committed app href (no modal/lightbox barrier) — Back overlays compare against this. */
  const routeHrefRef = useRef(
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/',
  )
  const rememberHref = () => {
    routeHrefRef.current = `${window.location.pathname}${window.location.search}`
  }

  const dismissAppOverlays = () => {
    setFormKind(null)
    setEditingId(null)
    setInviteOpen(false)
    setDeviceLinkOpen(false)
  }

  useEffect(() => {
    if (hasPartner) completeHint('invite')
  }, [completeHint, hasPartner])

  useEffect(() => {
    if (tab === 'ideas') completeHint('tabs')
  }, [completeHint, tab])

  // Edit modal whose collection is no longer open — unmount (Cancel); never float over board.
  useEffect(() => {
    if (!formKind || !editingId) return
    if (!selected || selected.id !== editingId) {
      setFormKind(null)
      setEditingId(null)
    }
  }, [formKind, editingId, selected])

  const applyRoute = (
    route: AppRoute,
    mode: 'push' | 'replace' = 'replace',
    source: 'boot' | 'pop' = 'boot',
  ) => {
    const current = appRef.current
    const write = mode === 'push' ? pushPath : replacePath
    if (route.name === 'home') {
      if (source === 'pop') {
        // Hardware/browser Back to the boards list — honor it.
        current.closeBoard()
        setSelectedId(null)
        dismissAppOverlays()
        rememberHref()
        return
      }
      // Boot / welcome flip: keep an already-open board (redeem race) and sync the bar.
      if (current.activeBoardId) {
        replacePath(
          selectedIdRef.current
            ? boardPath(current.activeBoardId, selectedIdRef.current)
            : boardPath(current.activeBoardId),
        )
        rememberHref()
        return
      }
      current.closeBoard()
      setSelectedId(null)
      write(homePath())
      rememberHref()
      return
    }
    if (route.name === 'join') {
      // After welcome redeem, leftover `/join/<code>` must not close the board or
      // kick off a second joinBoard while the redeem handler updates the URL.
      if (current.activeBoardId) return
      current.closeBoard()
      write(`/join/${encodeURIComponent(route.code)}`)
      rememberHref()
      if (current.needsWelcome) {
        // Unrecognized device: feed the code into welcome pre-check (no auto join / no account).
        setWelcomeJoinCode(route.code)
        setPendingJoinCode(null)
        return
      }
      setPendingJoinCode(route.code)
      return
    }
    if (current.needsWelcome) {
      write(homePath())
      rememberHref()
      return
    }
    const known = current.boards.some((entry) => entry.id === route.boardId)
    if (!known) {
      setRouteNotice('That board is not on this device. Join with a code, or ask your partner for recovery.')
      current.closeBoard()
      write(homePath())
      rememberHref()
      return
    }
    current.openBoard(route.boardId)
    if (route.collectionId) setSelectedId(route.collectionId)
    else setSelectedId(null)
    if (source === 'pop') dismissAppOverlays()
    write(boardPath(route.boardId, route.collectionId))
    rememberHref()
  }

  useEffect(() => {
    if (!app.ready) return
    applyRoute(parsePath(window.location.pathname), 'replace', 'boot')
    /**
     * Bubble-phase handler (barriers use capture and Cancel first).
     * While any modal barrier is mounted, never navigate the page underneath —
     * snap back to the pre-overlay href and ensure App overlays are dismissed.
     */
    const onPop = () => {
      try {
        const href = `${window.location.pathname}${window.location.search}`
        const stay = routeHrefRef.current
        const overlayOpen =
          getHistoryBarrierCount() > 0 ||
          Boolean(formKindRef.current) ||
          inviteOpenRef.current ||
          deviceLinkOpenRef.current

        if (overlayOpen) {
          if (href !== stay) {
            window.history.pushState(window.history.state, '', stay)
          }
          dismissAppOverlays()
          return
        }

        // Same-URL pop with no App overlay — lightbox barrier owns this.
        if (href === stay) return

        applyRoute(parsePath(window.location.pathname), 'replace', 'pop')
      } catch (error) {
        console.error('popstate route apply failed', error)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Re-run when welcome ↔ signed-in flips so popstate uses a fresh applyRoute.
    // applyRoute reads appRef for boards / activeBoardId (not a stale closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.ready, app.needsWelcome])

  // Board UI open but address bar still on `/` (missed push / welcome race) — sync
  // without adding an extra history entry so desktop shows `/board/<id>?qa=1`.
  useLayoutEffect(() => {
    if (!app.ready || !board) return
    const route = parsePath(window.location.pathname)
    if (route.name !== 'home') return
    replacePath(selectedId ? boardPath(board.id, selectedId) : boardPath(board.id))
    rememberHref()
  }, [app.ready, board, selectedId])

  useEffect(() => {
    if (!app.ready || app.needsWelcome || !pendingJoinCode) return
    if (joinHandledRef.current === pendingJoinCode) return
    joinHandledRef.current = pendingJoinCode
    void app.joinBoard(pendingJoinCode).then((result) => {
      const code = pendingJoinCode
      setPendingJoinCode(null)
      if (!result.ok) {
        setRouteNotice(result.reason)
        setPrefillJoinCode(code)
        replacePath(homePath())
        return
      }
      setRouteNotice(null)
      setPrefillJoinCode(null)
      replacePath(boardPath(result.boardId))
    })
  }, [app, pendingJoinCode])

  useEffect(() => {
    // Never strip `/join/<code>` (or `?src=` / `?qa=1`) before boot finishes —
    // the ready-gated route effect has not parsed the deep link yet.
    // Path writes for board ↔ collection are push/back in open/back handlers so
    // browser Back unwinds lightbox → idea/event → board → boards one step each.
    if (!app.ready) return
    if (app.needsWelcome) {
      document.title = 'Honey Drop · Idea Board'
      return
    }
    if (!board) {
      if (!pendingJoinCode && !welcomeJoinCode) replacePath(homePath())
      document.title = 'Honey Drop · Idea Board'
      return
    }
    document.title = `${board.title.trim() || 'Ours'} · Idea Board`
  }, [app.ready, board, pendingJoinCode, welcomeJoinCode, app.needsWelcome])

  const focusLocation = (point: GeoPoint) => {
    setSelectedId(null)
    setTab('calendar')
    setMapFocus(point)
  }

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

  const openBoard = (boardId: string) => {
    setRouteNotice(null)
    app.openBoard(boardId)
    pushPath(boardPath(boardId))
    rememberHref()
  }

  const openCollection = (collectionId: string) => {
    if (!board) return
    setSelectedId(collectionId)
    const current = parsePath(window.location.pathname)
    const marker = { [COLLECTION_HISTORY_KEY]: collectionId }
    // Already on a collection (e.g. save after edit): replace so Back still returns to board.
    if (
      current.name === 'board' &&
      current.boardId === board.id &&
      Boolean(current.collectionId)
    ) {
      replacePath(boardPath(board.id, collectionId), marker)
      rememberHref()
      return
    }
    // Board UI open but bar still on `/` (or wrong board): fix current entry to
    // the board, then push collection so Back unwinds collection → board → boards.
    if (current.name !== 'board' || current.boardId !== board.id) {
      replacePath(boardPath(board.id))
      pushPath(boardPath(board.id, collectionId), marker)
      rememberHref()
      return
    }
    pushPath(boardPath(board.id, collectionId), marker)
    rememberHref()
  }

  const leaveCollection = () => {
    if (!board) {
      setSelectedId(null)
      return
    }
    const route = parsePath(window.location.pathname)
    const boardUrl = boardPath(board.id)
    // Prefer unwinding a pushed collection entry so browser Back stays coherent.
    // Never bare history.back() without a marker — that overshoots to boards list
    // when the stack is thin (deep link) or a lightbox orphan shares the same URL.
    if (
      route.name === 'board' &&
      route.collectionId &&
      route.boardId === board.id &&
      historyHasCollectionEntry(route.collectionId)
    ) {
      setSelectedId(null)
      dismissAppOverlays()
      window.history.back()
      return
    }
    setSelectedId(null)
    dismissAppOverlays()
    replacePath(boardUrl, { [COLLECTION_HISTORY_KEY]: null })
    rememberHref()
  }

  const goHome = () => {
    app.closeBoard()
    setSelectedId(null)
    dismissAppOverlays()
    pushPath(homePath())
    rememberHref()
  }

  const syncBanner = (
    <>
      <DemoModeBanner />
      <SyncStatusBanner status={app.syncStatus} message={app.syncMessage} />
    </>
  )

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

  if (app.needsWelcome) {
    return (
      <WelcomeView
        busy={app.busy}
        initialCode={welcomeJoinCode}
        syncBanner={syncBanner}
        onValidateCode={app.welcomeValidateCode}
        onStartFresh={async (displayName) => {
          const result = await app.welcomeStartFresh(displayName)
          if (result.ok) {
            setWelcomeJoinCode(null)
            replacePath(homePath())
          }
          return result
        }}
        onRedeemInvite={async (code, displayName) => {
          const result = await app.welcomeRedeemInvite(code, displayName)
          if (result.ok) {
            setWelcomeJoinCode(null)
            replacePath(boardPath(result.boardId))
          }
          return result
        }}
        onRedeemRecovery={async (code) => {
          const result = await app.welcomeRedeemRecovery(code)
          if (result.ok) {
            setWelcomeJoinCode(null)
            replacePath(boardPath(result.boardId))
          }
          return result
        }}
        onRedeemDeviceLink={async (code) => {
          const result = await app.welcomeRedeemDeviceLink(code)
          if (result.ok) {
            setWelcomeJoinCode(null)
            replacePath(homePath())
          }
          return result
        }}
      />
    )
  }

  const deviceLinkModal = deviceLinkOpen ? (
    <DeviceLinkModal
      onClose={() => setDeviceLinkOpen(false)}
      onCreateCode={app.createDeviceLink}
      onClaimCode={app.claimDeviceLink}
    />
  ) : null

  if (!board) {
    return (
      <>
        <HomeView
          boards={app.boards}
          userId={app.userId}
          displayName={app.displayName}
          onDisplayName={app.setDisplayName}
          onOpen={openBoard}
          onCreate={(title) => void app.createBoard(title)}
          onJoin={app.joinBoard}
          onRequestDelete={app.requestBoardDeletion}
          onCancelDelete={app.cancelBoardDeletion}
          onConfirmDelete={app.confirmBoardDeletion}
          busy={app.busy}
          onOpenDeviceLink={() => setDeviceLinkOpen(true)}
          initialJoinCode={prefillJoinCode}
          routeNotice={routeNotice}
          onDismissNotice={() => setRouteNotice(null)}
          syncBanner={syncBanner}
          installPrompt={<InstallPrompt />}
        />
        {deviceLinkModal}
      </>
    )
  }

  const nameByUserId = Object.fromEntries(
    board.members.map((member) => [member.userId, member.name.trim() || 'You']),
  )

  if (selected) {
    return (
      <div className="shell shell--detail">
        {syncBanner}
        <CollectionDetail
          collection={selected}
          currentUserId={app.userId}
          nameByUserId={nameByUserId}
          onBack={leaveCollection}
          onEdit={() => openForm(selected.kind, selected)}
          onDelete={() => {
            app.deleteCollection(selected.id)
            leaveCollection()
          }}
          onAddItem={(input, boardWidth) => app.addItem(selected.id, input, boardWidth)}
          onDeleteItem={(itemId) => app.deleteItem(selected.id, itemId)}
          onMoveItem={(itemId, x, y, boardWidth) =>
            app.moveItem(selected.id, itemId, x, y, boardWidth)
          }
          onReorderItem={(activeId, toIndex) => app.reorderItems(selected.id, activeId, toIndex)}
          onBringItemToFront={(itemId) => app.bringItemToFront(selected.id, itemId)}
          onAddFiles={(itemId, files) => void app.addAttachments(selected.id, itemId, files)}
          onAddLink={(itemId, url) => app.addLink(selected.id, itemId, url)}
          onRemoveFile={(itemId, attachmentId) =>
            app.deleteAttachment(selected.id, itemId, attachmentId)
          }
          onCaption={(itemId, caption) => app.updateCaption(selected.id, itemId, caption)}
          onContent={(itemId, content) => app.updateContent(selected.id, itemId, content)}
          onCyclePreview={(itemId, direction) =>
            app.cycleLinkPreview(selected.id, itemId, direction)
          }
          onSetCollectionCover={(cover) => app.setCollectionCover(selected.id, cover)}
          onConvertToIdea={() => {
            const whenWhere = eventWhenWhereItem(
              selected,
              app.displayName.trim() || 'You',
              app.userId,
            )
            app.upsertCollection({
              ...selected,
              kind: 'idea',
              schedule: undefined,
              items: whenWhere ? [...selected.items, whenWhere] : selected.items,
              updatedAt: new Date().toISOString(),
            })
            setTab('ideas')
          }}
          onReact={(itemId, emoji) => app.toggleReaction(selected.id, itemId, emoji)}
          onReply={(itemId, text) => app.addReply(selected.id, itemId, text)}
        />
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
              openCollection(collection.id)
              setTab(collection.kind === 'calendar' ? 'calendar' : 'ideas')
            }}
          />
        ) : null}
        {deviceLinkModal}
      </div>
    )
  }

  return (
    <div className="shell">
      {syncBanner}
      <header className="masthead">
        <div className="brand">
          <BrandMark />
          <div>
            <BoardTitle value={board.title} onSave={app.setBoardTitle} />
            <p className="brand__sub">{boardSubtitle(board.members)}</p>
          </div>
        </div>
        <div className="who-row">
          <button type="button" className="back-btn" onClick={goHome} aria-label="Back to all boards">
            ←
          </button>
          <button
            type="button"
            className="back-btn"
            onClick={() => setDeviceLinkOpen(true)}
            aria-label="Use another device"
            title="Use another device"
          >
            <DeviceLinkIcon />
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
                <LocationPin
                  label={partner.name || 'Partner'}
                  onClick={() => focusLocation(partner.location!)}
                />
              ) : null}
              {hasPartner ? (
                <button
                  type="button"
                  className="who__partner-btn"
                  onClick={() => setInviteOpen(true)}
                  aria-label={`Partner access help for ${partner?.name ?? 'Partner'}`}
                  title="Partner lost access? Generate a recovery code"
                >
                  {partner?.name?.trim() || 'Partner'}
                </button>
              ) : (
                <PencilHint
                  active={hints.current === 'invite'}
                  text="invite your partner with a code!"
                  placement="below-end"
                >
                  <button
                    type="button"
                    className="primary who__invite"
                    onClick={() => {
                      setInviteOpen(true)
                      completeHint('invite')
                    }}
                    aria-label="Invite partner"
                  >
                    Invite code
                  </button>
                </PencilHint>
              )}
            </div>
          </div>
        </div>
      </header>

      <PencilHint
        active={hints.current === 'tabs' && !inviteOpen}
        text="add events or flip to drop ideas!"
        placement="right"
        className="pencil-hint--tabs"
      >
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
      </PencilHint>

      {tab === 'calendar' ? (
        <CalendarView
          collections={collections}
          members={board.members}
          userId={app.userId}
          cursor={cursor}
          selectedDate={selectedDate}
          onCursor={setCursor}
          onSelectDate={setSelectedDate}
          onOpen={openCollection}
          onCreate={() => openForm('calendar')}
          onSetMyLocation={app.setMemberLocation}
          focusPoint={mapFocus}
          onFocusLocation={focusLocation}
          onMapFocused={() => setMapFocus(null)}
        />
      ) : (
        <IdeasView
          collections={collections}
          onOpen={openCollection}
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
            openCollection(collection.id)
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
          onCreateRecovery={() => app.createSeatRecovery(board.id)}
        />
      ) : null}
      {deviceLinkModal}
    </div>
  )
}
