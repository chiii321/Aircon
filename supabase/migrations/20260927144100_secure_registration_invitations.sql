create table public.registration_invitations (
  token_hash text primary key,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '48 hours',
  used_at timestamptz
);
alter table public.registration_invitations enable row level security;
revoke all on public.registration_invitations from public, anon, authenticated;
grant select, insert, update on public.registration_invitations to service_role;
create function public.validate_registration_invitation(invited_email text, invitation_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select length(invitation_token)=64 and exists (
    select 1 from public.registration_invitations
    where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex')
      and email=lower(trim(invited_email)) and expires_at>now() and used_at is null
  );
$$;
revoke all on function public.validate_registration_invitation(text,text) from public;
grant execute on function public.validate_registration_invitation(text,text) to anon, authenticated;
create function private.require_registration_invitation() returns trigger language plpgsql security definer set search_path = '' as $$
declare claimed text; token text := new.raw_user_meta_data->>'invitation_token';
begin
  if token is null or length(token)<>64 then raise exception 'A valid invitation is required' using errcode='42501'; end if;
  update public.registration_invitations set used_at=now()
  where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex')
    and email=lower(trim(new.email)) and expires_at>now() and used_at is null
  returning token_hash into claimed;
  if claimed is null then raise exception 'Invitation is invalid, expired or already used' using errcode='42501'; end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'invitation_token';
  return new;
end;
$$;
revoke all on function private.require_registration_invitation() from public, anon, authenticated;
create trigger require_registration_invitation before insert on auth.users for each row execute function private.require_registration_invitation();
