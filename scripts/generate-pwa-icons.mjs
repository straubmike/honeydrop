import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

// Dipper art uses BrandMark coords (viewBox 0 0 28 56). Nudge below geometric
// center so the bulky head doesn't look top-heavy (optical centering).
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#d96a38"/>
  <g transform="translate(256 272) scale(5) translate(-14 -28)">
    <path fill="#e8b14a" d="M14 1.8c3.4 0 6 1.5 6 3.4 0 .7-.3 1.3-.8 1.8H8.8C8.3 6.5 8 5.9 8 5.2c0-1.9 2.6-3.4 6-3.4Z"/>
    <rect x="8.2" y="6.8" width="11.6" height="2.5" rx="1.2" fill="#8f3a16"/>
    <rect x="8.6" y="9.5" width="10.8" height="2.1" rx="1" fill="#e8b14a"/>
    <rect x="7.8" y="11.8" width="12.4" height="2.5" rx="1.2" fill="#8f3a16"/>
    <rect x="8.4" y="14.5" width="11.2" height="2.1" rx="1" fill="#e8b14a"/>
    <rect x="8" y="16.8" width="12" height="2.5" rx="1.2" fill="#8f3a16"/>
    <path fill="#8f3a16" d="M9.2 19.5h9.6c.3 1.2-.4 2.3-1.7 2.9-.9.4-2 0-2.7 0s-1.8.4-2.7 0c-1.3-.6-2-1.7-1.7-2.9Z"/>
    <rect x="12.15" y="22.2" width="3.7" height="29.2" rx="1.7" fill="#8f3a16"/>
    <rect x="12.65" y="22.6" width="2.7" height="28.2" rx="1.35" fill="#e8b14a"/>
    <ellipse cx="14" cy="52.8" rx="2.6" ry="1.7" fill="#8f3a16"/>
  </g>
</svg>`

await mkdir(publicDir, { recursive: true })

for (const size of [192, 512]) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  const out = path.join(publicDir, `pwa-${size}.png`)
  await writeFile(out, buffer)
  console.log('wrote', out)
}

const apple = await sharp(Buffer.from(svg)).resize(180, 180).png().toBuffer()
await writeFile(path.join(publicDir, 'apple-touch-icon.png'), apple)
console.log('wrote apple-touch-icon.png')
