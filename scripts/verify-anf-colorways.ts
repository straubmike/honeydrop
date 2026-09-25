import { previewLink } from '../linkPreviewServer.ts'

function pair(cands: string[], start: number): string[] {
  if (!cands.length) return []
  const a = cands[((start % cands.length) + cands.length) % cands.length]!
  const b = cands[(((start + 1) % cands.length) + cands.length) % cands.length]!
  return a === b ? [a] : [a, b]
}

function key(u: string): string {
  return u.match(/KIC_[A-Z0-9-]+(?:_(?:model|prod|life|flat)\d+)?/i)?.[0] ?? u
}

const url =
  'https://www.abercrombie.com/shop/us/p/a-and-f-marina-one-piece-swimsuit-62240356?categoryId=12293&faceout=model&seq=22&gridProductPosition=17'

const preview = await previewLink(url)
const first = pair(preview.candidates, 0)
const coffeePair = pair(preview.candidates, 2)

console.log(
  JSON.stringify(
    {
      scraped: preview.candidates.length,
      initialPair: first.map(key),
      afterOneSeeMore: coffeePair.map(key),
    },
    null,
    2,
  ),
)

if (first.length > 2 || coffeePair.length > 2) {
  console.error('FAIL: more than 2 shown')
  process.exit(1)
}
if (!coffeePair.every((u) => /KIC_111-6178/i.test(u))) {
  console.error('FAIL: after one See more should be coffee-stripe pair (KIC_111-6178)')
  process.exit(1)
}
if (preview.candidates.length < 6) {
  console.error('FAIL: gallery too small')
  process.exit(1)
}
console.log('OK: coffee stripe is the second cycle pair')
