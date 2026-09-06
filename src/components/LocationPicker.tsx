import { useCallback, useEffect, useMemo, useState } from 'react'
import { readDeviceLocation, reversePlace, searchPlaces } from '../geo'
import type { GeoPoint } from '../types'
import { LocateMeButton, LocationHelpButton } from './LocationControls'
import { flyToPoint, useMapPins, useOsmMap, type MapPin } from './OsmMap'

interface LocationPickerProps {
  value?: GeoPoint
  onChange: (location?: GeoPoint) => void
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const { containerRef, map } = useOsmMap(false)
  const [query, setQuery] = useState(value?.label ?? '')
  const [hits, setHits] = useState<GeoPoint[]>([])
  const [busy, setBusy] = useState(false)

  const pins = useMemo<MapPin[]>(
    () =>
      value
        ? [{ id: 'event-location', point: value, label: value.label || 'Event', kind: 'event' }]
        : [],
    [value],
  )

  useMapPins(map, pins)

  const apply = useCallback(
    async (point: GeoPoint) => {
      const label = point.label ?? (await reversePlace(point.lat, point.lng))
      const next = { ...point, label }
      onChange(next)
      flyToPoint(map, next)
      setHits([])
      setQuery(label ?? '')
    },
    [map, onChange],
  )

  useEffect(() => {
    if (!map) return
    const onClick = (event: { latlng: { lat: number; lng: number } }) => {
      void apply({ lat: event.latlng.lat, lng: event.latlng.lng })
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [apply, map])

  const search = async () => {
    if (!query.trim()) return
    setBusy(true)
    try {
      const next = await searchPlaces(query)
      setHits(next)
      if (next[0]) await apply(next[0])
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
      await apply(point)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read your location.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="location-picker">
      <div className="location-picker__row">
        <div className="board-map__find">
          <LocateMeButton busy={busy} onClick={() => void pinDevice()} />
          <LocationHelpButton />
          <div className="board-map__search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void search()
                }
              }}
              placeholder="Search a place or use locate…"
              aria-label="Event location"
            />
            <button type="button" className="ghost" disabled={busy || !query.trim()} onClick={() => void search()}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
        {value ? (
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              onChange(undefined)
              setQuery('')
              setHits([])
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {hits.length > 1 ? (
        <div className="board-map__hits">
          {hits.map((hit) => (
            <button
              key={`${hit.lat},${hit.lng},${hit.label}`}
              type="button"
              className="text-btn"
              onClick={() => void apply(hit)}
            >
              {hit.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="location-picker__canvas" ref={containerRef} />
    </div>
  )
}
