import { getSupabase } from '../lib/supabase'

const BUCKET = 'board-media'

export function supabaseMediaRef(boardId: string, attachmentId: string): string {
  return `sb:${boardId}/${attachmentId}`
}

export function isSupabaseMedia(content: string): boolean {
  return content.startsWith('sb:')
}

export function parseSupabaseMediaPath(content: string): string | null {
  if (!isSupabaseMedia(content)) return null
  return content.slice(3)
}

export async function uploadBoardMedia(
  boardId: string,
  attachmentId: string,
  file: Blob,
  mime?: string,
): Promise<string> {
  const supabase = getSupabase()
  const path = `${boardId}/${attachmentId}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime || file.type || 'application/octet-stream',
    upsert: true,
  })
  if (error) throw error
  return supabaseMediaRef(boardId, attachmentId)
}

export async function downloadBoardMedia(content: string): Promise<Blob | undefined> {
  const path = parseSupabaseMediaPath(content)
  if (!path) return undefined
  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return undefined
  return data
}

export async function deleteBoardMedia(content: string): Promise<void> {
  const path = parseSupabaseMediaPath(content)
  if (!path) return
  const supabase = getSupabase()
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function deleteBoardMediaFolder(boardId: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).list(boardId)
  if (error || !data?.length) return
  const paths = data.map((entry) => `${boardId}/${entry.name}`)
  await supabase.storage.from(BUCKET).remove(paths)
}
