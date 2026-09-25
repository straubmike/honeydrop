import { previewLink } from '../linkPreviewServer.ts'

function previewPairUrls(candidates: string[], startIndex = 0): string[] {
  if (!candidates.length) return []
  if (candidates.length === 1) return [candidates[0]!]
  const first = candidates[((startIndex % candidates.length) + candidates.length) % candidates.length]!
  const second =
    candidates[(((startIndex + 1) % candidates.length) + candidates.length) % candidates.length]!
  return first === second ? [first] : [first, second]
}

const url =
  process.argv[2] ||
  'https://www.abercrombie.com/shop/us/p/a-and-f-marina-one-piece-swimsuit-62240356?categoryId=12293&faceout=model&seq=22&gridProductPosition=17'

const preview = await previewLink(url)
const fetchUrls = previewPairUrls(preview.candidates, 0)
const cycleUrls = previewPairUrls(preview.candidates, 2)

console.log(
  JSON.stringify(
    {
      title: preview.title,
      scraped: preview.candidates.length,
      shownPair: fetchUrls.map((u) => u.match(/KIC_[^_?]+/)?.[0]),
      nextPairAfterSeeMore: cycleUrls.map((u) => u.match(/KIC_[^_?]+/)?.[0]),
    },
    null,
    2,
  ),
)

const hasCoffee = preview.candidates.some((c) => c.includes('KIC_111-6178-00045-479'))
const coffeeInFirstPair = fetchUrls.some((c) => c.includes('KIC_111-6178-00045-479'))

if (fetchUrls.length > 2) {
  console.error('FAIL: preview shows more than 2 images')
  process.exit(1)
}
if (!hasCoffee) {
  console.error('FAIL: coffee stripe missing from scraped gallery')
  process.exit(1)
}
if (preview.candidates.length < 6) {
  console.error('FAIL: expected a richer multi-colorway gallery')
  process.exit(1)
}
console.log({ coffeeInFirstPair, scraped: preview.candidates.length, shown: fetchUrls.length })
console.log('OK')
