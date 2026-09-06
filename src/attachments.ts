import { isStoredMedia, deleteMedia } from './mediaStore'
import type { Attachment, Collection, CollectionCoverPreview, Item, MediaKind } from './types'

export type CollectionCover =
  | { kind: 'attachment'; attachment: Attachment }
  | { kind: 'url'; url: string }

export function itemAttachments(item: Item): Attachment[] {
  if (item.attachments?.length) return item.attachments
  if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
    if (!item.content) return []
    return [
      {
        id: item.id,
        type: item.type,
        content: item.content,
        mime: item.mime,
      },
    ]
  }
  return []
}

export function itemMediaAttachments(item: Item): Attachment[] {
  return itemAttachments(item).filter((part) => part.type !== 'link')
}

export function itemLinkAttachments(item: Item): Attachment[] {
  return itemAttachments(item).filter((part) => part.type === 'link')
}

export function isMediaItem(item: Item): boolean {
  return item.type === 'image' || item.type === 'video' || item.type === 'audio'
}

export function firstVisual(item: Item): Attachment | undefined {
  return itemMediaAttachments(item).find((part) => part.type === 'image' || part.type === 'video')
}

export function resolveCollectionCover(collection: Collection): CollectionCover | undefined {
  const cover = collection.coverPreview
  if (cover) {
    const item = collection.items.find((entry) => entry.id === cover.itemId)
    if (item) {
      if (cover.candidateUrl) {
        return { kind: 'url', url: cover.candidateUrl }
      }
      if (cover.attachmentId) {
        const attachment = itemMediaAttachments(item).find((part) => part.id === cover.attachmentId)
        if (attachment && (attachment.type === 'image' || attachment.type === 'video')) {
          return { kind: 'attachment', attachment }
        }
      }
    }
  }

  const attachment = collection.items.map(firstVisual).find((part) => part != null)
  return attachment ? { kind: 'attachment', attachment } : undefined
}

export function isCollectionCoverPreview(
  cover: CollectionCoverPreview | undefined,
  itemId: string,
  preview: CollectionCoverPreview,
): boolean {
  if (!cover || cover.itemId !== itemId) return false
  if (preview.candidateUrl) return cover.candidateUrl === preview.candidateUrl
  if (preview.attachmentId) return cover.attachmentId === preview.attachmentId
  return false
}

export function clearCoverIfStale(
  cover: CollectionCoverPreview | undefined,
  itemId: string,
  attachmentId?: string,
): CollectionCoverPreview | undefined {
  if (!cover) return undefined
  if (cover.itemId === itemId && (!attachmentId || cover.attachmentId === attachmentId)) return undefined
  return cover
}

export function isMediaKind(type: Item['type']): type is MediaKind {
  return type === 'image' || type === 'video' || type === 'audio'
}

export function clearItemMedia(item: Item) {
  for (const part of itemMediaAttachments(item)) {
    if (isStoredMedia(part.content)) void deleteMedia(part.id)
  }
}
