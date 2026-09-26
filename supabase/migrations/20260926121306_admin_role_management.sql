-- Serialize role changes so concurrent demotions cannot remove every admin.
create or replace function private.admin_set_user_role(target_user_id uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_email text;
  confirmed_at timestamptz;
begin
  lock table private.allowed_owners in exclusive mode;
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'authorized') then
    raise exception 'Invalid role';
  end if;
  select email, email_confirmed_at into target_email, confirmed_at
    from auth.users where id = target_user_id for update;
  if target_email is null or confirmed_at is null then
    raise exception 'A confirmed email account is required';
  end if;
  if new_role = 'admin' then
    if not exists (select 1 from auth.users where id = target_user_id
      and raw_app_meta_data ->> 'inuvair_role' = 'authorized') then
      raise exception 'Approve this user before promoting them';
    end if;
    insert into private.allowed_owners(email) values (lower(target_email)) on conflict do nothing;
  else
    if exists (select 1 from private.allowed_owners where lower(email) = lower(target_email))
      and not exists (select 1 from auth.users u join private.allowed_owners a
        on lower(a.email) = lower(u.email)
        where u.email_confirmed_at is not null and u.id <> target_user_id) then
      raise exception 'The last admin cannot be demoted';
    end if;
    delete from private.allowed_owners where lower(email) = lower(target_email);
  end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"inuvair_role":"authorized"}'::jsonb where id = target_user_id;
end;
$$;

create or replace function private.admin_list_users()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'email', u.email,
    'role', case when u.email_confirmed_at is not null and exists (
      select 1 from private.allowed_owners a where lower(a.email) = lower(u.email)
    ) then 'admin' when u.raw_app_meta_data ->> 'inuvair_role' = 'authorized'
      then 'authorized' else 'pending' end,
    'deviceIds', coalesce((select jsonb_agg(d.id order by d.id)
      from public.devices d where d.owner_id = u.id), '[]'::jsonb)
  ) order by u.created_at desc), '[]'::jsonb) from auth.users u where u.email is not null);
end;
$$;

create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_user_role(target_user_id, new_role); $$;
revoke all on function private.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function private.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
