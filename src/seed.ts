import { uid } from './dates'
import type { AppState } from './types'

/** Empty starting state — demo boards are disabled for cloud-backed production. */
export function seedState(): AppState {
  return {
    userId: uid(),
    displayName: 'You',
    boards: [],
  }
}
