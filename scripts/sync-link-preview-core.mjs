import fs from 'node:fs'

const src = fs.readFileSync(new URL('../linkPreviewServer.ts', import.meta.url), 'utf8')

let body = src
  .replace(/^import[\s\S]*?\n(?=\/\/ Keep HTML caps|const MAX_HTML)/, '')
  .replace(/function sendJson[\s\S]*$/, '')

// Node Buffer leftovers should not appear in the Deno edge bundle.
if (/\bBuffer\b/.test(body)) {
  console.warn('Warning: Buffer still referenced in previewCore source before write')
}

const out = `// Auto-synced from linkPreviewServer.ts — run: node scripts/sync-link-preview-core.mjs\n${body}`
fs.writeFileSync(new URL('../supabase/functions/link-api/previewCore.ts', import.meta.url), out)
console.log('Wrote previewCore.ts', out.length, 'chars; Buffer left?', /\bBuffer\b/.test(out))
