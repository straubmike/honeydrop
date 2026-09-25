/**
 * Deno-shaped check for the ANF lite scrape (same modules the edge function uses).
 * Run: npx deno run -A scripts/verify-anf-edge-lite.ts
 *
 * Mimics edge constraints by importing previewCore and asserting the lite path
 * returns KIC_ candidates quickly without the Node Vite plugin.
 */
import {
  LINK_PREVIEW_REVISION,
  previewLink,
  fetchPreviewImage,
} from '../supabase/functions/link-api/previewCore.ts'

const url =
  Deno.args[0] ||
  'https://www.abercrombie.com/shop/us/p/a-and-f-marina-one-piece-swimsuit-62240356?categoryId=12293&faceout=model&seq=22&gridProductPosition=17'

const started = performance.now()
const preview = await previewLink(url)
const ms = Math.round(performance.now() - started)

const payload = {
  revision: preview.revision ?? LINK_PREVIEW_REVISION,
  debug: preview.debug,
  title: preview.title,
  ms,
  imageCount: preview.images.length,
  candidateCount: preview.candidates.length,
  images: preview.images,
  candidates: preview.candidates.slice(0, 6),
}
console.log(JSON.stringify(payload, null, 2))

if (preview.revision !== 'anf-lite-2' && preview.revision !== LINK_PREVIEW_REVISION) {
  console.error('FAIL: unexpected revision', preview.revision)
  Deno.exit(1)
}
if (!preview.candidates.some((c) => /KIC_/i.test(c))) {
  console.error('FAIL: no KIC_ candidates')
  Deno.exit(1)
}
if (ms > 15000) {
  console.error('FAIL: too slow for edge budget', ms)
  Deno.exit(1)
}

const img = await fetchPreviewImage(preview.images[0]!)
console.log('fetched image bytes', img.body.byteLength, img.type)
if (img.body.byteLength < 1000) {
  console.error('FAIL: image too small')
  Deno.exit(1)
}
console.log('OK edge-lite')
