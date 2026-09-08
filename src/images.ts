import type { ItemType, MediaKind } from './types'

export const MAX_MEDIA_BYTES = 40 * 1024 * 1024

export const MEDIA_ACCEPT = [
  'image/*',
  'video/*',
  'audio/*',
  '.gif',
  '.webp',
  '.apng',
  '.avif',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.bmp',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.ogv',
  '.ogg',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.oga',
].join(',')

const IMAGE_EXT = /\.(gif|png|jpe?g|webp|apng|avif|svg|bmp|ico)$/i
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|oga|flac)$/i

export function classifyMedia(file: File): MediaKind | null {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type.startsWith('video/') || VIDEO_EXT.test(name)) return 'video'
  if (type.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio'
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'image'
  return null
}

export function mediaKindLabel(type: ItemType): string {
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'image') return 'photo'
  if (type === 'drawing') return 'drawing'
  return type
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** True when the whole string is a single http(s) URL (paste or typed). */
export function parseEntryUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  if (!/^https?:\/\//i.test(trimmed) && !/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(trimmed)) return null
  const normalized = normalizeUrl(trimmed)
  try {
    const parsed = new URL(normalized)
    if (!parsed.hostname.includes('.')) return null
    return normalized
  } catch {
    return null
  }
}

/** Guess media type from a direct file URL path (CDN links with extensions). */
export function mediaKindFromUrl(url: string): MediaKind | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (VIDEO_EXT.test(pathname)) return 'video'
    if (AUDIO_EXT.test(pathname)) return 'audio'
    if (IMAGE_EXT.test(pathname)) return 'image'
  } catch {
    /* ignore */
  }
  return null
}

export function isDirectMediaUrl(url: string): boolean {
  return mediaKindFromUrl(url) !== null
}

export function mediaKindFromMime(mime: string): MediaKind | null {
  const type = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'
  return null
}

export function clipboardMediaFiles(data: DataTransfer): File[] {
  const seen = new Set<string>()
  const files: File[] = []
  const push = (file: File | null) => {
    if (!file || !classifyMedia(file)) return
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }
  // Browsers often expose the same pasted file via both `.files` and `.items`.
  if (data.files.length) {
    for (const file of Array.from(data.files)) push(file)
  } else {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file') push(item.getAsFile())
    }
  }
  return files
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Compact path for link chips — pathname (+ short query hint), truncated. */
export function shortenUrlDisplay(url: string, maxLen = 64): string {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname === '/' ? '' : parsed.pathname
    if (parsed.search) path += '…'
    const display = path || parsed.hostname.replace(/^www\./, '')
    if (display.length <= maxLen) return display
    return `${display.slice(0, Math.max(1, maxLen - 1))}…`
  } catch {
    if (url.length <= maxLen) return url
    return `${url.slice(0, Math.max(1, maxLen - 1))}…`
  }
}
