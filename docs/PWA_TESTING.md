# Honey Drop PWA — internal testing

Installable Progressive Web App (Android/Oppo first). No App Store / Play Store accounts required.

## Before you test

1. Deploy the latest frontend build to an **HTTPS** host (required for install + service worker).
2. In Supabase SQL editor, run migrations in order if not already applied:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_device_links.sql`
   - `supabase/migrations/003_seat_recovery.sql` ← **required for partner seat recovery**
3. Confirm the host serves the SPA for deep links (all paths → `index.html`):
   - nginx: `try_files $uri $uri/ /index.html;`
   - Netlify-style: `public/_redirects` is included in `dist/`
4. Supabase Auth site URL allow-list includes `https://honeydrop.app` (and any staging origin).

## Install (Android / Oppo)

1. Open Chrome (or the Chromium browser) on the phone.
2. Go to `https://honeydrop.app` (or your staging URL).
3. Use **Install app** / **Add to Home screen** from the browser menu, or tap **Install** if the in-app tip appears.
4. Launch from the home-screen icon — it should open **without** a browser address bar.

## Install (iPhone)

1. Open Safari (not Chrome).
2. Share → **Add to Home Screen**.
3. Open from the icon (standalone; install UX is more limited than Android).

## Checklist

- [ ] Install from home screen; opens standalone
- [ ] Create a board; invite partner via **Share link** (`/join/CODE`)
- [ ] Partner opens link → joins board
- [ ] Add a photo / note; both sides see updates while online
- [ ] Airplane mode → open installed app → edit a note → reconnect → partner sees it
- [ ] Sync banner shows Offline / Syncing as expected
- [ ] **Seat recovery:** Partner A clears site data (or uses a fresh browser profile). Partner B opens ✉ → **Partner lost access?** → sends code/link. Partner A joins with that code and is back on the board
- [ ] Device link still works when you still have an old device (“Use another device”)

## Notes

- Offline sync flushes when the app is open and the network returns. Do not expect reliable background sync with the app fully closed (especially on iOS).
- First-time invite codes and recovery codes both use **Join with code** / `/join/...`.
- Social embeds (Instagram, etc.) are not part of this PWA release.
