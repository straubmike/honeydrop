import { DRAW_COLORS } from './drawing'
import { parseISODate, rangeLength, toISODate } from './dates'
import type { Collection } from './types'

export type MonthCell = Date | null

export interface MonthEventRange {
  collection: Collection
  /** Inclusive ISO dates occupied in this month (contiguous occurrence). */
  startIso: string
  endIso: string
}

export interface MonthBarSegment {
  key: string
  collection: Collection
  /** Day-of-week column 0=Sun … 6=Sat within the week row. */
  startCol: number
  endCol: number
  lane: number
  color: string
  /** Light fill → dark label; dark fill → light label. */
  labelOnDark: boolean
  /** True single-day event (not a leftover multi-day stub). */
  singleDayEvent: boolean
  continuesLeft: boolean
  continuesRight: boolean
}

export interface MonthWeekLayout {
  weekIndex: number
  cells: MonthCell[]
  segments: MonthBarSegment[]
  laneCount: number
}

const LIGHT_FILLS = new Set(['#f0d5c4', '#fffaf2', '#F0D5C4', '#FFFAF2'])

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

/** Contiguous occurrence ranges that touch the given month. */
export function eventRangesInMonth(
  collections: Collection[],
  year: number,
  month: number,
): MonthEventRange[] {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const monthStartIso = toISODate(monthStart)
  const monthEndIso = toISODate(monthEnd)
  const ranges: MonthEventRange[] = []

  for (const collection of collections) {
    const schedule = collection.schedule
    if (!schedule) continue

    const origStart = parseISODate(schedule.startDate)
    const span = rangeLength(schedule.startDate, schedule.endDate)

    const pushOccurrence = (rangeStart: Date) => {
      const rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + span)
      if (rangeEnd < monthStart || rangeStart > monthEnd) return
      const startIso = toISODate(rangeStart) < monthStartIso ? monthStartIso : toISODate(rangeStart)
      const endIso = toISODate(rangeEnd) > monthEndIso ? monthEndIso : toISODate(rangeEnd)
      ranges.push({ collection, startIso, endIso })
    }

    if (schedule.recurrence === 'none') {
      pushOccurrence(origStart)
    } else if (schedule.recurrence === 'yearly') {
      pushOccurrence(clampDay(year, origStart.getMonth(), origStart.getDate()))
    } else {
      pushOccurrence(clampDay(year, month, origStart.getDate()))
    }
  }

  return ranges
}

function compareRanges(a: MonthEventRange, b: MonthEventRange): number {
  if (a.startIso !== b.startIso) return a.startIso < b.startIso ? -1 : 1
  const spanA = rangeLength(a.startIso, a.endIso)
  const spanB = rangeLength(b.startIso, b.endIso)
  if (spanA !== spanB) return spanB - spanA
  return a.collection.id.localeCompare(b.collection.id)
}

function colorForLane(lane: number): { color: string; labelOnDark: boolean } {
  const color = DRAW_COLORS[lane % DRAW_COLORS.length]!
  return { color, labelOnDark: !LIGHT_FILLS.has(color) }
}

function assignLanes(
  items: Array<{ startCol: number; endCol: number }>,
): number[] {
  const laneEnds: number[] = []
  const lanes: number[] = []

  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end < item.startCol)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.endCol)
    } else {
      laneEnds[lane] = item.endCol
    }
    lanes.push(lane)
  }

  return lanes
}

function chunkWeeks(cells: MonthCell[]): MonthCell[][] {
  const weeks: MonthCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

/**
 * Build week rows with stacked multi-day bars.
 * Segments restart at each Sunday (after Saturday) so bars never cross week rows.
 * Lane 0 is always orange (DRAW_COLORS[0]); later lanes follow the drawing palette order.
 */
export function layoutMonthWeeks(
  cells: MonthCell[],
  collections: Collection[],
  year: number,
  month: number,
): MonthWeekLayout[] {
  const ranges = [...eventRangesInMonth(collections, year, month)].sort(compareRanges)
  const weeks = chunkWeeks(cells)

  return weeks.map((weekCells, weekIndex) => {
    const dayIsos = weekCells.map((cell) => (cell ? toISODate(cell) : null))
    const weekDates = dayIsos.filter((iso): iso is string => Boolean(iso))
    if (weekDates.length === 0) {
      return { weekIndex, cells: weekCells, segments: [], laneCount: 0 }
    }

    const weekStart = weekDates[0]!
    const weekEnd = weekDates[weekDates.length - 1]!

    type Draft = {
      collection: Collection
      startCol: number
      endCol: number
      startIso: string
      endIso: string
      singleDayEvent: boolean
      continuesLeft: boolean
      continuesRight: boolean
    }

    const drafts: Draft[] = []

    for (const range of ranges) {
      if (range.endIso < weekStart || range.startIso > weekEnd) continue

      const segStart = range.startIso < weekStart ? weekStart : range.startIso
      const segEnd = range.endIso > weekEnd ? weekEnd : range.endIso
      const startCol = dayIsos.indexOf(segStart)
      const endCol = dayIsos.indexOf(segEnd)
      if (startCol < 0 || endCol < 0) continue

      const fullSpan = rangeLength(range.startIso, range.endIso)
      drafts.push({
        collection: range.collection,
        startCol,
        endCol,
        startIso: segStart,
        endIso: segEnd,
        singleDayEvent: fullSpan === 0,
        continuesLeft: range.startIso < segStart,
        continuesRight: range.endIso > segEnd,
      })
    }

    drafts.sort((a, b) => {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol
      const spanA = a.endCol - a.startCol
      const spanB = b.endCol - b.startCol
      if (spanA !== spanB) return spanB - spanA
      return a.collection.id.localeCompare(b.collection.id)
    })

    const lanes = assignLanes(drafts)
    const segments: MonthBarSegment[] = drafts.map((draft, index) => {
      const lane = lanes[index]!
      const { color, labelOnDark } = colorForLane(lane)
      return {
        key: `${draft.collection.id}-${weekIndex}-${draft.startIso}`,
        collection: draft.collection,
        startCol: draft.startCol,
        endCol: draft.endCol,
        lane,
        color,
        labelOnDark,
        singleDayEvent: draft.singleDayEvent,
        continuesLeft: draft.continuesLeft,
        continuesRight: draft.continuesRight,
      }
    })

    const laneCount = segments.reduce((max, seg) => Math.max(max, seg.lane + 1), 0)
    return { weekIndex, cells: weekCells, segments, laneCount }
  })
}

/** ISO dates touched by a segment (for selecting a day under a bar click). */
export function segmentDayIso(weekCells: MonthCell[], col: number): string | null {
  const cell = weekCells[col]
  return cell ? toISODate(cell) : null
}
