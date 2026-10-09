create function private.authorize_invited_signup() returns trigger language plpgsql set search_path = '' as $$
begin new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('inuvair_role','authorized'); return new; end;
$$;
revoke all on function private.authorize_invited_signup() from public, anon, authenticated;
create trigger authorize_invited_signup before insert on auth.users for each row execute function private.authorize_invited_signup();
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('inuvair_role','authorized');
create or replace function private.is_authorized_user() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=(select auth.uid()) and email_confirmed_at is not null and raw_app_meta_data->>'inuvair_role'='authorized');
$$;
create or replace function private.admin_list_users() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'role',case when u.email_confirmed_at is null then 'unverified' when exists(select 1 from private.allowed_owners a where lower(a.email)=lower(u.email)) then 'admin' else 'authorized' end,'deviceIds','[]'::jsonb) order by u.created_at desc),'[]'::jsonb) from auth.users u where u.email is not null);
end;
$$;
revoke execute on function public.admin_set_user_authorized(uuid,boolean) from authenticated;
revoke execute on function private.admin_set_user_authorized(uuid,boolean) from authenticated;


CREATE OR REPLACE FUNCTION private.admin_import_weekly_bookings(bookings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      where lower(u.email) = email_text and u.raw_app_meta_data->>'inuvair_role' = 'authorized' and u.email_confirmed_at is not null;
    if target_user is null then raise exception 'Account % must confirm their email before importing', email_text; end if;
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
$function$

