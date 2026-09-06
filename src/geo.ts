import type { GeoPoint } from './types'

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
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

