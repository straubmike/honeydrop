import {
  fetchPreviewImage,
  fetchRemoteMedia,
  previewLink,
} from './previewCore.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
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

function scoreFallbackImage(url: string): number {
  const lower = url.toLowerCase()
  let score = 4
  if (/\/seo\//.test(lower)) score += 20
  if (/\/asr\//.test(lower) || /\/products?\//.test(lower) || /\/files\//.test(lower)) score += 14
  if (/odnheight=(?:117|160|320)|odnwidth=(?:117|160|320)/.test(lower)) score -= 30
  if (looksLikeJunk(lower)) score -= 40
  return score
}

function rankImageUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const ranked = urls
    .map((url) => url.replace(/[),.;]+$/, ''))
    .filter((url) => /^https?:\/\//i.test(url))
    .filter(
      (url) =>
        /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|\?)/i.test(url) ||
        /\/(seo|asr|images?|media|photos?|cdn|static|uploads?|files|products?)\//i.test(url),
    )
    .filter((url) => !looksLikeJunk(url))
    .map((url) => ({ url, score: scoreFallbackImage(url) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const candidates: string[] = []
  for (const entry of ranked) {
    if (seen.has(entry.url)) continue
    seen.add(entry.url)
    candidates.push(entry.url)
    if (candidates.length >= 12) break
  }
  return candidates
}

async function previewViaJina(target: string): Promise<{
  title?: string
  candidates: string[]
  images: string[]
  note?: string
}> {
  const response = await fetch(`https://r.jina.ai/${target}`, {
    headers: {
      Accept: 'text/plain',
      'X-Return-Format': 'markdown',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) {
    return { candidates: [], images: [], note: `jina:${response.status}` }
  }
  const text = await response.text()
  const title = /^Title:\s*(.+)$/m.exec(text)?.[1]?.trim()
  const urls = [...text.matchAll(/https?:\/\/[^\s)"'\]]+/g)].map((match) => match[0]!)
  const candidates = rankImageUrls(urls)
  return {
    title: title && !/robot or human/i.test(title) ? title : undefined,
    candidates,
    images: candidates.slice(0, 2),
    note: `jina:ok:${text.length}:${candidates.length}`,
  }
}

async function previewViaMicrolink(target: string): Promise<{
  title?: string
  candidates: string[]
  images: string[]
  note?: string
}> {
  const api = `https://api.microlink.io?url=${encodeURIComponent(target)}`
  const response = await fetch(api, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return {
      candidates: [],
      images: [],
      note: `microlink:${response.status}:${body.slice(0, 80)}`,
    }
  }
  const payload = (await response.json()) as {
    status?: string
    message?: string
    data?: {
      title?: string
      image?: { url?: string } | string
      logo?: { url?: string }
    }
  }
  if (payload.status !== 'success') {
    return {
      candidates: [],
      images: [],
      note: `microlink:${payload.status ?? 'fail'}:${payload.message ?? ''}`,
    }
  }
  const imageUrl =
    typeof payload.data?.image === 'string' ? payload.data.image : payload.data?.image?.url
  const candidates = rankImageUrls([imageUrl].filter((value): value is string => Boolean(value)))
  return {
    title: payload.data?.title,
    candidates,
    images: candidates.slice(0, 2),
    note: `microlink:ok:${candidates.length}`,
  }
}

async function previewLinkWithFallback(target: string) {
  const notes: string[] = []
  try {
    const direct = await previewLink(target)
    if (direct.candidates.length) return direct
    notes.push('direct:empty')
  } catch (error) {
    notes.push(`direct:${error instanceof Error ? error.message : 'error'}`)
  }

  try {
    const jina = await previewViaJina(target)
    if (jina.note) notes.push(jina.note)
    if (jina.candidates.length) {
      return {
        title: jina.title,
        description: undefined,
        candidates: jina.candidates,
        images: jina.images,
      }
    }
  } catch (error) {
    notes.push(`jina:${error instanceof Error ? error.message : 'error'}`)
  }

  try {
    const micro = await previewViaMicrolink(target)
    if (micro.note) notes.push(micro.note)
    if (micro.candidates.length) {
      return {
        title: micro.title,
        description: undefined,
        candidates: micro.candidates,
        images: micro.images,
      }
    }
  } catch (error) {
    notes.push(`microlink:${error instanceof Error ? error.message : 'error'}`)
  }

  return { candidates: [] as string[], images: [] as string[], fallback: notes.join('|') }
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
      return json(200, await previewLinkWithFallback(target))
    }
    if (op === 'link-image') {
      try {
        const image = await fetchPreviewImage(target)
        return new Response(image.body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': image.type,
            'Cache-Control': 'private, max-age=3600',
          },
        })
      } catch {
        // Datacenter fetches often fail for retailer CDNs; try Jina-proxied binary when possible.
        const proxied = await fetch(`https://r.jina.ai/${target}`, {
          headers: { Accept: 'image/*,*/*', 'X-Return-Format': 'raw' },
          signal: AbortSignal.timeout(20000),
        })
        if (!proxied.ok) throw new Error('Preview image is unavailable')
        const body = new Uint8Array(await proxied.arrayBuffer())
        const type = proxied.headers.get('content-type') ?? 'image/jpeg'
        return new Response(body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': type.startsWith('image/') ? type : 'image/jpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        })
      }
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
