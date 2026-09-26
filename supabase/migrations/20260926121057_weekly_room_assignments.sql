-- Weekly class access is separate from the controller's daily AC timer.
create table public.weekly_room_assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  room_number text not null check (room_number ~ '^[0-9]{1,6}$'),
  device_id text not null references public.devices(id),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  notes text not null default '' check (length(notes) <= 200),
  check (start_time < end_time),
  check (extract(second from start_time) = 0 and extract(second from end_time) = 0),
  unique (user_id, device_id, weekday, start_time, end_time)
);
create index weekly_room_assignments_user_day_idx on public.weekly_room_assignments(user_id, weekday);
create index weekly_room_assignments_device_day_idx on public.weekly_room_assignments(device_id, weekday);
alter table public.weekly_room_assignments enable row level security;
revoke all on public.weekly_room_assignments from public, anon, authenticated;
revoke all on sequence public.weekly_room_assignments_id_seq from public, anon, authenticated;
create policy "Admins read weekly bookings" on public.weekly_room_assignments
  for select to authenticated using ((select private.is_admin()));
grant select on public.weekly_room_assignments to authenticated;
grant all on public.weekly_room_assignments to service_role;
grant usage, select on sequence public.weekly_room_assignments_id_seq to service_role;

create function private.admin_import_weekly_bookings(bookings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  target_user uuid;
  email_text text;
  added integer := 0;
  inserted integer;
  total integer;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if jsonb_typeof(bookings) <> 'array' or bookings is null then
    raise exception 'Bookings must be an array';
  end if;
  total := jsonb_array_length(bookings);
  if total < 1 or total > 500 then raise exception 'Import 1–500 bookings at a time'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inuvair-weekly-bookings', 0));
  for item in select value from jsonb_array_elements(bookings) loop
    email_text := lower(trim(item->>'email'));
    select u.id into target_user from auth.users u
      where lower(u.email) = email_text and u.raw_app_meta_data->>'inuvair_role' = 'authorized';
    if target_user is null then raise exception 'Account % must be approved before importing', email_text; end if;
    if not exists (select 1 from public.devices where id = item->>'device_id') then
      raise exception 'Unknown controller for room %', item->>'room_number';
    end if;
    if coalesce(item->>'room_number', '') !~ '^[0-9]{1,6}$'
       or coalesce(item->>'weekday', '') !~ '^[1-7]$'
       or coalesce(item->>'start_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(item->>'end_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or item->>'start_time' >= item->>'end_time'
       or length(coalesce(item->>'notes', '')) > 200 then
      raise exception 'Invalid booking values for %', email_text;
    end if;
    if exists (select 1 from public.weekly_room_assignments w
      where (w.room_number = item->>'room_number' and w.device_id <> item->>'device_id')
         or (w.device_id = item->>'device_id' and w.room_number <> item->>'room_number')) then
      raise exception 'Room % conflicts with a saved room/controller mapping', item->>'room_number';
    end if;
    insert into public.weekly_room_assignments(user_id,user_email,room_number,device_id,weekday,start_time,end_time,notes)
      values (target_user,email_text,item->>'room_number',item->>'device_id',(item->>'weekday')::smallint,
        (item->>'start_time')::time,(item->>'end_time')::time,coalesce(item->>'notes',''))
      on conflict (user_id,device_id,weekday,start_time,end_time) do nothing;
    get diagnostics inserted = row_count;
    added := added + inserted;
  end loop;
  if exists (select 1 from public.weekly_room_assignments a join public.weekly_room_assignments b
    on a.id < b.id and a.weekday = b.weekday and a.start_time < b.end_time and b.start_time < a.end_time
    and (a.user_id = b.user_id or a.device_id = b.device_id)) then
    raise exception 'Overlapping bookings for a user or room. Remove conflicting saved bookings before importing.';
  end if;
  return jsonb_build_object('added', added, 'skipped', total - added);
end;
$$;
revoke all on function private.admin_import_weekly_bookings(jsonb) from public, anon;
grant execute on function private.admin_import_weekly_bookings(jsonb) to authenticated;
create function public.admin_import_weekly_bookings(bookings jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_import_weekly_bookings(bookings); $$;
revoke all on function public.admin_import_weekly_bookings(jsonb) from public, anon;
grant execute on function public.admin_import_weekly_bookings(jsonb) to authenticated;

create function private.admin_remove_weekly_booking(booking_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('inuvair-weekly-bookings', 0));
  delete from public.weekly_room_assignments where id = booking_id;
  if not found then raise exception 'Booking no longer exists'; end if;
end;
$$;
revoke all on function private.admin_remove_weekly_booking(bigint) from public, anon;
grant execute on function private.admin_remove_weekly_booking(bigint) to authenticated;
create function public.admin_remove_weekly_booking(booking_id bigint)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_remove_weekly_booking(booking_id); $$;
revoke all on function public.admin_remove_weekly_booking(bigint) from public, anon;
grant execute on function public.admin_remove_weekly_booking(bigint) to authenticated;

create or replace function private.can_access_device(p_device_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_authorized_user() and (
    exists (select 1 from public.weekly_room_assignments w where w.user_id = auth.uid()
      and w.device_id = p_device_id
      and w.weekday = extract(isodow from now() at time zone 'Asia/Manila')
      and (now() at time zone 'Asia/Manila')::time >= w.start_time
      and (now() at time zone 'Asia/Manila')::time < w.end_time)
    or (not exists (select 1 from public.weekly_room_assignments w where w.user_id = auth.uid())
      and exists (select 1 from public.devices d where d.id = p_device_id and d.owner_id = auth.uid()))
  ));
$$;

create or replace function private.get_my_access_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare resolved_role text; visible_devices jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  resolved_role := case when private.is_admin() then 'admin' when private.is_authorized_user() then 'authorized' else 'pending' end;
  select coalesce(jsonb_agg(d.id order by d.id), '[]'::jsonb) into visible_devices
    from public.devices d where private.can_access_device(d.id);
  return jsonb_build_object('role',resolved_role,'deviceIds',visible_devices,
    'accessMode', case when exists (select 1 from public.weekly_room_assignments where user_id = auth.uid()) then 'weekly' else 'manual' end);
end;
$$;

create or replace function private.respond_to_schedule_confirmation(p_device_id text,p_continue boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_authorized_user() or not private.can_access_device(p_device_id) then
    raise exception 'Current room assignment required' using errcode = '42501';
  end if;
  if p_continue is null then raise exception 'Choose Yes or No'; end if;
  update public.devices set schedule_hold = not p_continue where id = p_device_id;
  update public.class_checkins set status = case when p_continue then 'continued' else 'stopped' end,
    responded_at = now() where device_id = p_device_id and status = 'pending';
end;
$$;
