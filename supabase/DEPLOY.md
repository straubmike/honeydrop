# Deploy checklist (honeydrop.app)

1. Create a Supabase project.
2. Enable **Anonymous** auth (Authentication → Providers).
3. Run `supabase/migrations/001_init.sql` in the SQL editor.
4. Deploy the edge function: `supabase functions deploy link-api`
5. On the VPS build host, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. `npm ci && npm run build` and publish `dist/` to the honeydrop.app web root.
7. In Supabase Auth URL settings, allow `https://honeydrop.app`.
8. Dual-device smoke test: create → invite code → join → edit both sides → check You/Partner names and location pins.
