alter table public.user_profiles add column first_name text check (length(trim(first_name)) between 1 and 80), add column last_name text check (length(trim(last_name)) between 1 and 80);
revoke insert, update on public.user_profiles from authenticated;
grant insert(user_id,first_name,last_name), update(first_name,last_name) on public.user_profiles to authenticated;
create policy "Admins read profile names" on public.user_profiles for select to authenticated using ((select private.is_admin()));
create function private.generate_profile_username() returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; suffix integer := 0;
begin
  new.first_name := trim(new.first_name); new.last_name := trim(new.last_name);
  if new.first_name is null or new.last_name is null or length(new.first_name) not between 1 and 80 or length(new.last_name) not between 1 and 80 then raise exception 'First and last name are required'; end if;
  if tg_op = 'UPDATE' then
    if old.first_name is not null then new.username := old.username; return new; end if;
  end if;
  base := left(regexp_replace(lower(translate(new.last_name, 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]', '', 'g'), 24)
       || left(regexp_replace(lower(translate(new.first_name, 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]', '', 'g'), 1);
  if length(base) < 3 then base := 'user' || base; end if;
  perform pg_advisory_xact_lock(hashtextextended('inuvair-username:' || base,0));
  candidate := base;
  while exists(select 1 from public.user_profiles where username=candidate and user_id<>new.user_id) loop
    suffix := suffix + 1; candidate := base || suffix::text;
  end loop;
  new.username := candidate;
  return new;
end;
$$;
revoke all on function private.generate_profile_username() from public, anon, authenticated;
create trigger generate_profile_username before insert or update on public.user_profiles for each row execute function private.generate_profile_username();
create or replace function private.register_username() returns trigger language plpgsql security definer set search_path = '' as $$
declare generated text;
begin
  insert into public.user_profiles(user_id, first_name, last_name) values (new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name') returning username into generated;
  update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('username',generated) where id=new.id;
  return new;
end;
$$;
