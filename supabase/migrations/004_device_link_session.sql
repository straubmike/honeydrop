-- Device link now adopts the source session (via edge function) instead of
-- moving board_members to a new anonymous user. Keep the RPC as a hard stop so
-- old clients cannot strip boards off the original device.

create or replace function public.claim_device_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  raise exception 'USE_EDGE_FUNCTION'
    using hint = 'Device linking now uses the device-link edge function so both devices keep the same boards.';
end;
$$;

revoke all on function public.claim_device_link(text) from public;
grant execute on function public.claim_device_link(text) to authenticated;

-- Allow the service role (edge function) to update claim rows.
grant select, update on public.device_links to service_role;
