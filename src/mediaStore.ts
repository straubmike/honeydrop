import { deleteBoardMedia, downloadBoardMedia, isSupabaseMedia } from './api/media'

const DB_NAME = 'ideaboard'
const STORE = 'media'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function isIdbMedia(content: string): boolean {
  return content.startsWith('idb:')
}

export function isStoredMedia(content: string): boolean {
  return isIdbMedia(content) || isSupabaseMedia(content)
}

/** Resolve blob for idb: or sb: refs. `id` is only used for legacy idb keys. */
export async function resolveMediaBlob(content: string, id: string): Promise<Blob | undefined> {
  if (isSupabaseMedia(content)) return downloadBoardMedia(content)
  if (isIdbMedia(content)) return getMedia(id)
  return undefined
}

export async function removeStoredMedia(content: string, id: string): Promise<void> {
  if (isSupabaseMedia(content)) {
    try {
      await deleteBoardMedia(content)
    } catch {
      /* best-effort */
    }
    return
  }
  if (isIdbMedia(content)) await deleteMedia(id)
}
