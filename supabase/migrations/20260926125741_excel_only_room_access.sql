-- Only verified weekly bookings grant authorized users room access.
create or replace function private.can_access_device(p_device_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_authorized_user() and exists (
    select 1 from public.weekly_room_assignments w where w.user_id = auth.uid()
      and w.device_id = p_device_id
      and w.weekday = extract(isodow from now() at time zone 'Asia/Manila')
      and (now() at time zone 'Asia/Manila')::time >= w.start_time
      and (now() at time zone 'Asia/Manila')::time < w.end_time
  ));
$$;

create or replace function private.get_my_access_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare resolved_role text; visible_devices jsonb; expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  resolved_role := case when private.is_admin() then 'admin' when private.is_authorized_user() then 'authorized' else 'pending' end;
  select coalesce(jsonb_agg(d.id order by d.id), '[]'::jsonb) into visible_devices
    from public.devices d where private.can_access_device(d.id);
  if resolved_role = 'authorized' then
    select min(((now() at time zone 'Asia/Manila')::date + w.end_time) at time zone 'Asia/Manila') into expiry
    from public.weekly_room_assignments w where w.user_id = auth.uid()
      and w.weekday = extract(isodow from now() at time zone 'Asia/Manila')
      and (now() at time zone 'Asia/Manila')::time >= w.start_time
      and (now() at time zone 'Asia/Manila')::time < w.end_time;
  end if;
  return jsonb_build_object('role',resolved_role,'deviceIds',visible_devices,'accessMode','weekly',
    'expiresAt',expiry,'serverTime',now());
end;
$$;
