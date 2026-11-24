-- Welcome-screen code pre-check (anon-readable status only) + seat-recovery name preserve.

-- ---------------------------------------------------------------------------
-- lookup_join_code: validate invite / recovery / device-link without exposing
-- board IDs, titles, or member names. Callable by anon + authenticated so
-- unrecognized devices can check a code before creating an account.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text := upper(trim(p_code));
  v_board_id uuid;
  v_member_count int;
  v_recovery public.seat_recoveries%rowtype;
  v_link public.device_links%rowtype;
begin
  if v_code is null or length(v_code) < 4 then
    return jsonb_build_object('kind', null, 'status', 'not_found');
  end if;

  -- Board invite codes first (same order as client joinBoard).
  select id into v_board_id
  from public.boards
  where invite_code = v_code;

  if v_board_id is not null then
    select count(*) into v_member_count
    from public.board_members
    where board_id = v_board_id;

    if v_member_count >= 2 then
      return jsonb_build_object('kind', 'invite', 'status', 'board_full');
    end if;

    return jsonb_build_object('kind', 'invite', 'status', 'valid');
  end if;

  -- Seat recovery
  select * into v_recovery
  from public.seat_recoveries
  where code = v_code;

  if found then
    if v_recovery.claimed_at is not null then
      return jsonb_build_object('kind', 'recovery', 'status', 'already_used');
    end if;
    if v_recovery.expires_at < now() then
      return jsonb_build_object('kind', 'recovery', 'status', 'expired');
    end if;
    if not exists (
      select 1 from public.board_members
      where board_id = v_recovery.board_id and user_id = v_recovery.replace_user_id
    ) then
      return jsonb_build_object('kind', 'recovery', 'status', 'seat_gone');
    end if;
    return jsonb_build_object('kind', 'recovery', 'status', 'valid');
  end if;

  -- Device link
  select * into v_link
  from public.device_links
  where code = v_code;

  if found then
    if v_link.claimed_at is not null then
      return jsonb_build_object('kind', 'device_link', 'status', 'already_used');
    end if;
    if v_link.expires_at < now() then
      return jsonb_build_object('kind', 'device_link', 'status', 'expired');
    end if;
    return jsonb_build_object('kind', 'device_link', 'status', 'valid');
  end if;

  return jsonb_build_object('kind', null, 'status', 'not_found');
end;
$$;

revoke all on function public.lookup_join_code(text) from public;
grant execute on function public.lookup_join_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- claim_seat_recovery: blank / 'You' p_name preserves the replaced seat's name
-- on board_members and copies it to the claimer's profiles.display_name.
-- ---------------------------------------------------------------------------
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
  v_incoming text := nullif(trim(p_name), '');
  v_existing_name text;
  v_name text;
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

  select name into v_existing_name
  from public.board_members
  where board_id = v_row.board_id and user_id = v_row.replace_user_id;

  if not found then
    raise exception 'SEAT_GONE';
  end if;

  -- Blank or literal "You" must keep the replaced seat's display name.
  if v_incoming is null or lower(v_incoming) = 'you' then
    v_name := coalesce(nullif(trim(v_existing_name), ''), 'You');
  else
    v_name := v_incoming;
  end if;

  update public.board_members
  set user_id = v_to,
      name = v_name
  where board_id = v_row.board_id
    and user_id = v_row.replace_user_id;

  update public.profiles
  set display_name = v_name
  where id = v_to;

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

revoke all on function public.claim_seat_recovery(text, text) from public;
grant execute on function public.claim_seat_recovery(text, text) to authenticated;
