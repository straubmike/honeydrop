import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createRemoteBoard,
  deleteRemoteBoard,
  ensureAnonymousSession,
  fetchBoard,
  fetchMyBoards,
  joinRemoteBoard,
  loadProfile,
  persistBoard,
  persistMyMembership,
  subscribeToBoards,
  updateProfileName,
} from './api/boards'
import { claimDeviceLinkCode, createDeviceLinkCode } from './api/deviceLink'
import { deleteBoardMediaFolder, uploadBoardMedia } from './api/media'
import { claimSeatRecoveryCode, createSeatRecoveryCode } from './api/seatRecovery'
import { clearItemMedia, isMediaItem, itemAttachments, itemMediaAttachments, clearCoverIfStale } from './attachments'
import { uid } from './dates'
import { classifyMedia, MAX_MEDIA_BYTES, normalizeUrl } from './images'
import { createInviteCode } from './lib/inviteCode'
import { isSupabaseConfigured } from './lib/supabase'
import { fetchPreviewFiles, previewFetchUrls } from './linkPreview'
import { isStoredMedia, putMedia, removeStoredMedia } from './mediaStore'
import {
  cacheAppSnapshot,
  clearPersistQueueItem,
  deletePendingMedia,
  enqueuePersist,
  isBrowserOnline,
  listPendingMedia,
  listPersistQueue,
  loadCachedApp,
  pendingMediaRef,
  putPendingMedia,
  type SyncStatus,
} from './offlineStore'
import { nextPin, resolvePin } from './pins'
import { withDevSampleLocations } from './seed'
import { loadApp, saveApp } from './storage'
import type {
  AppState,
  Attachment,
  Collection,
  CollectionCoverPreview,
  CollectionKind,
  IdeaBoard,
  GeoPoint,
  Item,
  NewItemInput,
  Reply,
} from './types'

const PERSIST_MS = 450

function clearMedia(items: Item[]) {
  for (const item of items) clearItemMedia(item)
}

async function filesToAttachments(
  boardId: string,
  files: File[],
  source: Attachment['source'] = 'upload',
): Promise<Attachment[]> {
  const attachments: Attachment[] = []
  for (const file of files) {
    if (file.size > MAX_MEDIA_BYTES) continue
    const kind = classifyMedia(file)
    if (!kind) continue
    const id = uid()
    let content: string
    if (!isSupabaseConfigured) {
      await putMedia(id, file)
      content = `idb:${id}`
    } else {
      try {
        if (!isBrowserOnline()) throw new Error('offline')
        content = await uploadBoardMedia(boardId, id, file, file.type)
      } catch {
        await putPendingMedia({
          id,
          boardId,
          mime: file.type,
          source: source === 'preview' ? 'preview' : 'upload',
          blob: file,
        })
        content = pendingMediaRef(id)
      }
    }
    attachments.push({
      id,
      type: kind,
      content,
      mime: file.type,
      source,
    })
  }
  return attachments
}

function rewritePendingContent(board: IdeaBoard, pendingId: string, sbContent: string): IdeaBoard {
  const rewriteAttachment = (attachment: Attachment): Attachment =>
    attachment.id === pendingId || attachment.content === pendingMediaRef(pendingId)
      ? { ...attachment, content: sbContent }
      : attachment

  return {
    ...board,
    collections: board.collections.map((collection) => ({
      ...collection,
      items: collection.items.map((item) => ({
        ...item,
        content:
          item.content === pendingMediaRef(pendingId) ? sbContent : item.content,
        attachments: item.attachments?.map(rewriteAttachment),
      })),
    })),
  }
}

function mapBoard(
  state: AppState,
  boardId: string,
  updater: (board: IdeaBoard) => IdeaBoard,
): AppState {
  return {
    ...state,
    boards: state.boards.map((board) => {
      if (board.id !== boardId) return board
      return { ...updater(board), updatedAt: new Date().toISOString() }
    }),
  }
}

function emptyState(): AppState {
  return { userId: '', displayName: 'You', boards: [] }
}

export function useApp() {
  const [state, setState] = useState<AppState>(emptyState)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    isBrowserOnline() ? 'online' : 'offline',
  )
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const skipPersistRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyBoardsRef = useRef<Set<string>>(new Set())
  const dirtyMembersRef = useRef<Set<string>>(new Set())
  const stateRef = useRef(state)
  const flushingRef = useRef(false)
  const boardIdsKey = state.boards.map((board) => board.id).join(',')

  const markBoardDirty = useCallback((boardId: string) => {
    dirtyBoardsRef.current.add(boardId)
    void enqueuePersist({ kind: 'board', boardId })
  }, [])

  const markMemberDirty = useCallback((boardId: string) => {
    dirtyMembersRef.current.add(boardId)
    void enqueuePersist({ kind: 'member', boardId })
  }, [])

  const flushPersist = useCallback(async () => {
    if (!isSupabaseConfigured || !stateRef.current.userId) return
    if (!isBrowserOnline()) {
      setSyncStatus('offline')
      setSyncMessage('Offline — changes will sync when you reconnect')
      for (const boardId of dirtyBoardsRef.current) {
        await enqueuePersist({ kind: 'board', boardId })
      }
      for (const boardId of dirtyMembersRef.current) {
        await enqueuePersist({ kind: 'member', boardId })
      }
      return
    }

    if (flushingRef.current) return
    flushingRef.current = true
    setSyncStatus('syncing')
    setSyncMessage(null)

    try {
      const queued = await listPersistQueue()
      for (const item of queued) {
        if (item.kind === 'board') dirtyBoardsRef.current.add(item.boardId)
        else dirtyMembersRef.current.add(item.boardId)
      }

      const pending = await listPendingMedia()
      for (const media of pending) {
        try {
          const sbContent = await uploadBoardMedia(media.boardId, media.id, media.blob, media.mime)
          const nextBoards = stateRef.current.boards.map((board) =>
            board.id === media.boardId ? rewritePendingContent(board, media.id, sbContent) : board,
          )
          stateRef.current = { ...stateRef.current, boards: nextBoards }
          skipPersistRef.current = true
          setState(stateRef.current)
          dirtyBoardsRef.current.add(media.boardId)
          await deletePendingMedia(media.id)
        } catch (error) {
          console.error('Pending media upload failed', error)
        }
      }

      const boardIds = [...dirtyBoardsRef.current]
      const memberIds = [...dirtyMembersRef.current]
      dirtyBoardsRef.current.clear()
      dirtyMembersRef.current.clear()

      const snapshot = stateRef.current
      const failures: string[] = []

      await Promise.all([
        ...boardIds.map(async (boardId) => {
          const board = snapshot.boards.find((entry) => entry.id === boardId)
          if (!board) {
            await clearPersistQueueItem({ kind: 'board', boardId })
            return
          }
          try {
            await persistBoard(board)
            await clearPersistQueueItem({ kind: 'board', boardId })
          } catch (error) {
            console.error('Failed to save board', error)
            dirtyBoardsRef.current.add(boardId)
            await enqueuePersist({ kind: 'board', boardId })
            failures.push(boardId)
          }
        }),
        ...memberIds.map(async (boardId) => {
          const board = snapshot.boards.find((entry) => entry.id === boardId)
          const me = board?.members.find((member) => member.userId === snapshot.userId)
          if (!board || !me) {
            await clearPersistQueueItem({ kind: 'member', boardId })
            return
          }
          try {
            await persistMyMembership(boardId, snapshot.userId, {
              name: me.name,
              location: me.location ?? null,
            })
            await clearPersistQueueItem({ kind: 'member', boardId })
          } catch (error) {
            console.error('Failed to save membership', error)
            dirtyMembersRef.current.add(boardId)
            await enqueuePersist({ kind: 'member', boardId })
            failures.push(boardId)
          }
        }),
      ])

      if (failures.length) {
        setSyncStatus('error')
        setSyncMessage('Could not sync — will retry when online')
      } else {
        setSyncStatus('online')
        setSyncMessage(null)
        await cacheAppSnapshot(stateRef.current)
      }
    } finally {
      flushingRef.current = false
    }
  }, [])

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      void flushPersist().catch((error) => {
        console.error('Failed to save board', error)
        setSyncStatus(isBrowserOnline() ? 'error' : 'offline')
        setSyncMessage(
          isBrowserOnline()
            ? 'Could not sync — will retry when online'
            : 'Offline — changes will sync when you reconnect',
        )
      })
    }, PERSIST_MS)
  }, [flushPersist])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isSupabaseConfigured) {
        const local = loadApp()
        if (cancelled) return
        skipPersistRef.current = true
        setState(local)
        setBootError(null)
        setSyncStatus('offline')
        setSyncMessage(null)
        setReady(true)
        console.info(
          '[honeydrop] LOCAL DEMO MODE — no VITE_SUPABASE_* keys. Sample data only; not the live database.',
        )
        return
      }
      try {
        const { userId } = await ensureAnonymousSession()
        if (cancelled) return
        const profile = await loadProfile(userId)
        const boards = await fetchMyBoards()
        if (cancelled) return
        const nextState: AppState = {
          userId,
          displayName: profile.displayName,
          boards: import.meta.env.DEV ? withDevSampleLocations(boards, userId) : boards,
        }
        skipPersistRef.current = true
        setState(nextState)
        setBootError(null)
        setSyncStatus('online')
        setSyncMessage(null)
        await cacheAppSnapshot(nextState)
      } catch (error) {
        if (cancelled) return
        const cached = await loadCachedApp()
        if (cached?.userId) {
          skipPersistRef.current = true
          setState(cached)
          setBootError(null)
          setSyncStatus('offline')
          setSyncMessage('Offline — showing last saved boards')
        } else {
          const message = error instanceof Error ? error.message : 'Could not connect to Honey Drop.'
          setBootError(message)
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onOnline = () => {
      setSyncStatus('syncing')
      setSyncMessage(null)
      void flushPersist()
    }
    const onOffline = () => {
      setSyncStatus('offline')
      setSyncMessage('Offline — changes will sync when you reconnect')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [flushPersist])

  useEffect(() => {
    if (!ready || !state.userId) return
    if (isSupabaseConfigured) {
      void cacheAppSnapshot(state)
      return
    }
    try {
      saveApp(state)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        window.alert('The board is out of local storage space. Try a smaller image.')
      } else {
        console.error('Failed to save local demo board', error)
      }
    }
  }, [ready, state])
  useEffect(() => {
    if (!ready || skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    if (!state.userId || !isSupabaseConfigured) return
    schedulePersist()
  }, [ready, schedulePersist, state])

  useEffect(() => {
    if (!ready || !isSupabaseConfigured || !state.userId) return
    const boardIds = boardIdsKey ? boardIdsKey.split(',') : []
    return subscribeToBoards(boardIds, (boardId) => {
      void (async () => {
        try {
          const remote = await fetchBoard(boardId)
          skipPersistRef.current = true
          setState((prev) => {
            if (!remote) {
              return { ...prev, boards: prev.boards.filter((board) => board.id !== boardId) }
            }
            const exists = prev.boards.some((board) => board.id === boardId)
            if (!exists) {
              const next = import.meta.env.DEV
                ? withDevSampleLocations([remote], prev.userId)[0]!
                : remote
              return { ...prev, boards: [next, ...prev.boards] }
            }
            const local = prev.boards.find((board) => board.id === boardId)
            if (local && local.updatedAt > remote.updatedAt) return prev
            return {
              ...prev,
              boards: prev.boards.map((board) =>
                board.id === boardId
                  ? import.meta.env.DEV
                    ? withDevSampleLocations([remote], prev.userId)[0]!
                    : remote
                  : board,
              ),
            }
          })
          if (!remote) {
            setActiveBoardId((current) => (current === boardId ? null : current))
          }
        } catch (error) {
          console.error('Realtime board refresh failed', error)
        }
      })()
    })
  }, [ready, boardIdsKey, state.userId])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const activeBoard = useMemo(
    () => state.boards.find((board) => board.id === activeBoardId) ?? null,
    [state.boards, activeBoardId],
  )

  const setDisplayName = useCallback(
    (displayName: string) => {
      const boards = stateRef.current.boards
      for (const board of boards) markMemberDirty(board.id)
      setState((prev) => ({
        ...prev,
        displayName,
        boards: prev.boards.map((board) => ({
          ...board,
          members: board.members.map((member) =>
            member.userId === prev.userId ? { ...member, name: displayName.trim() || 'You' } : member,
          ),
        })),
      }))
      if (stateRef.current.userId && isSupabaseConfigured) {
        void updateProfileName(stateRef.current.userId, displayName).catch(console.error)
      }
    },
    [markMemberDirty],
  )

  const createBoard = useCallback(
    async (title: string) => {
      setBusy(true)
      try {
        if (!isSupabaseConfigured) {
          const now = new Date().toISOString()
          const boardId = uid()
          const trimmed = title.trim() || 'Ours'
          const board: IdeaBoard = {
            id: boardId,
            title: trimmed,
            createdAt: now,
            updatedAt: now,
            inviteCode: createInviteCode(),
            members: [{ userId: state.userId, name: state.displayName.trim() || 'You' }],
            collections: [],
          }
          setState((prev) => ({ ...prev, boards: [board, ...prev.boards] }))
          setActiveBoardId(boardId)
          return boardId
        }
        const boardId = await createRemoteBoard(title, state.displayName)
        const board = await fetchBoard(boardId)
        if (!board) throw new Error('Created board could not be loaded')
        skipPersistRef.current = true
        setState((prev) => ({ ...prev, boards: [board, ...prev.boards.filter((entry) => entry.id !== board.id)] }))
        setActiveBoardId(boardId)
        return boardId
      } finally {
        setBusy(false)
      }
    },
    [state.displayName, state.userId],
  )

  const joinBoard = useCallback(
    async (rawCode: string): Promise<{ ok: true; boardId: string } | { ok: false; reason: string }> => {
      if (!isSupabaseConfigured) {
        return { ok: false, reason: 'Cloud sync is not configured.' }
      }
      setBusy(true)
      try {
        let boardId: string | null = null
        const invite = await joinRemoteBoard(rawCode, state.displayName)
        if (invite.ok) {
          boardId = invite.boardId
        } else if (invite.code === 'NOT_FOUND') {
          const recovered = await claimSeatRecoveryCode(rawCode, state.displayName)
          if (!recovered.ok) return recovered
          boardId = recovered.boardId
        } else {
          return invite
        }
        const board = await fetchBoard(boardId)
        if (!board) return { ok: false, reason: 'Joined, but the board could not be loaded.' }
        skipPersistRef.current = true
        setState((prev) => {
          const without = prev.boards.filter((entry) => entry.id !== board.id)
          return { ...prev, boards: [board, ...without] }
        })
        setActiveBoardId(boardId)
        return { ok: true, boardId }
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : 'Could not join that board.',
        }
      } finally {
        setBusy(false)
      }
    },
    [state.displayName],
  )

  const deleteBoard = useCallback(async (boardId: string) => {
    const doomed = stateRef.current.boards.find((board) => board.id === boardId)
    if (doomed) {
      for (const collection of doomed.collections) clearMedia(collection.items)
    }
    setState((prev) => ({ ...prev, boards: prev.boards.filter((board) => board.id !== boardId) }))
    setActiveBoardId((current) => (current === boardId ? null : current))
    if (isSupabaseConfigured) {
      try {
        await deleteBoardMediaFolder(boardId)
      } catch {
        /* best-effort */
      }
      await deleteRemoteBoard(boardId)
    }
  }, [])

  const requestBoardDeletion = useCallback(
    (boardId: string) => {
      let deleteNow = false
      setState((prev) => {
        const board = prev.boards.find((entry) => entry.id === boardId)
        if (!board) return prev
        if (board.members.length < 2) {
          deleteNow = true
          return prev
        }
        markBoardDirty(boardId)
        return {
          ...prev,
          boards: prev.boards.map((entry) =>
            entry.id === boardId
              ? {
                  ...entry,
                  updatedAt: new Date().toISOString(),
                  pendingDeletion: {
                    requestedBy: prev.userId,
                    requestedAt: new Date().toISOString(),
                  },
                }
              : entry,
          ),
        }
      })
      if (deleteNow) void deleteBoard(boardId)
    },
    [deleteBoard, markBoardDirty],
  )

  const cancelBoardDeletion = useCallback(
    (boardId: string) => {
      markBoardDirty(boardId)
      setState((prev) => ({
        ...prev,
        boards: prev.boards.map((board) =>
          board.id === boardId
            ? { ...board, updatedAt: new Date().toISOString(), pendingDeletion: undefined }
            : board,
        ),
      }))
    },
    [markBoardDirty],
  )

  const confirmBoardDeletion = useCallback(
    (boardId: string) => {
      let allowed = false
      setState((prev) => {
        const board = prev.boards.find((entry) => entry.id === boardId)
        if (!board?.pendingDeletion) return prev
        if (board.pendingDeletion.requestedBy === prev.userId) return prev
        allowed = true
        return prev
      })
      if (allowed) void deleteBoard(boardId)
    },
    [deleteBoard],
  )

  const setBoardTitle = useCallback(
    (title: string) => {
      if (!activeBoardId) return
      const next = title.trim() || 'Ours'
      markBoardDirty(activeBoardId)
      setState((prev) => mapBoard(prev, activeBoardId, (board) => ({ ...board, title: next })))
    },
    [activeBoardId, markBoardDirty],
  )

  const upsertCollection = useCallback(
    (collection: Collection) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => {
          const exists = board.collections.some((entry) => entry.id === collection.id)
          return {
            ...board,
            collections: exists
              ? board.collections.map((entry) => (entry.id === collection.id ? collection : entry))
              : [collection, ...board.collections],
          }
        }),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const deleteCollection = useCallback(
    (id: string) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => {
          const doomed = board.collections.find((collection) => collection.id === id)
          if (doomed) clearMedia(doomed.items)
          return {
            ...board,
            collections: board.collections.filter((collection) => collection.id !== id),
          }
        }),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const addItem = useCallback(
    async (collectionId: string, input: NewItemInput, boardWidth = 900) => {
      if (!activeBoardId) return
      const attachments = input.files?.length
        ? await filesToAttachments(activeBoardId, input.files, input.fileSource ?? 'upload')
        : []
      const type =
        input.type === 'link' || input.type === 'text' || input.type === 'drawing' || input.type === 'list'
          ? input.type
          : (attachments[0]?.type ?? input.type)
      const collection = activeBoard?.collections.find((entry) => entry.id === collectionId)
      const pin = nextPin(collection?.items ?? [], boardWidth)
      const next: Item = {
        id: uid(),
        type,
        content: input.content ?? '',
        caption: input.caption,
        mime: attachments[0]?.mime,
        attachments,
        previewCandidates: input.previewCandidates?.length ? input.previewCandidates : undefined,
        previewIndex: input.previewCandidates?.length ? 0 : undefined,
        x: pin.x,
        y: pin.y,
        z: pin.z,
        author: state.displayName.trim() || 'You',
        authorUserId: state.userId,
        createdAt: new Date().toISOString(),
        reactions: [],
        replies: [],
      }
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((entry) =>
            entry.id === collectionId
              ? {
                  ...entry,
                  updatedAt: next.createdAt,
                  items: [...entry.items, next],
                }
              : entry,
          ),
        })),
      )
    },
    [activeBoard, activeBoardId, markBoardDirty, state.displayName, state.userId],
  )

  const addAttachments = useCallback(
    async (collectionId: string, itemId: string, files: File[]) => {
      if (!activeBoardId) return
      const attachments = await filesToAttachments(activeBoardId, files)
      if (!attachments.length) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item) => {
                if (item.id !== itemId || !isMediaItem(item)) return item
                const current = itemAttachments(item)
                const links = current.filter((part) => part.type === 'link')
                const media = itemMediaAttachments(item)
                const type = media[0]?.type ?? attachments[0]!.type
                return {
                  ...item,
                  type,
                  attachments: [...media, ...attachments, ...links],
                }
              }),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const addLink = useCallback(
    (collectionId: string, itemId: string, rawUrl: string) => {
      if (!activeBoardId) return
      const url = normalizeUrl(rawUrl)
      if (!url) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item) => {
                if (item.id !== itemId || item.type !== 'link') return item
                const current = itemAttachments(item)
                const known = new Set([
                  item.content,
                  ...current.filter((part) => part.type === 'link').map((part) => part.content),
                ])
                if (known.has(url)) return item
                const link = { id: uid(), type: 'link' as const, content: url, source: 'upload' as const }
                return { ...item, attachments: [...current, link] }
              }),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const deleteAttachment = useCallback(
    (collectionId: string, itemId: string, attachmentId: string) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              coverPreview: clearCoverIfStale(collection.coverPreview, itemId, attachmentId),
              items: collection.items.map((item) => {
                if (item.id !== itemId) return item
                const current = itemAttachments(item)
                const doomed = current.find((part) => part.id === attachmentId)
                if (doomed?.type !== 'link' && doomed && isStoredMedia(doomed.content)) {
                  void removeStoredMedia(doomed.content, doomed.id)
                }
                return {
                  ...item,
                  attachments: current.filter((part) => part.id !== attachmentId),
                }
              }),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const deleteItem = useCallback(
    (collectionId: string, itemId: string) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            const doomed = collection.items.find((item) => item.id === itemId)
            if (doomed) clearItemMedia(doomed)
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              coverPreview: clearCoverIfStale(collection.coverPreview, itemId),
              items: collection.items.filter((item) => item.id !== itemId),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const moveItem = useCallback(
    (collectionId: string, itemId: string, x: number, y: number, boardWidth: number) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            const maxZ = collection.items.reduce((max, item) => Math.max(max, item.z ?? 0), 0)
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item, index) => {
                const pin = resolvePin(item, index, boardWidth)
                if (item.id === itemId) {
                  return { ...item, x, y, z: maxZ + 1 }
                }
                if (item.x == null || item.y == null) {
                  return { ...item, x: pin.x, y: pin.y, z: pin.z }
                }
                return item
              }),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const toggleReaction = useCallback(
    (collectionId: string, itemId: string, emoji: string) => {
      if (!activeBoardId) return
      const authorId = state.userId
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              items: collection.items.map((entry) => {
                if (entry.id !== itemId) return entry
                const existing = entry.reactions.find((r) => r.emoji === emoji)
                if (!existing) {
                  return {
                    ...entry,
                    reactions: [...entry.reactions, { emoji, authorIds: [authorId] }],
                  }
                }
                const hasMine = existing.authorIds.includes(authorId)
                const authorIds = hasMine
                  ? existing.authorIds.filter((id) => id !== authorId)
                  : [...existing.authorIds, authorId]
                const reactions = authorIds.length
                  ? entry.reactions.map((r) => (r.emoji === emoji ? { ...r, authorIds } : r))
                  : entry.reactions.filter((r) => r.emoji !== emoji)
                return { ...entry, reactions }
              }),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty, state.userId],
  )

  const addReply = useCallback(
    (collectionId: string, itemId: string, text: string) => {
      if (!activeBoardId) return
      const reply: Reply = {
        id: uid(),
        author: state.displayName.trim() || 'You',
        authorUserId: state.userId,
        text,
        createdAt: new Date().toISOString(),
      }
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) =>
            collection.id === collectionId
              ? {
                  ...collection,
                  updatedAt: reply.createdAt,
                  items: collection.items.map((entry) =>
                    entry.id === itemId ? { ...entry, replies: [...entry.replies, reply] } : entry,
                  ),
                }
              : collection,
          ),
        })),
      )
    },
    [activeBoardId, markBoardDirty, state.displayName, state.userId],
  )

  const updateCaption = useCallback(
    (collectionId: string, itemId: string, caption: string) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item) =>
                item.id === itemId ? { ...item, caption: caption.trim() || undefined } : item,
              ),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const updateContent = useCallback(
    (collectionId: string, itemId: string, content: string) => {
      if (!activeBoardId) return
      const next = content.trim()
      if (!next) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item) =>
                item.id === itemId ? { ...item, content: next } : item,
              ),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const cycleLinkPreview = useCallback(
    async (collectionId: string, itemId: string, direction: 'forward' | 'backward' = 'forward') => {
      if (!activeBoardId || !activeBoard) return
      const collection = activeBoard.collections.find((entry) => entry.id === collectionId)
      const item = collection?.items.find((entry) => entry.id === itemId)
      const candidates = item?.previewCandidates ?? []
      if (!item || item.type !== 'link' || candidates.length <= 2) return

      const step = direction === 'forward' ? 2 : -2
      const nextIndex =
        ((((item.previewIndex ?? 0) + step) % candidates.length) + candidates.length) % candidates.length
      const files = await fetchPreviewFiles(previewFetchUrls(item.content, candidates, nextIndex))
      const extra = files.length ? await filesToAttachments(activeBoardId, files, 'preview') : []
      if (!extra.length) return

      const replaced = itemMediaAttachments(item).filter((part) => part.source === 'preview')
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((entry) => {
            if (entry.id !== collectionId) return entry
            return {
              ...entry,
              updatedAt: new Date().toISOString(),
              items: entry.items.map((current) => {
                if (current.id !== itemId) return current
                const currentAttachments = itemAttachments(current)
                const keep = currentAttachments.filter((part) => part.source !== 'preview')
                return {
                  ...current,
                  previewIndex: nextIndex,
                  attachments: [...keep, ...extra],
                }
              }),
            }
          }),
        })),
      )
      for (const old of replaced) {
        if (isStoredMedia(old.content)) void removeStoredMedia(old.content, old.id)
      }
    },
    [activeBoard, activeBoardId, markBoardDirty],
  )

  const bringItemToFront = useCallback(
    (collectionId: string, itemId: string) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            const maxZ = collection.items.reduce((max, item) => Math.max(max, item.z ?? 0), 0)
            const target = collection.items.find((item) => item.id === itemId)
            if (!target || (target.z ?? 0) >= maxZ) return collection
            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: collection.items.map((item) =>
                item.id === itemId ? { ...item, z: maxZ + 1 } : item,
              ),
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const setMemberLocation = useCallback(
    (location?: GeoPoint) => {
      if (!activeBoardId) return
      markMemberDirty(activeBoardId)
      setState((prev) => ({
        ...prev,
        boards: prev.boards.map((board) => {
          if (board.id !== activeBoardId) return board
          return {
            ...board,
            members: board.members.map((member) =>
              member.userId === prev.userId ? { ...member, location } : member,
            ),
          }
        }),
      }))
    },
    [activeBoardId, markMemberDirty],
  )

  const setCollectionCover = useCallback(
    (collectionId: string, cover: CollectionCoverPreview) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) =>
            collection.id === collectionId
              ? { ...collection, updatedAt: new Date().toISOString(), coverPreview: cover }
              : collection,
          ),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const reorderCollections = useCallback(
    (kind: CollectionKind, activeId: string, toIndex: number) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => {
          const ofKind = board.collections.filter((collection) => collection.kind === kind)
          const fromIndex = ofKind.findIndex((collection) => collection.id === activeId)
          if (fromIndex < 0) return board

          const nextOfKind = [...ofKind]
          const [moved] = nextOfKind.splice(fromIndex, 1)
          if (!moved) return board
          const clamped = Math.max(0, Math.min(toIndex, nextOfKind.length))
          if (clamped === fromIndex) return board
          nextOfKind.splice(clamped, 0, moved)

          let index = 0
          return {
            ...board,
            collections: board.collections.map((collection) =>
              collection.kind === kind ? nextOfKind[index++]! : collection,
            ),
          }
        }),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const reorderItems = useCallback(
    (collectionId: string, activeId: string, toIndex: number) => {
      if (!activeBoardId) return
      markBoardDirty(activeBoardId)
      setState((prev) =>
        mapBoard(prev, activeBoardId, (board) => ({
          ...board,
          collections: board.collections.map((collection) => {
            if (collection.id !== collectionId) return collection
            const fromIndex = collection.items.findIndex((item) => item.id === activeId)
            if (fromIndex < 0) return collection

            const nextItems = [...collection.items]
            const [moved] = nextItems.splice(fromIndex, 1)
            if (!moved) return collection
            const clamped = Math.max(0, Math.min(toIndex, nextItems.length))
            if (clamped === fromIndex) return collection
            nextItems.splice(clamped, 0, moved)

            return {
              ...collection,
              updatedAt: new Date().toISOString(),
              items: nextItems,
            }
          }),
        })),
      )
    },
    [activeBoardId, markBoardDirty],
  )

  const createDeviceLink = useCallback(async () => createDeviceLinkCode(), [])

  const createSeatRecovery = useCallback(async (boardId: string) => createSeatRecoveryCode(boardId), [])

  const claimDeviceLink = useCallback(async (code: string) => {
    const result = await claimDeviceLinkCode(code)
    if (!result.ok) return result
    const profile = await loadProfile(result.userId)
    const boards = await fetchMyBoards()
    skipPersistRef.current = true
    setState({
      userId: result.userId,
      displayName: profile.displayName,
      boards,
    })
    setActiveBoardId(null)
    return { ok: true as const }
  }, [])

  return {
    ready,
    bootError,
    busy,
    syncStatus,
    syncMessage,
    userId: state.userId,
    displayName: state.displayName,
    boards: state.boards,
    activeBoard,
    activeBoardId,
    openBoard: setActiveBoardId,
    closeBoard: () => setActiveBoardId(null),
    createBoard,
    joinBoard,
    deleteBoard,
    requestBoardDeletion,
    cancelBoardDeletion,
    confirmBoardDeletion,
    setBoardTitle,
    setDisplayName,
    setMemberLocation,
    upsertCollection,
    deleteCollection,
    addItem,
    addAttachments,
    addLink,
    deleteAttachment,
    deleteItem,
    moveItem,
    bringItemToFront,
    setCollectionCover,
    reorderItems,
    reorderCollections,
    toggleReaction,
    addReply,
    updateCaption,
    updateContent,
    cycleLinkPreview,
    createDeviceLink,
    claimDeviceLink,
    createSeatRecovery,
  }
}

/** @deprecated Prefer useApp */
export function useBoard() {
  return useApp()
}
