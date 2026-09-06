import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeoPoint } from '../types'
import { BrandMark } from './BrandMark'

export interface MapPin {
  id: string
  point: GeoPoint
  label: string
  kind: 'member' | 'event' | 'preview'
  onClick?: () => void
}

const DEFAULT_CENTER: L.LatLngExpression = [39.8, -98.6]
const DEFAULT_ZOOM = 4

export function useOsmMap(scrollWheelZoom = true) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const instance = L.map(el, { scrollWheelZoom, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance)
    instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    mapRef.current = instance
    setMap(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(el)
    const frame = requestAnimationFrame(() => instance.invalidateSize())
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      instance.remove()
      mapRef.current = null
      setMap(null)
    }
  }, [scrollWheelZoom])

  return { containerRef, map }
}

export function useMapPins(map: L.Map | null, pins: MapPin[]) {
  const pinKey = pins
    .map((pin) => `${pin.id}:${pin.point.lat}:${pin.point.lng}:${pin.label}:${pin.kind}`)
    .join('|')
  const pinsRef = useRef(pins)

  useEffect(() => {
    pinsRef.current = pins
  }, [pins])

  useEffect(() => {
    if (!map) return
    const current = pinsRef.current
    const mounted = current.map((pin) => addMapPin(map, pin))
    if (current.length === 1) {
      map.setView([current[0].point.lat, current[0].point.lng], Math.max(map.getZoom(), 11))
    } else if (current.length > 1) {
      const bounds = L.latLngBounds(current.map((pin) => [pin.point.lat, pin.point.lng]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 })
    }
    return () => {
      for (const entry of mounted) entry.remove()
    }
  }, [map, pinKey])
}

export function flyToPoint(map: L.Map | null, point: GeoPoint, zoom = 13) {
  map?.flyTo([point.lat, point.lng], zoom)
}

function addMapPin(map: L.Map, pin: MapPin) {
  const wrap = document.createElement('div')
  wrap.className = `map-pin map-pin--${pin.kind}`
  const icon = L.divIcon({
    html: wrap,
    className: 'map-pin-icon',
    iconSize: [22, 44],
    iconAnchor: [11, 44],
  })
  const marker = L.marker([pin.point.lat, pin.point.lng], {
    icon,
    zIndexOffset: pin.kind === 'preview' ? 300 : pin.kind === 'member' ? 200 : 80,
    title: pin.label,
  }).addTo(map)
  if (pin.onClick) marker.on('click', pin.onClick)
  const root: Root = createRoot(wrap)
  root.render(
    <>
      <BrandMark />
      <span className="map-pin__label">{pin.label}</span>
    </>,
  )
  return {
    remove: () => {
      marker.remove()
      root.unmount()
    },
  }
}
