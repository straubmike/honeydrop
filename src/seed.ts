import { uid } from './dates'
import type { AppState, Collection, Item } from './types'

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function seedInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function item(partial: Omit<Item, 'id' | 'reactions' | 'replies'> & Partial<Pick<Item, 'reactions' | 'replies'>>): Item {
  return {
    id: uid(),
    reactions: [],
    replies: [],
    ...partial,
  }
}

export function seedState(): AppState {
  const userId = uid()
  const partnerId = uid()
  const now = new Date().toISOString()

  const birthday: Collection = {
    id: uid(),
    kind: 'calendar',
    title: "Maya's birthday",
    description: 'Keep gift notes, bakery orders, and the guest list in one place.',
    createdAt: ago(60 * 24 * 12),
    updatedAt: ago(40),
    schedule: {
      startDate: '2026-09-14',
      endDate: '2026-09-14',
      allDay: true,
      recurrence: 'yearly',
    },
    items: [
      item({
        type: 'text',
        author: 'Alex',
        createdAt: ago(60 * 24 * 4),
        content: 'She mentioned wanting a ceramic table lamp — the kind with a linen shade.',
        reactions: [{ emoji: '💡', authors: ['You'] }],
      }),
      item({
        type: 'link',
        author: 'You',
        createdAt: ago(60 * 12),
        content: 'https://www.food52.com',
        caption: 'Possible cake inspiration',
      }),
      item({
        type: 'text',
        author: 'You',
        createdAt: ago(40),
        content: 'I can pick up flowers Saturday morning if someone else handles the cake.',
        replies: [
          {
            id: uid(),
            author: 'Alex',
            text: 'Deal. I’ll call the bakery tomorrow.',
            createdAt: ago(25),
          },
        ],
      }),
    ],
  }

  const trip: Collection = {
    id: uid(),
    kind: 'calendar',
    title: 'Outer Banks weekend',
    description: 'House is booked. Dump packing lists, tide times, and dinner ideas here.',
    createdAt: ago(60 * 24 * 8),
    updatedAt: ago(90),
    schedule: {
      startDate: '2026-09-18',
      endDate: '2026-09-22',
      allDay: true,
      recurrence: 'none',
    },
    items: [
      item({
        type: 'text',
        author: 'Sam',
        createdAt: ago(60 * 8),
        content: 'Check-in is 4pm. There’s a grill — I’ll bring charcoal.',
        reactions: [{ emoji: '🔥', authors: ['You', 'Alex'] }],
      }),
      item({
        type: 'link',
        author: 'You',
        createdAt: ago(90),
        content: 'https://www.nps.gov/caha/index.htm',
        caption: 'Cape Hatteras — worth a morning if the weather holds',
      }),
    ],
  }

  const anniversary: Collection = {
    id: uid(),
    kind: 'calendar',
    title: 'Anniversary dinner',
    description: 'Reservation is at that little place on Grove. Dress nice-ish.',
    createdAt: ago(60 * 24 * 20),
    updatedAt: ago(60 * 24 * 2),
    schedule: {
      startDate: '2026-10-03',
      endDate: '2026-10-03',
      allDay: false,
      startTime: '18:30',
      endTime: '21:00',
      recurrence: 'yearly',
    },
    items: [
      item({
        type: 'text',
        author: 'You',
        createdAt: ago(60 * 24 * 2),
        content: 'I already ordered the flowers. Need a backup restaurant if Grove is slammed.',
      }),
    ],
  }

  const gifts: Collection = {
    id: uid(),
    kind: 'idea',
    title: 'Gift ideas for Dad',
    description: 'He says he doesn’t want anything. He is lying.',
    createdAt: ago(60 * 24 * 16),
    updatedAt: ago(15),
    items: [
      item({
        type: 'text',
        author: 'Alex',
        createdAt: ago(60 * 24 * 6),
        content: 'Cast iron skillet. The old one is warped and he complains every Sunday.',
        reactions: [{ emoji: '👍', authors: ['You'] }],
      }),
      item({
        type: 'link',
        author: 'You',
        createdAt: ago(60 * 6),
        content: 'https://www.thisiscolossal.com',
        caption: 'Print from a shop he actually likes',
      }),
      item({
        type: 'text',
        author: 'Sam',
        createdAt: ago(15),
        content: 'What if we skip stuff and book that fishing charter instead?',
        replies: [
          {
            id: uid(),
            author: 'You',
            text: 'He would lose his mind. I’m in.',
            createdAt: ago(8),
          },
        ],
      }),
    ],
  }

  const house: Collection = {
    id: uid(),
    kind: 'idea',
    title: 'Apartment tweaks',
    description: 'Slow list of things that would make the place feel finished.',
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 24),
    items: [
      item({
        type: 'text',
        author: 'You',
        createdAt: ago(60 * 24 * 5),
        content: 'A floor lamp for the reading chair. The overhead light is a crime.',
      }),
      item({
        type: 'text',
        author: 'Maya',
        createdAt: ago(60 * 24),
        content: 'And a proper doormat. The current one looks like it survived a shipwreck.',
        reactions: [{ emoji: '😂', authors: ['You', 'Alex'] }],
      }),
    ],
  }

  return {
    userId,
    displayName: 'You',
    boards: [
      {
        id: uid(),
        title: 'Ours',
        createdAt: ago(60 * 24 * 12),
        updatedAt: now,
        inviteCode: seedInviteCode(),
        members: [
          { userId, name: 'You' },
          { userId: partnerId, name: 'Alex' },
        ],
        collections: [birthday, trip, anniversary, gifts, house],
      },
    ],
  }
}
