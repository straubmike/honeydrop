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
import { clearItemMedia, isMediaItem, itemAttachments, itemMediaAttachments, clearCoverIfStale } from './attachments'
import { uid } from './dates'
import { classifyMedia, MAX_MEDIA_BYTES, normalizeUrl } from './images'
import { isSupabaseConfigured } from './lib/supabase'
import { fetchPreviewFiles, previewPairUrls } from './linkPreview'
import { isStoredMedia, removeStoredMedia } from './mediaStore'
import { nextPin, resolvePin } from './pins'
import { withDevSampleLocations } from './seed'
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
    const content = await uploadBoardMedia(boardId, id, file, file.type)
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

  const skipPersistRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyBoardsRef = useRef<Set<string>>(new Set())
  const dirtyMembersRef = useRef<Set<string>>(new Set())
  const stateRef = useRef(state)
  const boardIdsKey = state.boards.map((board) => board.id).join(',')

  const markBoardDirty = useCallback((boardId: string) => {
    dirtyBoardsRef.current.add(boardId)
  }, [])

  const markMemberDirty = useCallback((boardId: string) => {
    dirtyMembersRef.current.add(boardId)
  }, [])

  const flushPersist = useCallback(async () => {
    if (!isSupabaseConfigured || !stateRef.current.userId) return
    const boardIds = [...dirtyBoardsRef.current]
    const memberIds = [...dirtyMembersRef.current]
    dirtyBoardsRef.current.clear()
    dirtyMembersRef.current.clear()

    const snapshot = stateRef.current
    await Promise.all([
      ...boardIds.map(async (boardId) => {
        const board = snapshot.boards.find((entry) => entry.id === boardId)
        if (!board) return
        await persistBoard(board)
      }),
      ...memberIds.map(async (boardId) => {
        const board = snapshot.boards.find((entry) => entry.id === boardId)
        const me = board?.members.find((member) => member.userId === snapshot.userId)
        if (!board || !me) return
        await persistMyMembership(boardId, snapshot.userId, {
          name: me.name,
          location: me.location ?? null,
        })
      }),
    ])
  }, [])

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      void flushPersist().catch((error) => {
        console.error('Failed to save board', error)
      })
    }, PERSIST_MS)
  }, [flushPersist])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isSupabaseConfigured) {
        setBootError(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment, then rebuild.',
        )
        setReady(true)
        return
      }
      try {
        const { userId } = await ensureAnonymousSession()
        if (cancelled) return
        const profile = await loadProfile(userId)
        const boards = await fetchMyBoards()
        if (cancelled) return
        skipPersistRef.current = true
        setState({
          userId,
          displayName: profile.displayName,
          boards: import.meta.env.DEV ? withDevSampleLocations(boards, userId) : boards,
        })
        setBootError(null)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Could not connect to Honey Drop.'
        setBootError(message)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      if (!isSupabaseConfigured) return null
      setBusy(true)
      try {
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
    [state.displayName],
  )

  const joinBoard = useCallback(
    async (rawCode: string): Promise<{ ok: true; boardId: string } | { ok: false; reason: string }> => {
      if (!isSupabaseConfigured) {
        return { ok: false, reason: 'Cloud sync is not configured.' }
      }
      setBusy(true)
      try {
        const result = await joinRemoteBoard(rawCode, state.displayName)
        if (!result.ok) return result
        const board = await fetchBoard(result.boardId)
        if (!board) return { ok: false, reason: 'Joined, but the board could not be loaded.' }
        skipPersistRef.current = true
        setState((prev) => {
          const without = prev.boards.filter((entry) => entry.id !== board.id)
          return { ...prev, boards: [board, ...without] }
        })
        setActiveBoardId(result.boardId)
        return result
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
        input.type === 'link' || input.type === 'text' || input.type === 'drawing'
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
      const files = await fetchPreviewFiles(previewPairUrls(candidates, nextIndex))
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

  const claimDeviceLink = useCallback(async (code: string) => {
    const result = await claimDeviceLinkCode(code)
    if (!result.ok) return result
    const profile = await loadProfile(stateRef.current.userId)
    const boards = await fetchMyBoards()
    skipPersistRef.current = true
    setState((prev) => ({
      ...prev,
      displayName: profile.displayName,
      boards,
    }))
    return { ok: true as const }
  }, [])

  return {
    ready,
    bootError,
    busy,
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
  }
}

/** @deprecated Prefer useApp */
export function useBoard() {
  return useApp()
}
