import { toISODate, uid } from './dates'
import type { AppState, Collection, Item } from './types'

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

/** Demo board shown the first time someone opens Honey Drop (empty localStorage). */
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
        createdAt: ago(60 * 24 * 4),
        content: 'They mentioned wanting a ceramic table lamp — linen shade, not the harsh overhead kind.',
        reactions: [{ emoji: '💡', authors: ['Alex'] }],
        x: 40,
        y: 48,
        z: 1,
      }),
      item({
        type: 'link',
        author: 'Alex',
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
        createdAt: ago(40),
        content: 'I can pick up flowers Saturday morning if you handle the cake.',
        replies: [
          {
            id: uid(),
            author: 'Alex',
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

  const trip: Collection = {
    id: uid(),
    kind: 'calendar',
    title: 'Weekend away',
    description: 'House is booked. Packing lists, tide times, and dinner ideas live here.',
    createdAt: ago(60 * 24 * 8),
    updatedAt: ago(90),
    schedule: {
      startDate: daysFromNow(14),
      endDate: daysFromNow(17),
      allDay: true,
      recurrence: 'none',
    },
    items: [
      item({
        type: 'text',
        author: 'Alex',
        createdAt: ago(60 * 8),
        content: 'Check-in is 4pm. There’s a grill — I’ll bring charcoal.',
        reactions: [{ emoji: '🔥', authors: ['You'] }],
        x: 56,
        y: 56,
        z: 1,
      }),
      item({
        type: 'link',
        author: 'You',
        createdAt: ago(90),
        content: 'https://www.nps.gov/caha/index.htm',
        caption: 'Cape Hatteras — worth a morning if the weather holds',
        x: 300,
        y: 120,
        z: 2,
      }),
    ],
  }

  const anniversary: Collection = {
    id: uid(),
    kind: 'calendar',
    title: 'Anniversary dinner',
    description: 'Reservation at that little place on Grove. Dress nice-ish.',
    createdAt: ago(60 * 24 * 20),
    updatedAt: ago(60 * 24 * 2),
    schedule: {
      startDate: daysFromNow(28),
      endDate: daysFromNow(28),
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
        content: 'Flowers are ordered. Need a backup restaurant if Grove is slammed.',
        x: 72,
        y: 80,
        z: 1,
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
        createdAt: ago(60 * 5),
        content: 'I’ll bring the thermos and the plaid blanket. You grab fruit?',
        x: 52,
        y: 56,
        z: 1,
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
        createdAt: ago(60 * 24 * 6),
        content: 'Cast iron skillet. The old one is warped and they complain every Sunday.',
        reactions: [{ emoji: '👍', authors: ['You'] }],
        x: 48,
        y: 52,
        z: 1,
      }),
      item({
        type: 'link',
        author: 'You',
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
        createdAt: ago(15),
        content: 'What if we skip stuff and book that fishing charter instead?',
        replies: [
          {
            id: uid(),
            author: 'You',
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

  const nest: Collection = {
    id: uid(),
    kind: 'idea',
    title: 'Nesting list',
    description: 'Slow list of things that would make home feel finished.',
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 24),
    items: [
      item({
        type: 'text',
        author: 'You',
        createdAt: ago(60 * 24 * 5),
        content: 'A floor lamp for the reading chair. The overhead light is a crime.',
        x: 60,
        y: 60,
        z: 1,
      }),
      item({
        type: 'text',
        author: 'Alex',
        createdAt: ago(60 * 24),
        content: 'And a proper doormat. The current one looks like it survived a shipwreck.',
        reactions: [{ emoji: '😂', authors: ['You'] }],
        x: 290,
        y: 140,
        z: 2,
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
          { userId, name: 'You' },
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
        collections: [birthday, trip, anniversary, picnic, gifts, nest],
      },
    ],
  }
}
