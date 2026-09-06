import { classifyMedia, isDirectMediaUrl, mediaKindFromMime, mediaKindFromUrl } from './images'
import type { MediaKind } from './types'

export interface LinkPreview {
  title?: string
  description?: string
  candidates: string[]
  files: File[]
}

function mediaFileName(kind: MediaKind, mime: string): string {
  const subtype = (mime.split('/')[1] || kind).replace('jpeg', 'jpg').split(';')[0]
  return `media.${subtype}`
}

export async function fetchRemoteMediaFile(url: string): Promise<File | null> {
  try {
    const response = await fetch(`/api/link-media?url=${encodeURIComponent(url)}`)
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size < 80) return null
    const kind =
      mediaKindFromUrl(url) ?? mediaKindFromMime(blob.type) ?? classifyMedia(new File([blob], 'x')) ?? 'image'
    return new File([blob], mediaFileName(kind, blob.type || `${kind}/octet-stream`), {
      type: blob.type || `${kind}/octet-stream`,
    })
  } catch {
    return null
  }
}

export function previewPairUrls(candidates: string[], startIndex = 0): string[] {
  if (!candidates.length) return []
  if (candidates.length === 1) return [candidates[0]]
  const first = candidates[((startIndex % candidates.length) + candidates.length) % candidates.length]
  const second =
    candidates[(((startIndex + 1) % candidates.length) + candidates.length) % candidates.length]
  return first === second ? [first] : [first, second]
}

/** Preview fetch list — single file for direct media URLs, otherwise up to two gallery shots. */
export function previewFetchUrls(pageUrl: string, candidates: string[], startIndex = 0): string[] {
  if (isDirectMediaUrl(pageUrl)) return [pageUrl]
  return previewPairUrls(candidates, startIndex)
}

export async function fetchPreviewFiles(imageUrls: string[]): Promise<File[]> {
  const files: File[] = []
  for (const imageUrl of imageUrls) {
    try {
      const image = await fetch(`/api/link-image?url=${encodeURIComponent(imageUrl)}`)
      if (!image.ok) continue
      const blob = await image.blob()
      if (blob.size < 80) continue
      const subtype = (blob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg')
      files.push(new File([blob], `preview.${subtype}`, { type: blob.type || 'image/jpeg' }))
    } catch {
      /* skip a missing image and keep the rest */
    }
  }
  return files
}

export async function fetchLinkPreview(pageUrl: string): Promise<LinkPreview> {
  if (isDirectMediaUrl(pageUrl)) {
    const file = await fetchRemoteMediaFile(pageUrl)
    if (file) return { candidates: [pageUrl], files: [file] }
    return { candidates: [], files: [] }
  }

  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(pageUrl)}`)
  if (!response.ok) return { candidates: [], files: [] }
  const data = (await response.json()) as {
    title?: string
    description?: string
    images?: string[]
    candidates?: string[]
  }
  const candidates = data.candidates?.length ? data.candidates : (data.images ?? [])
  const files = await fetchPreviewFiles(previewFetchUrls(pageUrl, candidates, 0))
  return { title: data.title, description: data.description, candidates, files }
}
