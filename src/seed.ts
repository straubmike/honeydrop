import { toISODate, uid } from './dates'
import type { AppState, Collection, IdeaBoard, Item } from './types'

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function daysFromNow(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function seedInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function item(
  partial: Omit<Item, 'id' | 'reactions' | 'replies'> & Partial<Pick<Item, 'reactions' | 'replies'>>,
): Item {
  return {
    id: uid(),
    reactions: [],
    replies: [],
    ...partial,
  }
}

/**
 * Local demo board when Supabase env vars are missing.
 * Used by `loadApp()` on first open (empty localStorage).
 */
export function seedState(): AppState {
  const userId = uid()
  const partnerId = uid()
  const now = new Date().toISOString()

  const birthday: Collection = {
    id: uid(),
    kind: 'calendar',
    title: "Alex's birthday",
    description: 'Gift notes, cake ideas, and the soft plan for the day.',
    createdAt: ago(60 * 24 * 12),
    updatedAt: ago(40),
    schedule: {
      startDate: daysFromNow(9),
      endDate: daysFromNow(9),
      allDay: true,
      recurrence: 'yearly',
    },
    items: [
      item({
        type: 'text',
        author: 'You',
        authorUserId: userId,
        createdAt: ago(60 * 24 * 4),
        content:
          'They mentioned wanting a ceramic table lamp — linen shade, not the harsh overhead kind.',
        reactions: [{ emoji: '💡', authorIds: [partnerId] }],
        x: 40,
        y: 48,
        z: 1,
      }),
      item({
        type: 'link',
        author: 'Alex',
        authorUserId: partnerId,
        createdAt: ago(60 * 12),
        content: 'https://www.food52.com',
        caption: 'Cake inspiration if we bake instead of ordering',
        x: 320,
        y: 64,
        z: 2,
      }),
      item({
        type: 'text',
        author: 'You',
        authorUserId: userId,
        createdAt: ago(40),
        content: 'I can pick up flowers Saturday morning if you handle the cake.',
        replies: [
          {
            id: uid(),
            author: 'Alex',
            authorUserId: partnerId,
            text: 'Deal. I’ll call the bakery tomorrow.',
            createdAt: ago(25),
          },
        ],
        x: 88,
        y: 280,
        z: 3,
      }),
    ],
  }

  const gifts: Collection = {
    id: uid(),
    kind: 'idea',
    title: 'Gift ideas',
    description: 'Running list for birthdays, holidays, and “just because.”',
    createdAt: ago(60 * 24 * 16),
    updatedAt: ago(15),
    items: [
      item({
        type: 'text',
        author: 'Alex',
        authorUserId: partnerId,
        createdAt: ago(60 * 24 * 6),
        content: 'Cast iron skillet. The old one is warped and they complain every Sunday.',
        reactions: [{ emoji: '👍', authorIds: [userId] }],
        x: 48,
        y: 52,
        z: 1,
      }),
      item({
        type: 'link',
        author: 'You',
        authorUserId: userId,
        createdAt: ago(60 * 6),
        content: 'https://www.thisiscolossal.com',
        caption: 'Print from a shop we’d both hang',
        x: 310,
        y: 70,
        z: 2,
      }),
      item({
        type: 'text',
        author: 'Alex',
        authorUserId: partnerId,
        createdAt: ago(15),
        content: 'What if we skip stuff and book that fishing charter instead?',
        replies: [
          {
            id: uid(),
            author: 'You',
            authorUserId: userId,
            text: 'They would lose their mind. I’m in.',
            createdAt: ago(8),
          },
        ],
        x: 100,
        y: 300,
        z: 3,
      }),
    ],
  }

  const picnic: Collection = {
    id: uid(),
    kind: 'calendar',
    title: 'Picnic',
    description: 'Blanket, snacks, and a soft afternoon outside.',
    createdAt: ago(60 * 24 * 3),
    updatedAt: ago(60 * 2),
    schedule: {
      startDate: daysFromNow(0),
      endDate: daysFromNow(0),
      allDay: true,
      recurrence: 'none',
    },
    location: {
      lat: 47.6615,
      lng: -122.4057,
      label: 'Discovery Park, Seattle, Washington, United States',
    },
    items: [
      item({
        type: 'text',
        author: 'Alex',
        authorUserId: partnerId,
        createdAt: ago(60 * 5),
        content: 'I’ll bring the thermos and the plaid blanket. You grab fruit?',
        x: 52,
        y: 56,
        z: 1,
      }),
    ],
  }

  return {
    userId,
    displayName: 'You',
    boards: [
      {
        id: uid(),
        title: 'Home base',
        createdAt: ago(60 * 24 * 12),
        updatedAt: now,
        inviteCode: seedInviteCode(),
        members: [
          {
            userId,
            name: 'You',
            location: {
              lat: 37.7749,
              lng: -122.4194,
              label: 'San Francisco, CA',
            },
          },
          {
            userId: partnerId,
            name: 'Alex',
            location: {
              lat: 45.5152,
              lng: -122.6784,
              label: 'Portland, Multnomah County, Oregon, United States',
            },
          },
        ],
        collections: [birthday, picnic, gifts],
      },
    ],
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
        member.location ?? (member.userId === userId ? SAMPLE_ME : SAMPLE_PARTNER),
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
