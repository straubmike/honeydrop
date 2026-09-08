// Supabase Edge Function: link-api
// Deploy: supabase functions deploy link-api --no-verify-jwt
// (or keep JWT verify and send Authorization: Bearer <anon key> from the client)

const MAX_HTML = 1_500_000
const MAX_IMAGE = 8 * 1024 * 1024
const MAX_REMOTE_MEDIA = 40 * 1024 * 1024
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (a === 172 && b! >= 16 && b! <= 31) return true
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
    for (const match of html.matchAll(pattern)) values.push(decodeHtml(match[1]!.trim()))
  }
  return values
}

function looksLikeImageUrl(src: string): boolean {
  const path = src.split('?')[0]!.toLowerCase()
  return (
    /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|\.)/i.test(path) ||
    /\/(images?|media|photos?|cdn|static|uploads?|files)\//i.test(src)
  )
}

function imgSrcs(html: string, base: string): string[] {
  const out: string[] = []
  for (const match of html.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi)) {
    const abs = absUrl(match[1]!, base)
    if (abs && looksLikeImageUrl(abs)) out.push(abs)
  }
  return out
}

function buildPreviewCandidates(html: string, finalUrl: string): string[] {
  const seen = new Set<string>()
  const candidates: string[] = []
  const push = (urls: string[]) => {
    for (const url of urls) {
      if (seen.has(url)) continue
      seen.add(url)
      candidates.push(url)
    }
  }
  push([
    ...metaContents(html, 'og:image'),
    ...metaContents(html, 'og:image:secure_url'),
    ...metaContents(html, 'og:image:url'),
    ...metaContents(html, 'twitter:image'),
    ...metaContents(html, 'twitter:image:src'),
  ].map((src) => absUrl(src, finalUrl)).filter((v): v is string => Boolean(v)))
  push(imgSrcs(html, finalUrl))
  return candidates
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

async function previewLink(target: string) {
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
    return { candidates: [] as string[], images: [] as string[] }
  }
  const candidates = buildPreviewCandidates(html, finalUrl)
  return {
    title: title || undefined,
    description: description || undefined,
    candidates,
    images: candidates.slice(0, 2),
  }
}

async function fetchPreviewImage(target: string) {
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

async function fetchRemoteMedia(target: string) {
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

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  const url = new URL(req.url)
  const op = url.searchParams.get('op')
  const target = url.searchParams.get('url')
  if (!target) return json(400, { error: 'Missing url' })

  try {
    if (op === 'link-preview') {
      return json(200, await previewLink(target))
    }
    if (op === 'link-image') {
      const image = await fetchPreviewImage(target)
      return new Response(image.body, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': image.type,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }
    if (op === 'link-media') {
      const media = await fetchRemoteMedia(target)
      return new Response(media.body, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': media.type,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }
    return json(400, { error: 'Unknown op' })
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : 'Preview failed' })
  }
})
