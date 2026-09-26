create table public.account_deletion_notices (
  user_id uuid primary key,
  email text not null,
  deleted_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.account_deletion_notices enable row level security;
revoke all on public.account_deletion_notices from anon, authenticated;
grant select, update on public.account_deletion_notices to service_role;

create function private.on_account_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  lock table private.allowed_owners in exclusive mode;
  if exists (select 1 from private.allowed_owners where lower(email) = lower(old.email))
    and not exists (select 1 from auth.users u join private.allowed_owners a on lower(u.email) = lower(a.email)
      where u.id <> old.id and u.email_confirmed_at is not null) then
    raise exception 'Promote another approved user to admin before deleting the last admin account';
  end if;
  delete from private.allowed_owners where lower(email) = lower(old.email);
  if old.email is not null then
    insert into public.account_deletion_notices(user_id, email) values (old.id, old.email);
  end if;
  return old;
end;
$$;
revoke all on function private.on_account_deleted() from public, anon, authenticated;
create trigger inuvair_account_deleted before delete on auth.users
  for each row execute function private.on_account_deleted();
