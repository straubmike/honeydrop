import { previewLink, fetchPreviewImage } from '../linkPreviewServer.ts'

const url =
  process.argv[2] ||
  'https://www.abercrombie.com/shop/us/p/a-and-f-marina-one-piece-swimsuit-62240356?categoryId=12293&faceout=model&seq=22&gridProductPosition=17'

const preview = await previewLink(url)
console.log(
  JSON.stringify(
    {
      title: preview.title,
      imageCount: preview.images.length,
      candidateCount: preview.candidates.length,
      images: preview.images,
      candidates: preview.candidates.slice(0, 6),
    },
    null,
    2,
  ),
)

if (!preview.images.length) {
  console.error('FAIL: no preview images')
  process.exit(1)
}

const img = await fetchPreviewImage(preview.images[0]!)
console.log('fetched image bytes', img.body.length, img.type)
if (img.body.length < 1000) {
  console.error('FAIL: image too small')
  process.exit(1)
}
console.log('OK')
