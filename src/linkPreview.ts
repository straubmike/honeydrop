import { classifyMedia, isDirectMediaUrl, mediaKindFromMime, mediaKindFromUrl } from './images'
import { getSupabase, getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from './lib/supabase'
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

function linkApiUrl(op: 'link-preview' | 'link-image' | 'link-media', target: string): string {
  if (import.meta.env.DEV || !isSupabaseConfigured) {
    return `/api/${op}?url=${encodeURIComponent(target)}`
  }
  return `${getSupabaseUrl()}/functions/v1/link-api?op=${op}&url=${encodeURIComponent(target)}`
}

async function linkApiHeaders(): Promise<HeadersInit | undefined> {
  if (import.meta.env.DEV || !isSupabaseConfigured) return undefined
  const key = getSupabaseAnonKey()
  const headers: Record<string, string> = { apikey: key }
  try {
    const { data } = await getSupabase().auth.getSession()
    headers.Authorization = `Bearer ${data.session?.access_token || key}`
  } catch {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

export async function fetchLinkImageBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(linkApiUrl('link-image', url), { headers: await linkApiHeaders() })
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size < 80) return null
    return blob
  } catch {
    return null
  }
}

export async function fetchRemoteMediaFile(url: string): Promise<File | null> {
  try {
    const response = await fetch(linkApiUrl('link-media', url), { headers: await linkApiHeaders() })
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
  if (candidates.length === 1) return [candidates[0]!]
  const first = candidates[((startIndex % candidates.length) + candidates.length) % candidates.length]!
  const second =
    candidates[(((startIndex + 1) % candidates.length) + candidates.length) % candidates.length]!
  return first === second ? [first] : [first, second]
}

/**
 * Preview fetch list — direct media = one file; otherwise exactly the next pair
 * of gallery shots (max 2). Abercrombie candidates are ordered colorway-first so
 * the first pair often spans two patterns; "See more" advances by pairs through
 * the full scraped set (shared via previewIndex on the board item).
 */
export function previewFetchUrls(pageUrl: string, candidates: string[], startIndex = 0): string[] {
  if (isDirectMediaUrl(pageUrl)) return [pageUrl]
  return previewPairUrls(candidates, startIndex)
}

export async function fetchPreviewFiles(imageUrls: string[]): Promise<File[]> {
  const headers = await linkApiHeaders()
  const results = await Promise.all(
    imageUrls.map(async (imageUrl) => {
      try {
        const image = await fetch(linkApiUrl('link-image', imageUrl), { headers })
        if (!image.ok) return null
        const blob = await image.blob()
        if (blob.size < 80) return null
        const subtype = (blob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg')
        return new File([blob], `preview.${subtype}`, { type: blob.type || 'image/jpeg' })
      } catch {
        return null
      }
    }),
  )
  return results.filter((file): file is File => Boolean(file))
}

export async function fetchLinkPreview(pageUrl: string): Promise<LinkPreview> {
  try {
    if (isDirectMediaUrl(pageUrl)) {
      const file = await fetchRemoteMediaFile(pageUrl)
      if (file) return { candidates: [pageUrl], files: [file] }
      return { candidates: [], files: [] }
    }

    const response = await fetch(linkApiUrl('link-preview', pageUrl), {
      headers: await linkApiHeaders(),
    })
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
  } catch {
    // Preview proxy may be unavailable in production until link-api is deployed.
    return { candidates: [], files: [] }
  }
}
