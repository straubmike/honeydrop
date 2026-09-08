// Auto-synced from linkPreviewServer.ts — run: node scripts/sync-link-preview-core.mjs
const MAX_HTML = 1_500_000
const MAX_IMAGE = 8 * 1024 * 1024
const MAX_REMOTE_MEDIA = 40 * 1024 * 1024
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function publicUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links can be previewed')
  }
  if (isPrivateHost(url.hostname)) throw new Error('That address cannot be previewed')
  return url
}

function absUrl(src: string, base: string): string | null {
  try {
    const url = new URL(src.trim(), base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (isPrivateHost(url.hostname)) return null
    return url.href
  } catch {
    return null
  }
}

function metaContents(html: string, key: string): string[] {
  const values: string[] = []
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*?(?:property|name)=["']${key}["'][^>]*?content=["']([^"']+)["'][^>]*?>`,
      'gi',
    ),
    new RegExp(
      `<meta\\b[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["']${key}["'][^>]*?>`,
      'gi',
    ),
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) values.push(decodeHtml(match[1].trim()))
  }
  return values
}

function looksLikeImageUrl(src: string): boolean {
  const path = src.split('?')[0].toLowerCase()
  return (
    /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|\.)/i.test(path) ||
    /\/(images?|media|photos?|cdn|static|uploads?|files)\//i.test(src)
  )
}

function collectJsonImages(value: unknown, into: string[]) {
  if (!value) return
  if (typeof value === 'string') {
    if (looksLikeImageUrl(value)) into.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonImages(entry, into)
    return
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const type = String(record['@type'] ?? '')
    if (typeof record.contentUrl === 'string' && looksLikeImageUrl(record.contentUrl)) {
      into.push(record.contentUrl)
    }
    if (typeof record.src === 'string' && looksLikeImageUrl(record.src)) into.push(record.src)
    if (typeof record.url === 'string' && (type.includes('Image') || looksLikeImageUrl(record.url))) {
      into.push(record.url)
    }
    for (const key of ['image', 'images', 'featured_image', 'featuredImage', 'preview_image', 'media']) {
      if (key in record) collectJsonImages(record[key], into)
    }
  }
}

function looksLikeJunk(src: string): boolean {
  const lower = src.toLowerCase()
  return (
    lower.startsWith('data:') ||
    /\.svg(\?|$)|favicon|sprite|pixel|tracking|analytics|spacer|1x1|blank\.gif|\/icons?\/|icon-|badge|emoji|wordmark|\/logo|payment|placeholder|swatch|color-?chip/.test(
      lower,
    )
  )
}

function attrValue(attrs: string, names: string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(attrs)
    if (match?.[1]) return decodeHtml(match[1])
  }
}

type ImageKind = 'gallery' | 'product-json' | 'og' | 'json' | 'img'

interface ImageCandidate {
  url: string
  kind: ImageKind
  index: number
}

function pageProductId(pageUrl: string): string | null {
  try {
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean)
    const last = parts.at(-1)
    if (last && /^\d+$/.test(last)) return last
  } catch {
    /* ignore */
  }
  return null
}

function imageUrlFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') return looksLikeImageUrl(value) ? value : null
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['url', 'src', 'contentUrl', 'imageUrl', 'thumbnailUrl', 'href']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && looksLikeImageUrl(candidate)) return candidate
  }
  return null
}

function recordPageRef(record: Record<string, unknown>): string {
  return [
    record.usItemId,
    record.itemId,
    record.productId,
    record.id,
    record.sku,
    record.canonicalUrl,
    record.url,
    record.link,
    record.handle,
    record['@id'],
  ]
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase()
}

function matchesPageProduct(record: Record<string, unknown>, pageUrl: string, handle: string): boolean {
  const itemId = pageProductId(pageUrl)
  const refs = recordPageRef(record)
  if (itemId && refs.includes(itemId)) return true
  if (handle && refs.includes(handle.toLowerCase())) return true
  return productMatchesPage(record, pageUrl, handle)
}

function collectMatchingProducts(
  value: unknown,
  pageUrl: string,
  handle: string,
  into: Record<string, unknown>[],
  depth = 0,
) {
  if (!value || depth > 16) return
  if (Array.isArray(value)) {
    for (const entry of value) collectMatchingProducts(entry, pageUrl, handle, into, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const imageInfo = record.imageInfo
  const hasGallery =
    (imageInfo &&
      typeof imageInfo === 'object' &&
      Array.isArray((imageInfo as { allImages?: unknown[] }).allImages)) ||
    Array.isArray(record.images)
  if (hasGallery && matchesPageProduct(record, pageUrl, handle)) into.push(record)
  for (const entry of Object.values(record)) {
    collectMatchingProducts(entry, pageUrl, handle, into, depth + 1)
  }
}

function productImagesFromRecord(record: Record<string, unknown>): ImageCandidate[] {
  const imageInfo = record.imageInfo as { allImages?: unknown[]; images?: unknown[] } | undefined
  const list = imageInfo?.allImages ?? imageInfo?.images ?? record.images
  if (!Array.isArray(list)) return []
  const found: ImageCandidate[] = []
  list.forEach((entry, index) => {
    const url = imageUrlFromUnknown(entry)
    if (url && !looksLikeJunk(url)) found.push({ url, kind: 'product-json', index })
  })
  return found
}

function embeddedProductImages(html: string, pageUrl: string): ImageCandidate[] {
  const handle = pageHandle(pageUrl)
  const payloads = [
    html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1],
    ...[...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
      (match) => match[1],
    ),
  ].filter(Boolean)

  let best: ImageCandidate[] = []
  for (const raw of payloads) {
    try {
      const data = JSON.parse(raw!)
      const products: Record<string, unknown>[] = []
      collectMatchingProducts(data, pageUrl, handle, products)
      for (const product of products) {
        const candidates = productImagesFromRecord(product)
        if (candidates.length > best.length) best = candidates
      }
    } catch {
      /* ignore broken JSON */
    }
  }
  return best
}

function scopedProductImages(html: string, pageUrl: string): ImageCandidate[] {
  return [...productGalleryImages(html), ...embeddedProductImages(html, pageUrl)]
}

function productGalleryImages(html: string): ImageCandidate[] {
  const found: ImageCandidate[] = []
  for (const match of html.matchAll(/<a\b([^>]*class="[^"]*media-gallery__image[^"]*"[^>]*)>/gi)) {
    const attrs = match[1] ?? ''
    const mediaId = attrValue(attrs, ['data-media-id']) ?? ''
    if (mediaId && !mediaId.includes('__main')) continue
    const href = attrValue(attrs, ['href'])
    if (!href || looksLikeJunk(href)) continue
    const position = Number(attrValue(attrs, ['data-position']) ?? '999')
    found.push({ url: href, kind: 'gallery', index: position })
  }
  return found
}

function pageHandle(pageUrl: string): string {
  try {
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    return ''
  }
}

function productMatchesPage(record: Record<string, unknown>, pageUrl: string, handle: string): boolean {
  const id = String(record['@id'] ?? record.url ?? record['@url'] ?? '')
  const lower = id.toLowerCase()
  const pageLower = pageUrl.toLowerCase()
  if (handle && lower.includes(handle.toLowerCase())) return true
  if (pageLower && lower.includes(pageLower.replace(/^https?:\/\//, ''))) return true
  try {
    const pagePath = new URL(pageUrl).pathname
    if (id.includes(pagePath)) return true
  } catch {
    /* ignore */
  }
  return false
}

function collectProductImages(value: unknown, pageUrl: string, handle: string, into: string[]) {
  if (!value) return
  if (Array.isArray(value)) {
    for (const entry of value) collectProductImages(entry, pageUrl, handle, into)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const type = String(record['@type'] ?? '')
  if (type.includes('Product') && matchesPageProduct(record, pageUrl, handle)) {
    collectJsonImages(record.image, into)
    collectJsonImages(record.images, into)
  }
  if ('@graph' in record) collectProductImages(record['@graph'], pageUrl, handle, into)
  for (const key of Object.keys(record)) {
    if (key === '@graph') continue
    collectProductImages(record[key], pageUrl, handle, into)
  }
}

function productJsonLdImages(html: string, pageUrl: string): string[] {
  const handle = pageHandle(pageUrl)
  const found: string[] = []
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectProductImages(JSON.parse(match[1]!), pageUrl, handle, found)
    } catch {
      /* ignore broken JSON */
    }
  }
  return found
}

function pickFromOrderedGallery(candidates: ImageCandidate[], base: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of [...candidates].sort((a, b) => a.index - b.index)) {
    const abs = absUrl(candidate.url, base)
    if (!abs) continue
    const key = visualKey(abs)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(abs)
  }
  return out
}

function visualKey(src: string): string {
  try {
    const url = new URL(src)
    let path = decodeURIComponent(url.pathname).toLowerCase()
    path = path.replace(/(\.(jpe?g|png|webp|avif|gif|bmp))+$/i, '')
    path = path.replace(/\.progressive$/i, '')
    path = path.replace(/_(?:pico|icon|thumb|small|compact|medium|large|grande|master|original)$/i, '')
    path = path.replace(/_\d+x(\d+)?$/i, '')
    path = path.replace(/-\d+w$/i, '')
    path = path.replace(/@\d+x$/i, '')
    return `${url.hostname}${path}`
  } catch {
    return src.split('?')[0].toLowerCase()
  }
}

function scoreImage(candidate: ImageCandidate): number {
  const lower = candidate.url.toLowerCase()
  let score = 0
  if (candidate.kind === 'gallery') score += 24
  else if (candidate.kind === 'product-json') score += 18
  else if (candidate.kind === 'json') score += 14
  else if (candidate.kind === 'og') score += 8
  else score += 4
  if (/\/products?\//.test(lower) || /\/files\/\d+\//.test(lower)) score += 8
  if (/(_|\b)(800|1000|1200|1400|1600|1800|2000|2048|2400)x/.test(lower)) score += 2
  if (
    looksLikeJunk(lower) ||
    /banner|hero-banner|footer|default[-_]/.test(lower) ||
    /recommend|related|upsell|cross-sell|also-like|recently-viewed|carousel|sponsored|similar-item/.test(
      lower,
    ) ||
    /odnheight=(?:117|160|320)|odnwidth=(?:117|160|320)/.test(lower)
  ) {
    score -= 40
  }
  return score
}

function pickPreviewImages(candidates: ImageCandidate[], base: string): string[] {
  const groups = new Map<string, ImageCandidate>()
  for (const candidate of candidates) {
    const abs = absUrl(candidate.url, base)
    if (!abs || abs === base) continue
    const next = { ...candidate, url: abs }
    const key = visualKey(abs)
    const prev = groups.get(key)
    if (!prev || scoreImage(next) > scoreImage(prev)) groups.set(key, next)
  }
  return [...groups.values()]
    .filter((candidate) => scoreImage(candidate) > -10)
    .sort((a, b) => scoreImage(b) - scoreImage(a) || a.index - b.index)
    .filter((candidate, index) => scoreImage(candidate) > 0 || index === 0)
    .map((candidate) => candidate.url)
}

function buildPreviewCandidates(html: string, finalUrl: string): string[] {
  const gallery = scopedProductImages(html, finalUrl)
  const fromGallery = pickFromOrderedGallery(gallery, finalUrl)
  if (fromGallery.length >= 2) return fromGallery

  const pool: ImageCandidate[] = [...gallery]
  const push = (urls: string[], kind: ImageKind) => {
    for (const raw of urls) {
      pool.push({ url: raw, kind, index: pool.length })
    }
  }
  push(productJsonLdImages(html, finalUrl), 'product-json')
  push(
    [
      ...metaContents(html, 'og:image'),
      ...metaContents(html, 'og:image:secure_url'),
      ...metaContents(html, 'og:image:url'),
      ...metaContents(html, 'twitter:image'),
      ...metaContents(html, 'twitter:image:src'),
    ],
    'og',
  )
  const picked = pickPreviewImages(pool, finalUrl)
  return picked.length ? picked : fromGallery
}

function isBotWallPage(html: string, title?: string): boolean {
  const lower = html.toLowerCase()
  const titled = title?.toLowerCase() ?? ''
  if (/cf-browser-verification|challenge-platform|cdn-cgi\/challenge|__cf_chl/.test(lower)) return true
  if (/attention required.*cloudflare|just a moment\.\.\.|enable javascript and cookies/.test(lower)) {
    return true
  }
  if (
    titled &&
    /attention required|just a moment|access denied|please wait|robot or human|cloudflare/.test(titled)
  ) {
    return true
  }
  return false
}

export async function previewLink(target: string): Promise<{
  title?: string
  description?: string
  images: string[]
  candidates: string[]
}> {
  const url = publicUrl(target)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(8000),
  })
  const finalUrl = publicUrl(response.url || url.href).href
  const buffer = new Uint8Array(await response.arrayBuffer())
  const html = new TextDecoder().decode(buffer.subarray(0, MAX_HTML))
  const title =
    metaContents(html, 'og:title')[0] ||
    metaContents(html, 'twitter:title')[0] ||
    decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '')
  const description =
    metaContents(html, 'og:description')[0] || metaContents(html, 'twitter:description')[0]
  if (isBotWallPage(html, title)) {
    return { candidates: [], images: [] }
  }
  const candidates = buildPreviewCandidates(html, finalUrl)
  return {
    title: title || undefined,
    description: description || undefined,
    candidates,
    images: candidates.slice(0, 2),
  }
}

export async function fetchPreviewImage(target: string): Promise<{ body: Uint8Array; type: string }> {
  const url = publicUrl(target)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(8000),
  })
  publicUrl(response.url || url.href)
  const type = response.headers.get('content-type') ?? ''
  if (type && !type.startsWith('image/') && !type.startsWith('application/octet-stream')) {
    throw new Error('That URL is not an image')
  }
  const body = new Uint8Array(await response.arrayBuffer())
  if (body.byteLength > MAX_IMAGE) throw new Error('Preview image is too large')
  return { body, type: type.startsWith('image/') ? type : 'image/jpeg' }
}

export async function fetchRemoteMedia(target: string): Promise<{ body: Uint8Array; type: string }> {
  const url = publicUrl(target)
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'image/*,video/*,audio/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(15000),
  })
  publicUrl(response.url || url.href)
  const type = response.headers.get('content-type') ?? ''
  if (
    type &&
    !type.startsWith('image/') &&
    !type.startsWith('video/') &&
    !type.startsWith('audio/') &&
    !type.startsWith('application/octet-stream')
  ) {
    throw new Error('That URL is not a media file')
  }
  const body = new Uint8Array(await response.arrayBuffer())
  if (body.byteLength > MAX_REMOTE_MEDIA) throw new Error('Media file is too large')
  const resolved =
    type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
      ? type
      : 'application/octet-stream'
  return { body, type: resolved }
}

