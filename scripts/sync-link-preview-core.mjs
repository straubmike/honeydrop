import fs from 'node:fs'

const src = fs.readFileSync(new URL('../linkPreviewServer.ts', import.meta.url), 'utf8')

let body = src
  .replace(/^import[\s\S]*?\n(?=const MAX_HTML)/, '')
  .replace(/function sendJson[\s\S]*$/, '')

body = body.replace(
  /const buffer = Buffer\.from\(await response\.arrayBuffer\(\)\)\r?\n\s*const html = buffer\.subarray\(0, MAX_HTML\)\.toString\('utf8'\)/,
  'const buffer = new Uint8Array(await response.arrayBuffer())\n  const html = new TextDecoder().decode(buffer.subarray(0, MAX_HTML))',
)
body = body.replaceAll(
  'const body = Buffer.from(await response.arrayBuffer())',
  'const body = new Uint8Array(await response.arrayBuffer())',
)
body = body.replace(/if \(body\.length >/g, 'if (body.byteLength >')
body = body.replaceAll(
  'Promise<{ body: Buffer; type: string }>',
  'Promise<{ body: Uint8Array; type: string }>',
)

const out = `// Auto-synced from linkPreviewServer.ts — run: node scripts/sync-link-preview-core.mjs\n${body}`
fs.writeFileSync(new URL('../supabase/functions/link-api/previewCore.ts', import.meta.url), out)
console.log('Wrote previewCore.ts', out.length, 'chars; Buffer left?', out.includes('Buffer'))
