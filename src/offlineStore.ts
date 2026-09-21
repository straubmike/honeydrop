import type { AppState, IdeaBoard } from './types'

const DB_NAME = 'honeydrop-cache'
const VERSION = 1
const META = 'meta'
const BOARDS = 'boards'
const QUEUE = 'queue'
const PENDING_MEDIA = 'pendingMedia'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error'

export type PersistQueueItem =
  | { kind: 'board'; boardId: string }
  | { kind: 'member'; boardId: string }

export type PendingMediaRecord = {
  id: string
  boardId: string
  mime: string
  source: 'upload' | 'preview'
  blob: Blob
}

type MetaMap = {
  userId?: string
  displayName?: string
  cachedAt?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS)
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PENDING_MEDIA)) db.createObjectStore(PENDING_MEDIA)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function cacheAppSnapshot(state: AppState): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META, BOARDS], 'readwrite')
    const meta = tx.objectStore(META)
    meta.put(state.userId, 'userId')
    meta.put(state.displayName, 'displayName')
    meta.put(new Date().toISOString(), 'cachedAt')
    const boards = tx.objectStore(BOARDS)
    boards.clear()
    for (const board of state.boards) {
      boards.put(board, board.id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadCachedApp(): Promise<AppState | null> {
  try {
    const db = await openDb()
    const metaTx = db.transaction(META, 'readonly')
    const metaStore = metaTx.objectStore(META)
    const userId = (await req(metaStore.get('userId'))) as string | undefined
    const displayName = ((await req(metaStore.get('displayName'))) as string | undefined) || 'You'
    if (!userId) return null

    const boardTx = db.transaction(BOARDS, 'readonly')
    const all = (await req(boardTx.objectStore(BOARDS).getAll())) as IdeaBoard[]
    return {
      userId,
      displayName,
      boards: all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    }
  } catch {
    return null
  }
}

export async function readMeta(): Promise<MetaMap> {
  try {
    const db = await openDb()
    const tx = db.transaction(META, 'readonly')
    const store = tx.objectStore(META)
    return {
      userId: (await req(store.get('userId'))) as string | undefined,
      displayName: (await req(store.get('displayName'))) as string | undefined,
      cachedAt: (await req(store.get('cachedAt'))) as string | undefined,
    }
  } catch {
    return {}
  }
}

function queueKey(item: PersistQueueItem): string {
  return `${item.kind}:${item.boardId}`
}

export async function enqueuePersist(item: PersistQueueItem): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readwrite')
    tx.objectStore(QUEUE).put({ id: queueKey(item), ...item })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listPersistQueue(): Promise<PersistQueueItem[]> {
  const db = await openDb()
  const rows = (await req(db.transaction(QUEUE, 'readonly').objectStore(QUEUE).getAll())) as Array<
    PersistQueueItem & { id: string }
  >
  return rows.map(({ kind, boardId }) => ({ kind, boardId }))
}

export async function clearPersistQueueItem(item: PersistQueueItem): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readwrite')
    tx.objectStore(QUEUE).delete(queueKey(item))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function putPendingMedia(record: PendingMediaRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING_MEDIA, 'readwrite')
    tx.objectStore(PENDING_MEDIA).put(record, record.id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listPendingMedia(): Promise<PendingMediaRecord[]> {
  const db = await openDb()
  return (await req(
    db.transaction(PENDING_MEDIA, 'readonly').objectStore(PENDING_MEDIA).getAll(),
  )) as PendingMediaRecord[]
}

export async function deletePendingMedia(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING_MEDIA, 'readwrite')
    tx.objectStore(PENDING_MEDIA).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingMediaBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  const record = (await req(
    db.transaction(PENDING_MEDIA, 'readonly').objectStore(PENDING_MEDIA).get(id),
  )) as PendingMediaRecord | undefined
  return record?.blob
}

export function pendingMediaRef(id: string): string {
  return `pending:${id}`
}

export function isPendingMedia(content: string): boolean {
  return content.startsWith('pending:')
}

export function pendingMediaId(content: string): string {
  return content.slice('pending:'.length)
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}
