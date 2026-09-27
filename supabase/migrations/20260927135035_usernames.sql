create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,30}$'),
  unique (username)
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy "Read own profile" on public.user_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own profile" on public.user_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own profile" on public.user_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create function private.register_username() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles(user_id, username) values (new.id, lower(trim(new.raw_user_meta_data->>'username')));
  return new;
end;
$$;
revoke all on function private.register_username() from public, anon, authenticated;
create trigger register_username after insert on auth.users for each row execute function private.register_username();
create table private.username_login_limits (bucket text primary key, window_start timestamptz not null, attempts integer not null);
revoke all on private.username_login_limits from public, anon, authenticated;
create function public.username_login_email(login_username text, ip_hash text) returns text language plpgsql security definer set search_path = '' as $$
declare n integer; target_email text; key text;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  foreach key in array array['user:' || lower(login_username), 'ip:' || ip_hash] loop
    insert into private.username_login_limits as limits(bucket, window_start, attempts) values (key, now(), 1)
    on conflict (bucket) do update set
      attempts = case when limits.window_start < now() - interval '5 minutes' then 1 else limits.attempts + 1 end,
      window_start = case when limits.window_start < now() - interval '5 minutes' then now() else limits.window_start end
    returning attempts into n;
    if n > (case when key like 'ip:%' then 50 else 10 end) then return null; end if;
  end loop;
  select u.email into target_email from public.user_profiles p join auth.users u on u.id = p.user_id where p.username = lower(login_username);
  return target_email;
end;
$$;
revoke all on function public.username_login_email(text,text) from public, anon, authenticated;
grant execute on function public.username_login_email(text,text) to service_role;
create function public.username_available(candidate text) returns boolean language sql stable security definer set search_path = '' as $$
  select lower(trim(candidate)) ~ '^[a-z0-9_]{3,30}$' and not exists (select 1 from public.user_profiles where username = lower(trim(candidate)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
