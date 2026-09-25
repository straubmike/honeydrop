# Deploy checklist (honeydrop.app)

1. Create a Supabase project.
2. Enable **Anonymous** auth (Authentication → Providers).
3. Run `supabase/migrations/001_init.sql` in the SQL editor.
4. Run `supabase/migrations/002_device_links.sql` (phone ↔ desktop “Use another device” codes).
5. Run `supabase/migrations/003_seat_recovery.sql` (partner “lost access” seat reclaim codes).
6. Run `supabase/migrations/004_device_link_session.sql` (device link keeps boards on **both** devices).
7. Deploy edge functions (**required after any `link-api` / `previewCore` change — frontend auto-deploy does not update edge**):

```bash
npx supabase login
npm run deploy:link-api   # runs sync-link-preview-core.mjs then deploys
npm run deploy:device-link
```

`link-api` must stay within Supabase edge isolate limits (~2s CPU / ~250MB). If live paste returns empty after a few seconds, check the function response for HTTP **546** `WORKER_RESOURCE_LIMIT` — that means the edge worker OOM’d/CPU-tripped (not a missing deploy). Redeploy after fixing; do not rely on VPS cron for edge.

Then push app code so the VPS rebuilds (or wait for the minute cron after push).

8. On the VPS build host, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
9. `npm ci && npm run build` and publish `dist/` to the honeydrop.app web root.
10. Configure SPA fallback so deep links work (`/join/...`, `/board/...`):

```nginx
try_files $uri $uri/ /index.html;
```

11. In Supabase Auth URL settings, allow `https://honeydrop.app`.
12. Dual-device smoke test: create → invite link → join → edit both sides → check You/Partner names and location pins.
13. Device-link smoke test: Show code on phone → Enter code on desktop → **both** devices still show the same boards.
14. Seat-recovery smoke test: wipe one partner’s site data → other opens Invite → Partner lost access → wiped partner joins with code.
15. PWA smoke test: see [`docs/PWA_TESTING.md`](../docs/PWA_TESTING.md).
