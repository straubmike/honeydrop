# Deploy checklist (honeydrop.app)

1. Create a Supabase project.
2. Enable **Anonymous** auth (Authentication → Providers).
3. Run `supabase/migrations/001_init.sql` in the SQL editor.
4. Run `supabase/migrations/002_device_links.sql` (phone ↔ desktop “Use another device” codes).
5. Deploy the edge function (needed for link previews on honeydrop.app):

```bash
npx supabase login
npm run deploy:link-api
```

Then push app code so the VPS rebuilds (or wait for the minute cron after push).

6. On the VPS build host, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. `npm ci && npm run build` and publish `dist/` to the honeydrop.app web root.
8. In Supabase Auth URL settings, allow `https://honeydrop.app`.
9. Dual-device smoke test: create → invite code → join → edit both sides → check You/Partner names and location pins.
10. Device-link smoke test: Show code on phone → Enter code on desktop → boards appear.
