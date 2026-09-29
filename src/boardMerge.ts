import type { Collection, IdeaBoard } from './types'

/** Normalize a place so lat/lng pins always carry display text when possible. */
export function normalizeGeoLabel(
  location: { lat: number; lng: number; label?: string } | undefined,
  fallback?: string,
): { lat: number; lng: number; label?: string } | undefined {
  if (!location) return undefined
  const label = location.label?.trim() || fallback?.trim() || undefined
  return label ? { ...location, label } : { lat: location.lat, lng: location.lng }
}

function newerCollection(a: Collection, b: Collection): Collection {
  return a.updatedAt >= b.updatedAt ? a : b
}

/**
 * Merge partner board JSON so event/idea deletes and location edits survive
 * full-document last-write-wins races.
 *
 * - `baseline`: last remote collections we applied (or successfully persisted)
 * - `deletedIds`: collections removed locally since baseline, not yet acked
 */
export function mergeCollections(
  remote: Collection[],
  local: Collection[],
  baseline: Collection[],
  deletedIds: ReadonlySet<string>,
): Collection[] {
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]))
  const localById = new Map(local.map((entry) => [entry.id, entry]))
  const baselineById = new Map(baseline.map((entry) => [entry.id, entry]))
  const result = new Map<string, Collection>()

  const ids = new Set<string>([
    ...remoteById.keys(),
    ...localById.keys(),
    ...baselineById.keys(),
  ])

  for (const id of ids) {
    if (deletedIds.has(id)) continue

    const remoteEntry = remoteById.get(id)
    const localEntry = localById.get(id)
    const baselineEntry = baselineById.get(id)

    if (localEntry && remoteEntry) {
      result.set(id, newerCollection(localEntry, remoteEntry))
      continue
    }

    if (localEntry && !remoteEntry) {
      // Local-only: keep if we added/edited it after baseline, or it was never on the server copy we knew.
      if (!baselineEntry) {
        result.set(id, localEntry)
        continue
      }
      // Present in baseline but missing remotely → partner deleted it.
      // Only resurrect if we edited it after the baseline snapshot.
      if (localEntry.updatedAt > baselineEntry.updatedAt) {
        result.set(id, localEntry)
      }
      continue
    }

    if (!localEntry && remoteEntry) {
      // Remote-only: keep unless we deleted it (already filtered) or we had intentionally removed
      // an unchanged baseline copy (also covered by deletedIds). Partner additions land here.
      result.set(id, remoteEntry)
    }
  }

  // Prefer remote order, then append any local-only survivors in local order.
  const ordered: Collection[] = []
  const seen = new Set<string>()
  for (const entry of remote) {
    const merged = result.get(entry.id)
    if (!merged || seen.has(entry.id)) continue
    ordered.push(merged)
    seen.add(entry.id)
  }
  for (const entry of local) {
    const merged = result.get(entry.id)
    if (!merged || seen.has(entry.id)) continue
    ordered.push(merged)
    seen.add(entry.id)
  }
  for (const [id, merged] of result) {
    if (seen.has(id)) continue
    ordered.push(merged)
  }
  return ordered
}

export function mergeBoardFromRemote(
  remote: IdeaBoard,
  local: IdeaBoard,
  baselineCollections: Collection[],
  deletedIds: ReadonlySet<string>,
): IdeaBoard {
  return {
    ...remote,
    // Keep whichever board title/pendingDeletion is newer by board clock, but always
    // merge collections so a newer stale document cannot resurrect deletes.
    title:
      local.updatedAt > remote.updatedAt && local.title !== remote.title
        ? local.title
        : remote.title,
    pendingDeletion:
      local.updatedAt > remote.updatedAt
        ? local.pendingDeletion
        : remote.pendingDeletion,
    updatedAt: local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt,
    collections: mergeCollections(
      remote.collections,
      local.collections,
      baselineCollections,
      deletedIds,
    ),
    members: remote.members,
  }
}

/** After a successful persist, drop delete markers that are gone from the saved board. */
export function pruneDeletedIds(
  deletedIds: ReadonlySet<string>,
  savedCollections: Collection[],
): Set<string> {
  const remaining = new Set(deletedIds)
  const savedIds = new Set(savedCollections.map((entry) => entry.id))
  for (const id of deletedIds) {
    if (!savedIds.has(id)) remaining.delete(id)
  }
  return remaining
}
