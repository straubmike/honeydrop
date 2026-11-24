import { isGifMime, looksLikeGifUrl } from './images'
import { isStoredMedia, removeStoredMedia } from './mediaStore'
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

/** Scraped/cycled link faceouts — belong in the preview strip only. */
export function itemPreviewMedia(item: Item): Attachment[] {
  return itemMediaAttachments(item).filter((part) => part.source === 'preview')
}

/** User-uploaded photos/videos — never mix into the preview strip. */
export function itemUserMedia(item: Item): Attachment[] {
  return itemMediaAttachments(item).filter((part) => part.source !== 'preview')
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

/**
 * Collection list covers are static images only — hide “use as preview” for
 * videos and GIFs (ideas and events). GIFs are type `image`; distinguish via
 * mime `image/gif` or `.gif` in the URL/path — never type alone.
 */
export function canUseAttachmentAsCover(attachment: Attachment): boolean {
  if (attachment.type !== 'image') return false
  if (isGifMime(attachment.mime)) return false
  if (looksLikeGifUrl(attachment.content)) return false
  return true
}

export function canUseUrlAsCover(url: string): boolean {
  return !looksLikeGifUrl(url)
}

/**
 * First static image on an item that may be used as a list-card cover.
 * Same check as “Use as preview” so animated GIFs never auto-default.
 */
export function firstCoverImage(item: Item): Attachment | undefined {
  return itemMediaAttachments(item).find((part) => canUseAttachmentAsCover(part))
}

/**
 * Shared cover for idea + event cards (one code path):
 * (a) no static image → undefined (standard card, no preview)
 * (b) no explicit pick → first static image (skips video + GIF)
 * (c) coverPreview set → that image when still valid
 */
export function resolveCollectionCover(collection: Collection): CollectionCover | undefined {
  const cover = collection.coverPreview
  if (cover) {
    const item = collection.items.find((entry) => entry.id === cover.itemId)
    if (item) {
      if (cover.candidateUrl && canUseUrlAsCover(cover.candidateUrl)) {
        return { kind: 'url', url: cover.candidateUrl }
      }
      if (cover.attachmentId) {
        const attachment = itemMediaAttachments(item).find((part) => part.id === cover.attachmentId)
        if (attachment && canUseAttachmentAsCover(attachment)) {
          return { kind: 'attachment', attachment }
        }
      }
    }
  }

  const attachment = collection.items.map(firstCoverImage).find((part) => part != null)
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
    if (isStoredMedia(part.content)) void removeStoredMedia(part.content, part.id)
  }
}
