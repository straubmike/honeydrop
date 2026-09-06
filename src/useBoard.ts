import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearItemMedia, isMediaItem, itemAttachments, itemMediaAttachments, clearCoverIfStale } from './attachments'
import { uid } from './dates'
import { classifyMedia, MAX_MEDIA_BYTES, normalizeUrl } from './images'
import { fetchPreviewFiles, previewPairUrls } from './linkPreview'
import { isStoredMedia, deleteMedia, putMedia } from './mediaStore'
import { nextPin, resolvePin } from './pins'
import { createInviteCode, loadApp, saveApp } from './storage'
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

function clearMedia(items: Item[]) {
  for (const item of items) clearItemMedia(item)
}

async function filesToAttachments(
  files: File[],
  source: Attachment['source'] = 'upload',
): Promise<Attachment[]> {
  const attachments: Attachment[] = []
  for (const file of files) {
    if (file.size > MAX_MEDIA_BYTES) continue
    const kind = classifyMedia(file)
    if (!kind) continue
    const id = uid()
    await putMedia(id, file)
    attachments.push({
      id,
      type: kind,
      content: `idb:${id}`,
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

export function useApp() {
  const [state, setState] = useState(loadApp)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)

  useEffect(() => {
    try {
      saveApp(state)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        window.alert('The board is out of local storage space. Try a smaller image.')
      } else {
        throw error
      }
    }
  }, [state])

  const activeBoard = useMemo(
    () => state.boards.find((board) => board.id === activeBoardId) ?? null,
    [state.boards, activeBoardId],
  )

  const setDisplayName = useCallback((displayName: string) => {
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
  }, [])

  const createBoard = useCallback((title: string) => {
    const now = new Date().toISOString()
    const trimmed = title.trim() || 'Ours'
    const boardId = uid()
    setState((prev) => {
      const board: IdeaBoard = {
        id: boardId,
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        inviteCode: createInviteCode(),
        members: [{ userId: prev.userId, name: prev.displayName.trim() || 'You' }],
        collections: [],
      }
      return { ...prev, boards: [board, ...prev.boards] }
    })
    setActiveBoardId(boardId)
    return boardId
  }, [])

  const joinBoard = useCallback((rawCode: string): { ok: true; boardId: string } | { ok: false; reason: string } => {
    const code = rawCode.trim().toUpperCase()
    if (!code) return { ok: false, reason: 'Enter an invite code.' }

    let boardId: string | null = null
    let reason = 'No board found with that code on this device.'

    setState((prev) => {
      const board = prev.boards.find((entry) => entry.inviteCode.toUpperCase() === code)
      if (!board) return prev
      if (board.members.some((member) => member.userId === prev.userId)) {
        boardId = board.id
        return prev
      }
      if (board.members.length >= 2) {
        reason = 'This board already has two people.'
        return prev
      }
      boardId = board.id
      return mapBoard(prev, board.id, (current) => ({
        ...current,
        members: [...current.members, { userId: prev.userId, name: prev.displayName.trim() || 'You' }],
      }))
    })

    if (boardId) {
      setActiveBoardId(boardId)
      return { ok: true, boardId }
    }
    return { ok: false, reason }
  }, [])

  const deleteBoard = useCallback((boardId: string) => {
    setState((prev) => {
      const doomed = prev.boards.find((board) => board.id === boardId)
      if (doomed) {
        for (const collection of doomed.collections) clearMedia(collection.items)
      }
      return { ...prev, boards: prev.boards.filter((board) => board.id !== boardId) }
    })
    setActiveBoardId((current) => (current === boardId ? null : current))
  }, [])

  const setBoardTitle = useCallback((title: string) => {
    if (!activeBoardId) return
    const next = title.trim() || 'Ours'
    setState((prev) => mapBoard(prev, activeBoardId, (board) => ({ ...board, title: next })))
  }, [activeBoardId])

  const upsertCollection = useCallback((collection: Collection) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const deleteCollection = useCallback((id: string) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const addItem = useCallback(
    async (collectionId: string, input: NewItemInput, boardWidth = 900) => {
      if (!activeBoardId) return
      const attachments = input.files?.length
        ? await filesToAttachments(input.files, input.fileSource ?? 'upload')
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
        createdAt: new Date().toISOString(),
        reactions: [],
        replies: [],
      }
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
    [activeBoard, activeBoardId, state.displayName],
  )

  const addAttachments = useCallback(async (collectionId: string, itemId: string, files: File[]) => {
    if (!activeBoardId) return
    const attachments = await filesToAttachments(files)
    if (!attachments.length) return
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
              const type = media[0]?.type ?? attachments[0].type
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
  }, [activeBoardId])

  const addLink = useCallback((collectionId: string, itemId: string, rawUrl: string) => {
    if (!activeBoardId) return
    const url = normalizeUrl(rawUrl)
    if (!url) return
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
  }, [activeBoardId])

  const deleteAttachment = useCallback((collectionId: string, itemId: string, attachmentId: string) => {
    if (!activeBoardId) return
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
              if (doomed?.type !== 'link' && doomed && isStoredMedia(doomed.content)) void deleteMedia(doomed.id)
              return {
                ...item,
                attachments: current.filter((part) => part.id !== attachmentId),
              }
            }),
          }
        }),
      })),
    )
  }, [activeBoardId])

  const deleteItem = useCallback((collectionId: string, itemId: string) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const moveItem = useCallback(
    (collectionId: string, itemId: string, x: number, y: number, boardWidth: number) => {
      if (!activeBoardId) return
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
    [activeBoardId],
  )

  const toggleReaction = useCallback((collectionId: string, itemId: string, emoji: string) => {
    if (!activeBoardId) return
    const author = state.displayName.trim() || 'You'
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
                  reactions: [...entry.reactions, { emoji, authors: [author] }],
                }
              }
              const hasMine = existing.authors.includes(author)
              const authors = hasMine
                ? existing.authors.filter((name) => name !== author)
                : [...existing.authors, author]
              const reactions = authors.length
                ? entry.reactions.map((r) => (r.emoji === emoji ? { ...r, authors } : r))
                : entry.reactions.filter((r) => r.emoji !== emoji)
              return { ...entry, reactions }
            }),
          }
        }),
      })),
    )
  }, [activeBoardId, state.displayName])

  const addReply = useCallback((collectionId: string, itemId: string, text: string) => {
    if (!activeBoardId) return
    const reply: Reply = {
      id: uid(),
      author: state.displayName.trim() || 'You',
      text,
      createdAt: new Date().toISOString(),
    }
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
  }, [activeBoardId, state.displayName])

  const updateCaption = useCallback((collectionId: string, itemId: string, caption: string) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const updateContent = useCallback((collectionId: string, itemId: string, content: string) => {
    if (!activeBoardId) return
    const next = content.trim()
    if (!next) return
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
  }, [activeBoardId])

  const cycleLinkPreview = useCallback(async (
    collectionId: string,
    itemId: string,
    direction: 'forward' | 'backward' = 'forward',
  ) => {
    if (!activeBoardId || !activeBoard) return
    const collection = activeBoard.collections.find((entry) => entry.id === collectionId)
    const item = collection?.items.find((entry) => entry.id === itemId)
    const candidates = item?.previewCandidates ?? []
    if (!item || item.type !== 'link' || candidates.length <= 2) return

    const step = direction === 'forward' ? 2 : -2
    const nextIndex =
      ((((item.previewIndex ?? 0) + step) % candidates.length) + candidates.length) % candidates.length
    const files = await fetchPreviewFiles(previewPairUrls(candidates, nextIndex))
    const extra = files.length ? await filesToAttachments(files, 'preview') : []
    if (!extra.length) return

    const replaced = itemMediaAttachments(item).filter((part) => part.source === 'preview')
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
      if (isStoredMedia(old.content)) void deleteMedia(old.id)
    }
  }, [activeBoard, activeBoardId])

  const bringItemToFront = useCallback((collectionId: string, itemId: string) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const setMemberLocation = useCallback((location?: GeoPoint) => {
    if (!activeBoardId) return
    setState((prev) =>
      mapBoard(prev, activeBoardId, (board) => ({
        ...board,
        members: board.members.map((member) =>
          member.userId === prev.userId ? { ...member, location } : member,
        ),
      })),
    )
  }, [activeBoardId])

  const setCollectionCover = useCallback((collectionId: string, cover: CollectionCoverPreview) => {
    if (!activeBoardId) return
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
  }, [activeBoardId])

  const reorderCollections = useCallback((kind: CollectionKind, activeId: string, overId: string) => {
    if (!activeBoardId) return
    setState((prev) =>
      mapBoard(prev, activeBoardId, (board) => {
        const ofKind = board.collections.filter((collection) => collection.kind === kind)
        const fromIndex = ofKind.findIndex((collection) => collection.id === activeId)
        const toIndex = ofKind.findIndex((collection) => collection.id === overId)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return board

        const nextOfKind = [...ofKind]
        const [moved] = nextOfKind.splice(fromIndex, 1)
        nextOfKind.splice(toIndex, 0, moved)

        let index = 0
        return {
          ...board,
          collections: board.collections.map((collection) =>
            collection.kind === kind ? nextOfKind[index++]! : collection,
          ),
        }
      }),
    )
  }, [activeBoardId])

  return {
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
    reorderCollections,
    toggleReaction,
    addReply,
    updateCaption,
    updateContent,
    cycleLinkPreview,
  }
}

/** @deprecated Prefer useApp */
export function useBoard() {
  return useApp()
}
