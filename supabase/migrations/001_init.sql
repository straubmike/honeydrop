-- Honey Drop: boards, members, profiles, storage, join/create RPCs
-- Apply in Supabase SQL editor (or via supabase db push).
-- Dashboard: Authentication → Providers → enable Anonymous sign-ins.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'You',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup (including anonymous)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'You'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Ours',
  invite_code text not null,
  collections jsonb not null default '[]'::jsonb,
  pending_deletion jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boards_invite_code_unique unique (invite_code)
);

create index if not exists boards_invite_code_idx on public.boards (invite_code);

alter table public.boards enable row level security;

-- ---------------------------------------------------------------------------
-- board_members
-- ---------------------------------------------------------------------------
create table if not exists public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'You',
  location jsonb,
  primary key (board_id, user_id)
);

create index if not exists board_members_user_id_idx on public.board_members (user_id);

alter table public.board_members enable row level security;

create or replace function public.is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.board_members
    where board_id = p_board_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.enforce_board_member_limit()
returns trigger
language plpgsql
as $$
declare
  member_count int;
begin
  select count(*) into member_count
  from public.board_members
  where board_id = new.board_id;

  if member_count >= 2 then
    raise exception 'BOARD_FULL';
  end if;
  return new;
end;
$$;

drop trigger if exists board_members_limit on public.board_members;
create trigger board_members_limit
  before insert on public.board_members
  for each row execute function public.enforce_board_member_limit();

-- Board RLS (membership-gated)
create policy "boards_select_member"
  on public.boards for select
  using (public.is_board_member(id));

create policy "boards_update_member"
  on public.boards for update
  using (public.is_board_member(id))
  with check (public.is_board_member(id));

create policy "boards_delete_member"
  on public.boards for delete
  using (public.is_board_member(id));

-- Members can see co-members on shared boards
create policy "board_members_select"
  on public.board_members for select
  using (public.is_board_member(board_id));

create policy "board_members_update_own"
  on public.board_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "board_members_delete_own"
  on public.board_members for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs: create_board / join_board
-- ---------------------------------------------------------------------------
create or replace function public.create_board(
  p_title text,
  p_invite_code text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := upper(trim(p_invite_code));
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_code is null or length(v_code) < 4 then
    raise exception 'INVALID_CODE';
  end if;

  insert into public.boards (title, invite_code)
  values (coalesce(nullif(trim(p_title), ''), 'Ours'), v_code)
  returning id into v_id;

  insert into public.board_members (board_id, user_id, name)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'You'));

  return v_id;
end;
$$;

create or replace function public.join_board(
  p_code text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id into v_board_id
  from public.boards
  where invite_code = upper(trim(p_code));

  if v_board_id is null then
    raise exception 'NOT_FOUND';
  end if;

  if exists (
    select 1 from public.board_members
    where board_id = v_board_id and user_id = auth.uid()
  ) then
    return v_board_id;
  end if;

  select count(*) into v_count
  from public.board_members
  where board_id = v_board_id;

  if v_count >= 2 then
    raise exception 'BOARD_FULL';
  end if;

  insert into public.board_members (board_id, user_id, name)
  values (v_board_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'You'));

  return v_board_id;
end;
$$;

revoke all on function public.create_board(text, text, text) from public;
revoke all on function public.join_board(text, text) from public;
grant execute on function public.create_board(text, text, text) to authenticated;
grant execute on function public.join_board(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: board-media (private; members only via RLS)
-- Path: {boardId}/{attachmentId}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('board-media', 'board-media', false)
on conflict (id) do update set public = excluded.public;

create or replace function public.storage_board_id(object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create policy "board_media_select_member"
  on storage.objects for select
  using (
    bucket_id = 'board-media'
    and public.is_board_member(public.storage_board_id(name))
  );

create policy "board_media_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'board-media'
    and public.is_board_member(public.storage_board_id(name))
  );

create policy "board_media_update_member"
  on storage.objects for update
  using (
    bucket_id = 'board-media'
    and public.is_board_member(public.storage_board_id(name))
  )
  with check (
    bucket_id = 'board-media'
    and public.is_board_member(public.storage_board_id(name))
  );

create policy "board_media_delete_member"
  on storage.objects for delete
  using (
    bucket_id = 'board-media'
    and public.is_board_member(public.storage_board_id(name))
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter table public.boards replica identity full;
alter table public.board_members replica identity full;

alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.board_members;
