-- Anonymous account signup telemetry for the private dashboard.
-- Clients may INSERT their own row once; dashboard reads via service role.
-- user_id is intentionally NOT a FK to auth.users so weekly cleanups that
-- delete board-less anonymous users leave telemetry intact. Cleanups may set
-- deleted_at instead of removing the row.

create table if not exists public.account_signups (
  user_id uuid primary key,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  user_agent text,
  device_type text,
  browser text,
  os text,
  is_standalone boolean,
  referrer text,
  is_tester boolean not null default false
);

alter table public.account_signups enable row level security;

-- Clients: insert own row only. No SELECT / UPDATE / DELETE policies
-- so anon + authenticated cannot read or mutate existing rows.
create policy "account_signups_insert_own"
  on public.account_signups for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on public.account_signups from anon, authenticated;
grant insert on public.account_signups to authenticated;
grant all on public.account_signups to service_role;
