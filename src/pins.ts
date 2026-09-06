import type { Item } from './types'

export const CARD_W = 272
export const CARD_GAP = 18
export const BOARD_PAD = 16

export interface Pin {
  x: number
  y: number
  z: number
}

export function pinForIndex(index: number, boardWidth: number): Pin {
  const usable = Math.max(CARD_W, boardWidth - BOARD_PAD * 2)
  const cols = Math.max(1, Math.floor((usable + CARD_GAP) / (CARD_W + CARD_GAP)))
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: BOARD_PAD + col * (CARD_W + CARD_GAP),
    y: BOARD_PAD + row * 300,
    z: index + 1,
  }
}

export function resolvePin(item: Item, index: number, boardWidth: number): Pin {
  if (item.x != null && item.y != null) {
    return { x: item.x, y: item.y, z: item.z ?? index + 1 }
  }
  return pinForIndex(index, boardWidth)
}

export function nextPin(items: Item[], boardWidth: number): Pin {
  const placed = items.map((item, index) => resolvePin(item, index, boardWidth))
  const maxZ = placed.reduce((max, pin) => Math.max(max, pin.z), 0)
  if (!placed.length) return { x: BOARD_PAD, y: BOARD_PAD, z: 1 }
  const lowest = placed.reduce((max, pin) => Math.max(max, pin.y), 0)
  return { x: BOARD_PAD, y: lowest + 300, z: maxZ + 1 }
}

export function boardExtent(items: Item[], boardWidth: number, boardHeight: number): { w: number; h: number } {
  return items.reduce(
    (extent, item, index) => {
      const pin = resolvePin(item, index, boardWidth)
      return {
        w: Math.max(extent.w, pin.x + CARD_W + BOARD_PAD),
        h: Math.max(extent.h, pin.y + 420 + BOARD_PAD),
      }
    },
    { w: boardWidth, h: boardHeight },
  )
}
