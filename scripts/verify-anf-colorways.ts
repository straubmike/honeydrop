import { previewLink } from '../linkPreviewServer.ts'

function anfKey(url: string): string | null {
  return (
    /img\.abercrombie\.com\/is\/image\/anf\/(KIC_[A-Z0-9-]+?)(?:_(?:prod|model|life|flat)\d+)?(?:\?|$)/i.exec(
      url,
    )?.[1]?.toUpperCase() ?? null
  )
}

function previewFetchUrls(candidates: string[]): string[] {
  const colorways: string[] = []
  const seen = new Set<string>()
  for (const url of candidates) {
    const key = anfKey(url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    colorways.push(url)
    if (colorways.length >= 3) break
  }
  return colorways.length >= 2 ? colorways : candidates.slice(0, 2)
}

const url =
  process.argv[2] ||
  'https://www.abercrombie.com/shop/us/p/a-and-f-marina-one-piece-swimsuit-62240356?categoryId=12293&faceout=model&seq=22&gridProductPosition=17'

const preview = await previewLink(url)
const fetchUrls = previewFetchUrls(preview.candidates)
console.log(
  JSON.stringify(
    {
      title: preview.title,
      candidateCount: preview.candidates.length,
      firstCandidates: preview.candidates.slice(0, 8),
      fetchUrls,
      colorways: fetchUrls.map((u) => anfKey(u)),
    },
    null,
    2,
  ),
)

const hasCoffee = preview.candidates.some((c) => c.includes('KIC_111-6178-00045-479'))
const coffeeInFetch = fetchUrls.some((c) => c.includes('KIC_111-6178-00045-479'))
console.log({ hasCoffee, coffeeInFetch, fetchCount: fetchUrls.length })
if (!hasCoffee || !coffeeInFetch || fetchUrls.length < 3) {
  console.error('FAIL: expected coffee stripe colorway in initial multi-color fetch set')
  process.exit(1)
}
console.log('OK')
