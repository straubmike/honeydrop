import type { GeoPoint } from './types'

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
}

const EARTH_RADIUS_MILES = 3958.7613
const MILES_TO_KM = 1.609344

export type DistanceUnit = 'mi' | 'km'

/** Great-circle distance in miles between two points (WGS84). */
export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

function formatDistanceValue(value: number, unitWord: string): string {
  if (value < 0.1) return `Less than 0.1 ${unitWord} apart`
  if (value < 10) return `About ${value.toFixed(1)} ${unitWord} apart`
  if (value < 100) return `About ${Math.round(value)} ${unitWord} apart`
  return `About ${Math.round(value / 10) * 10} ${unitWord} apart`
}

/** Short human label for map UI, e.g. "About 12 miles apart". */
export function formatDistanceApart(miles: number, unit: DistanceUnit = 'mi'): string {
  if (!Number.isFinite(miles) || miles < 0) return ''
  if (unit === 'km') {
    return formatDistanceValue(miles * MILES_TO_KM, 'kilometers')
  }
  return formatDistanceValue(miles, 'miles')
}

export async function searchPlaces(query: string): Promise<GeoPoint[]> {
  const q = query.trim()
  if (!q) return []
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '5')
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) return []
  const rows = (await response.json()) as NominatimHit[]
  return rows
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      label: row.display_name,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
}

export async function reversePlace(lat: number, lng: number): Promise<string | undefined> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) return undefined
  const row = (await response.json()) as { display_name?: string }
  return row.display_name
}

export function readDeviceLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'))
      return
    }

    const onSuccess = (position: GeolocationPosition) => {
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: 'Current location',
      })
    }

    const failMessage = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        return 'Location permission was denied. Allow access for this site in the browser, then try again.'
      }
      if (error.code === error.TIMEOUT) {
        return 'Timed out waiting for your location. Try again, or search for a place instead.'
      }
      return 'Could not read your location. Check that location services are on, then try again.'
    }

    // Prefer a quick network/Wi‑Fi fix; high-accuracy GPS often times out indoors.
    navigator.geolocation.getCurrentPosition(onSuccess, (firstError) => {
      if (firstError.code === firstError.PERMISSION_DENIED) {
        reject(new Error(failMessage(firstError)))
        return
      }
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (secondError) => reject(new Error(failMessage(secondError))),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      )
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 })
  })
}

