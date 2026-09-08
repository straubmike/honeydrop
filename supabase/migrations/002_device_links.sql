-- Device link codes: carry anonymous session boards from phone ↔ desktop.

create table if not exists public.device_links (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);

create index if not exists device_links_user_id_idx on public.device_links (user_id);

alter table public.device_links enable row level security;

-- No direct client access; only via RPCs
revoke all on public.device_links from anon, authenticated;
grant select, insert, update, delete on public.device_links to postgres;

create or replace function public.create_device_link()
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_try int := 0;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Drop unused links from this user
  delete from public.device_links
  where user_id = auth.uid()
    and claimed_at is null;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.device_links (code, user_id, expires_at)
      values (v_code, auth.uid(), now() + interval '15 minutes');
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 12 then
        raise exception 'CODE_GEN_FAILED';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.claim_device_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text := upper(trim(p_code));
  v_from uuid;
  v_to uuid := auth.uid();
  v_row public.device_links%rowtype;
  v_member record;
  v_board public.boards%rowtype;
  v_name text;
begin
  if v_to is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_code is null or length(v_code) < 4 then
    raise exception 'INVALID_CODE';
  end if;

  select * into v_row
  from public.device_links
  where code = v_code
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_row.claimed_at is not null then
    raise exception 'ALREADY_USED';
  end if;
  if v_row.expires_at < now() then
    raise exception 'EXPIRED';
  end if;

  v_from := v_row.user_id;
  if v_from = v_to then
    update public.device_links
    set claimed_at = now(), claimed_by = v_to
    where code = v_code;
    return jsonb_build_object('from_user_id', v_from, 'to_user_id', v_to, 'boards', 0);
  end if;

  select display_name into v_name
  from public.profiles
  where id = v_from;

  for v_member in
    select * from public.board_members where user_id = v_from
  loop
    if exists (
      select 1 from public.board_members
      where board_id = v_member.board_id and user_id = v_to
    ) then
      -- Already on this board on the new device: drop the old membership
      delete from public.board_members
      where board_id = v_member.board_id and user_id = v_from;
    else
      update public.board_members
      set user_id = v_to,
          name = coalesce(nullif(trim(v_member.name), ''), coalesce(v_name, 'You')),
          location = v_member.location
      where board_id = v_member.board_id and user_id = v_from;
    end if;

    -- Fix pending deletion requester id when needed
    select * into v_board from public.boards where id = v_member.board_id;
    if v_board.pending_deletion is not null
       and (v_board.pending_deletion->>'requestedBy') = v_from::text then
      update public.boards
      set pending_deletion = jsonb_set(
            v_board.pending_deletion,
            '{requestedBy}',
            to_jsonb(v_to::text),
            true
          ),
          updated_at = now()
      where id = v_member.board_id;
    end if;
  end loop;

  -- Prefer the source device display name when the new device is still default
  if v_name is not null and length(trim(v_name)) > 0 then
    update public.profiles
    set display_name = v_name
    where id = v_to
      and (display_name is null or trim(display_name) in ('', 'You'));
  end if;

  update public.device_links
  set claimed_at = now(), claimed_by = v_to
  where code = v_code;

  return jsonb_build_object(
    'from_user_id', v_from,
    'to_user_id', v_to,
    'boards', (
      select count(*)::int from public.board_members where user_id = v_to
    )
  );
end;
$$;

revoke all on function public.create_device_link() from public;
revoke all on function public.claim_device_link(text) from public;
grant execute on function public.create_device_link() to authenticated;
grant execute on function public.claim_device_link(text) to authenticated;
