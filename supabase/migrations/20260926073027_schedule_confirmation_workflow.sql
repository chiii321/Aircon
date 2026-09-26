-- A cancelled class is a durable per-controller schedule hold. A fresh
-- explicit confirmation is required to resume local schedule execution.
alter table public.devices
  add column if not exists schedule_hold boolean not null default false;

create table public.device_temperature_readings (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(id) on delete cascade,
  temperature_c numeric(5,2) not null check (temperature_c between -40 and 80),
  recorded_at timestamptz not null default now()
);
create index device_temperature_readings_device_time_idx
  on public.device_temperature_readings (device_id, recorded_at desc);
alter table public.device_temperature_readings enable row level security;
create policy "Assigned users read temperature history"
  on public.device_temperature_readings for select to authenticated
  using (exists (
    select 1 from public.devices d
    where d.id = device_id and private.can_access_device(d.id)
  ));
grant select on public.device_temperature_readings to authenticated;
grant all on public.device_temperature_readings to service_role;

create table public.class_checkins (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(id) on delete cascade,
  detected_at timestamptz not null default now(),
  temperature_min_c numeric(5,2) not null,
  temperature_max_c numeric(5,2) not null,
  status text not null default 'pending' check (status in ('pending', 'continued', 'stopped')),
  responded_at timestamptz
);
create index class_checkins_device_pending_idx on public.class_checkins (device_id, detected_at desc)
  where status = 'pending';
alter table public.class_checkins enable row level security;
create policy "Assigned users read class check-ins"
  on public.class_checkins for select to authenticated
  using (exists (
    select 1 from public.devices d
    where d.id = device_id and private.can_access_device(d.id)
  ));
grant select on public.class_checkins to authenticated;
grant all on public.class_checkins to service_role;

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

  update public.class_checkins
    set status = case when p_continue then 'continued' else 'stopped' end,
        responded_at = now()
    where device_id = p_device_id and status = 'pending';
end;
$$;

revoke all on function private.respond_to_schedule_confirmation(text, boolean) from public, anon;
grant execute on function private.respond_to_schedule_confirmation(text, boolean) to authenticated;

create or replace function public.respond_to_schedule_confirmation(p_device_id text, p_continue boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.respond_to_schedule_confirmation(p_device_id, p_continue); $$;

revoke all on function public.respond_to_schedule_confirmation(text, boolean) from public, anon;
grant execute on function public.respond_to_schedule_confirmation(text, boolean) to authenticated;
