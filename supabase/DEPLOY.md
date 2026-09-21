# Deploy checklist (honeydrop.app)

1. Create a Supabase project.
2. Enable **Anonymous** auth (Authentication → Providers).
3. Run `supabase/migrations/001_init.sql` in the SQL editor.
4. Run `supabase/migrations/002_device_links.sql` (phone ↔ desktop “Use another device” codes).
5. Run `supabase/migrations/003_seat_recovery.sql` (partner “lost access” seat reclaim codes).
6. Deploy the edge function (needed for link previews on honeydrop.app):

```bash
npx supabase login
npm run deploy:link-api
```

Then push app code so the VPS rebuilds (or wait for the minute cron after push).

7. On the VPS build host, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
8. `npm ci && npm run build` and publish `dist/` to the honeydrop.app web root.
9. Configure SPA fallback so deep links work (`/join/...`, `/board/...`):

```nginx
try_files $uri $uri/ /index.html;
```

10. In Supabase Auth URL settings, allow `https://honeydrop.app`.
11. Dual-device smoke test: create → invite link → join → edit both sides → check You/Partner names and location pins.
12. Device-link smoke test: Show code on phone → Enter code on desktop → boards appear.
13. Seat-recovery smoke test: wipe one partner’s site data → other opens Invite → Partner lost access → wiped partner joins with code.
14. PWA smoke test: see [`docs/PWA_TESTING.md`](../docs/PWA_TESTING.md).
