-- Seat recovery: partner who still has access mints a code that reassigns the other seat.

create table if not exists public.seat_recoveries (
  code text primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  replace_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);

create index if not exists seat_recoveries_board_id_idx on public.seat_recoveries (board_id);

alter table public.seat_recoveries enable row level security;

revoke all on public.seat_recoveries from anon, authenticated;
grant select, insert, update, delete on public.seat_recoveries to postgres;

create or replace function public.create_seat_recovery(p_board_id uuid)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_try int := 0;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.board_members
    where board_id = p_board_id and user_id = v_me
  ) then
    raise exception 'NOT_MEMBER';
  end if;

  select user_id into v_other
  from public.board_members
  where board_id = p_board_id and user_id <> v_me
  limit 1;

  if v_other is null then
    raise exception 'NO_PARTNER';
  end if;

  delete from public.seat_recoveries
  where board_id = p_board_id
    and created_by = v_me
    and claimed_at is null;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.seat_recoveries (
        code, board_id, created_by, replace_user_id, expires_at
      )
      values (
        v_code, p_board_id, v_me, v_other, now() + interval '60 minutes'
      );
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

create or replace function public.claim_seat_recovery(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text := upper(trim(p_code));
  v_to uuid := auth.uid();
  v_row public.seat_recoveries%rowtype;
  v_name text := coalesce(nullif(trim(p_name), ''), 'You');
begin
  if v_to is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_code is null or length(v_code) < 4 then
    raise exception 'INVALID_CODE';
  end if;

  select * into v_row
  from public.seat_recoveries
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

  if v_row.created_by = v_to then
    raise exception 'OWN_CODE';
  end if;

  if exists (
    select 1 from public.board_members
    where board_id = v_row.board_id and user_id = v_to
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  if not exists (
    select 1 from public.board_members
    where board_id = v_row.board_id and user_id = v_row.replace_user_id
  ) then
    raise exception 'SEAT_GONE';
  end if;

  update public.board_members
  set user_id = v_to,
      name = v_name
  where board_id = v_row.board_id
    and user_id = v_row.replace_user_id;

  update public.profiles
  set display_name = v_name
  where id = v_to
    and (display_name is null or trim(display_name) in ('', 'You'));

  update public.seat_recoveries
  set claimed_at = now(), claimed_by = v_to
  where code = v_code;

  return jsonb_build_object(
    'board_id', v_row.board_id,
    'from_user_id', v_row.replace_user_id,
    'to_user_id', v_to
  );
end;
$$;

revoke all on function public.create_seat_recovery(uuid) from public;
revoke all on function public.claim_seat_recovery(text, text) from public;
grant execute on function public.create_seat_recovery(uuid) to authenticated;
grant execute on function public.claim_seat_recovery(text, text) to authenticated;
