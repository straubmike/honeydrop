import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { readDeviceLocation, reversePlace, searchPlaces } from '../geo'
import type { BoardMember, Collection, GeoPoint } from '../types'
import { LocateMeButton, LocationHelpButton } from './LocationControls'
import { flyToPoint, useMapPins, useOsmMap, type MapPin } from './OsmMap'

interface BoardMapProps {
  members: BoardMember[]
  userId: string
  events: Collection[]
  focusPoint?: GeoPoint | null
  onOpenEvent: (id: string) => void
  onSetMyLocation: (location?: GeoPoint) => void
  onFocused?: () => void
}

export function BoardMap({
  members,
  userId,
  events,
  focusPoint,
  onOpenEvent,
  onSetMyLocation,
  onFocused,
}: BoardMapProps) {
  const { containerRef, map } = useOsmMap()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GeoPoint[]>([])
  const [candidate, setCandidate] = useState<GeoPoint | null>(null)
  const [busy, setBusy] = useState(false)
  const me = members.find((member) => member.userId === userId)
  const mine = me?.location

  const pins = useMemo<MapPin[]>(() => {
    const memberPins: MapPin[] = members
      .filter((member) => member.location)
      .map((member) => ({
        id: `member-${member.userId}`,
        point: member.location!,
        label: member.name,
        kind: 'member',
      }))
    const eventPins: MapPin[] = events
      .filter((event) => event.location)
      .map((event) => ({
        id: `event-${event.id}`,
        point: event.location!,
        label: event.title,
        kind: 'event',
        onClick: () => onOpenEvent(event.id),
      }))
    const previewPins: MapPin[] =
      candidate
        ? [
            {
              id: 'search-preview',
              point: candidate,
              label: candidate.label || 'Selected place',
              kind: 'preview',
            },
          ]
        : []
    return [...memberPins, ...eventPins, ...previewPins]
  }, [candidate, events, members, onOpenEvent])

  useMapPins(map, pins)

  useEffect(() => {
    if (!map || !focusPoint) return
    flyToPoint(map, focusPoint)
    onFocused?.()
  }, [focusPoint, map, onFocused])

  const previewPlace = useCallback(
    async (point: GeoPoint) => {
      const label = point.label ?? (await reversePlace(point.lat, point.lng))
      const next = { ...point, label }
      setCandidate(next)
      setQuery(label ?? '')
      flyToPoint(map, next)
    },
    [map],
  )

  const commitLocation = () => {
    if (!candidate) {
      window.alert('Search for a place first, then set it as your location.')
      return
    }
    onSetMyLocation(candidate)
    setCandidate(null)
    setHits([])
    setQuery(candidate.label ?? '')
  }

  const search = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const next = await searchPlaces(query)
      setHits(next)
      if (next[0]) await previewPlace(next[0])
      else window.alert('No places matched that search.')
    } catch {
      window.alert('Could not search for that place.')
    } finally {
      setBusy(false)
    }
  }

  const pinDevice = async () => {
    setBusy(true)
    try {
      const point = await readDeviceLocation()
      await previewPlace(point)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read your location.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="board-map">
      <div className="board-map__toolbar">
        <div className="board-map__find">
          <LocateMeButton busy={busy} onClick={() => void pinDevice()} />
          <LocationHelpButton />
          <form className="board-map__search" onSubmit={(event) => void search(event)}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a place…"
              aria-label="Search a place"
            />
            <button type="submit" className="ghost" disabled={busy || !query.trim()}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </form>
        </div>
        <div className="board-map__actions">
          <button
            type="button"
            className={candidate ? 'primary' : 'ghost'}
            disabled={!candidate}
            onClick={commitLocation}
          >
            {mine ? 'Update location' : 'Set my location'}
          </button>
          {mine ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onSetMyLocation(undefined)
                setCandidate(null)
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {hits.length > 1 ? (
        <div className="board-map__hits">
          {hits.map((hit) => (
            <button
              key={`${hit.lat},${hit.lng},${hit.label}`}
              type="button"
              className="text-btn"
              onClick={() => void previewPlace(hit)}
            >
              {hit.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="board-map__canvas" ref={containerRef} />
    </section>
  )
}
