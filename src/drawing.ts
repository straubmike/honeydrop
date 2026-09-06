export const DRAW_COLORS = ['#c0562a', '#c9923a', '#355c48', '#221910', '#f0d5c4', '#fffaf2'] as const
export const STROKE_WIDTH = 0.018

export interface DrawingPoint {
  x: number
  y: number
}

export interface DrawingStroke {
  color: string
  points: DrawingPoint[]
  width: number
}

export interface DrawingData {
  background: string
  strokes: DrawingStroke[]
}

export function parseDrawing(raw: string): DrawingData | null {
  try {
    const data = JSON.parse(raw) as DrawingData
    if (!data || typeof data.background !== 'string' || !Array.isArray(data.strokes)) return null
    return data
  } catch {
    return null
  }
}

export function stringifyDrawing(data: DrawingData): string {
  return JSON.stringify(data)
}
