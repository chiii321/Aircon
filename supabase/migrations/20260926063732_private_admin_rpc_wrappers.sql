-- Keep elevated database work outside PostgREST's exposed public schema.

create or replace function private.get_my_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_role text;
  visible_devices jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if private.is_admin() then
    resolved_role := 'admin';
  elsif private.is_authorized_user() then
    resolved_role := 'authorized';
  else
    resolved_role := 'pending';
  end if;

  select coalesce(jsonb_agg(d.id order by d.id), '[]'::jsonb)
    into visible_devices
    from public.devices d
    where resolved_role = 'admin'
       or (resolved_role = 'authorized' and d.owner_id = (select auth.uid()));

  return jsonb_build_object('role', resolved_role, 'deviceIds', visible_devices);
end;
$$;

create or replace function private.admin_list_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  users_json jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'role', case when u.raw_app_meta_data ->> 'inuvair_role' = 'authorized' then 'authorized' else 'pending' end,
      'deviceIds', coalesce((
        select jsonb_agg(d.id order by d.id)
        from public.devices d where d.owner_id = u.id
      ), '[]'::jsonb)
    ) order by u.created_at desc
  ), '[]'::jsonb)
  into users_json
  from auth.users u
  where u.email is not null
    and not exists (
      select 1 from private.allowed_owners a where lower(a.email) = lower(u.email)
    );

  return users_json;
end;
$$;

create or replace function private.admin_set_user_authorized(target_user_id uuid, approved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select u.email into target_email from auth.users u where u.id = target_user_id;
  if target_email is null then
    raise exception 'User account not found';
  end if;
  if exists (select 1 from private.allowed_owners a where lower(a.email) = lower(target_email)) then
    raise exception 'Admin accounts cannot be changed here';
  end if;

  if approved then
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"inuvair_role":"authorized"}'::jsonb
      where id = target_user_id;
  else
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'inuvair_role'
      where id = target_user_id;
    update public.devices set owner_id = null where owner_id = target_user_id;
  end if;
end;
$$;

create or replace function private.admin_set_user_devices(target_user_id uuid, device_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = target_user_id and u.raw_app_meta_data ->> 'inuvair_role' = 'authorized'
  ) then
    raise exception 'Approve this user before assigning devices';
  end if;
  if exists (
    select 1 from unnest(coalesce(device_ids, array[]::text[])) requested(id)
    where not exists (select 1 from public.devices d where d.id = requested.id)
  ) then
    raise exception 'One or more devices do not exist';
  end if;

  update public.devices d set owner_id = null
    where d.owner_id = target_user_id
      and not (d.id = any(coalesce(device_ids, array[]::text[])));
  update public.devices d set owner_id = target_user_id
    where d.id = any(coalesce(device_ids, array[]::text[]));
end;
$$;

revoke all on function private.get_my_access_context() from public, anon;
revoke all on function private.admin_list_users() from public, anon;
revoke all on function private.admin_set_user_authorized(uuid, boolean) from public, anon;
revoke all on function private.admin_set_user_devices(uuid, text[]) from public, anon;
grant execute on function private.get_my_access_context() to authenticated;
grant execute on function private.admin_list_users() to authenticated;
grant execute on function private.admin_set_user_authorized(uuid, boolean) to authenticated;
grant execute on function private.admin_set_user_devices(uuid, text[]) to authenticated;

create or replace function public.get_my_access_context()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_my_access_context(); $$;
create or replace function public.admin_list_users()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_list_users(); $$;
create or replace function public.admin_set_user_authorized(target_user_id uuid, approved boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_user_authorized(target_user_id, approved); $$;
create or replace function public.admin_set_user_devices(target_user_id uuid, device_ids text[])
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_user_devices(target_user_id, device_ids); $$;

revoke all on function public.get_my_access_context() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_authorized(uuid, boolean) from public, anon;
revoke all on function public.admin_set_user_devices(uuid, text[]) from public, anon;
grant execute on function public.get_my_access_context() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_authorized(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_devices(uuid, text[]) to authenticated;
