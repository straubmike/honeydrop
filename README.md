# Idea Board (Honey Drop)

Shared couple boards backed by Supabase. Invite codes join a partner across devices; each person sees their own name and location pin.

## Setup

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Anonymous** sign-ins.
3. Run the SQL in [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) (SQL editor or CLI).
4. Deploy the link preview edge function:

```bash
supabase functions deploy link-api
```

5. Copy [`.env.example`](.env.example) to `.env.local` and set:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

6. Install and run:

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Production (honeydrop.app)

Build with the same `VITE_SUPABASE_*` env vars on the host, then serve `dist/`:

```bash
npm run build
```

Confirm the Supabase project **Site URL** / redirect allow-list includes `https://honeydrop.app`.

Smoke test: Device A creates a board → copies invite code → Device B joins → both edit and see updates; each has an editable “You” name and read-only partner name; honey-dipper pins reflect each member’s location.

## Features

- **Calendar** — events with titles, descriptions, date ranges, all-day or timed hours, and optional yearly/monthly repeat.
- **Ideas** — the same collections without dates.
- Inside a collection, drag the handle to place a card anywhere on the board. One entry can hold several photos, GIFs, or clips. Links pull one or two photos from the page automatically.
