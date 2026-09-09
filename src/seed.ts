import { uid } from './dates'
import type { AppState, IdeaBoard } from './types'

/** Empty starting state — demo boards are disabled for cloud-backed production. */
export function seedState(): AppState {
  return {
    userId: uid(),
    displayName: 'You',
    boards: [],
  }
}

const SAMPLE_ME = {
  lat: 37.7749,
  lng: -122.4194,
  label: 'San Francisco, CA',
}

const SAMPLE_PARTNER = {
  lat: 34.0522,
  lng: -118.2437,
  label: 'Los Angeles, CA',
}

/**
 * Dev-only: ensure each loaded board has you + partner pins so map distance is easy to test.
 * In-memory only — does not write partner rows to Supabase.
 */
export function withDevSampleLocations(boards: IdeaBoard[], userId: string): IdeaBoard[] {
  return boards.map((board) => {
    const members = board.members.map((member) => ({
      ...member,
      location:
        member.location ??
        (member.userId === userId ? SAMPLE_ME : SAMPLE_PARTNER),
    }))

    if (members.length === 1) {
      const me = members[0]!
      return {
        ...board,
        members: [
          { ...me, location: me.location ?? SAMPLE_ME },
          { userId: 'dev-partner', name: 'Alex', location: SAMPLE_PARTNER },
        ],
      }
    }

    return { ...board, members }
  })
}
