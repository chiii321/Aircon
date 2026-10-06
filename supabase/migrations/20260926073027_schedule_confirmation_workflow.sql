-- A cancelled class is a durable per-controller schedule hold. A fresh
-- explicit confirmation is required to resume local schedule execution.
alter table public.devices
  add column if not exists schedule_hold boolean not null default false;

create or replace function private.respond_to_schedule_confirmation(p_device_id text, p_continue boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_authorized_user() then
    raise exception 'Authorized user access required' using errcode = '42501';
  end if;

  update public.devices d
    set schedule_hold = not p_continue
    where d.id = p_device_id and d.owner_id = (select auth.uid());

  if not found then
    raise exception 'Assigned device not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.respond_to_schedule_confirmation(text, boolean) from public, anon;
grant execute on function private.respond_to_schedule_confirmation(text, boolean) to authenticated;

create or replace function public.respond_to_schedule_confirmation(p_device_id text, p_continue boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.respond_to_schedule_confirmation(p_device_id, p_continue); $$;

revoke all on function public.respond_to_schedule_confirmation(text, boolean) from public, anon;
grant execute on function public.respond_to_schedule_confirmation(text, boolean) to authenticated;
