create schema if not exists private;

create table public.devices (
  id text primary key check (id ~ '^[0-9]{2}$'),
  name text not null,
  model text,
  owner_id uuid references auth.users(id) on delete set null,
  provisioned boolean not null default false,
  last_seen_at timestamptz,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  last_ir_action text check (last_ir_action in ('on', 'off')),
  last_ir_at timestamptz
);

create table public.device_commands (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('on', 'off')),
  status text not null default 'queued' check (status in ('queued', 'sent_ir', 'failed')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  error_message text
);
create index device_commands_pending_idx on public.device_commands(device_id, id) where status = 'queued';
create index device_commands_recent_idx on public.device_commands(device_id, id desc);

create table public.device_schedules (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  on_time time not null,
  off_time time not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check (on_time < off_time)
);
create index device_schedules_device_idx on public.device_schedules(device_id);

create table public.device_tokens (
  device_id text primary key references public.devices(id) on delete cascade,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$')
);

create table private.allowed_owners (
  email text primary key
);

alter table public.devices enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_schedules enable row level security;
alter table public.device_tokens enable row level security;
alter table private.allowed_owners enable row level security;

create policy "owner reads devices" on public.devices for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner reads commands" on public.device_commands for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.owner_id = (select auth.uid())));
create policy "owner queues commands" on public.device_commands for insert to authenticated
  with check (requested_by = (select auth.uid()) and status = 'queued' and acknowledged_at is null
    and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = (select auth.uid()) and d.provisioned));
create policy "owner reads schedules" on public.device_schedules for select to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = (select auth.uid())));
create policy "owner creates schedules" on public.device_schedules for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = (select auth.uid())));
create policy "owner updates schedules" on public.device_schedules for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = (select auth.uid())));
create policy "owner deletes schedules" on public.device_schedules for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.devices to authenticated;
grant select, insert on public.device_commands to authenticated;
grant usage, select on sequence public.device_commands_id_seq to authenticated;
grant select, insert, update, delete on public.device_schedules to authenticated;
grant usage, select on sequence public.device_schedules_id_seq to authenticated;
revoke all on public.device_tokens from anon, authenticated;
revoke all on private.allowed_owners from anon, authenticated;
grant select on public.device_tokens to service_role;

insert into public.devices(id, name, model)
select lpad(n::text, 2, '0'), 'ESP32 ' || lpad(n::text, 2, '0'),
  case when n = 1 then 'ESP32-WROOM-32 · AUX prototype' else null end
from generate_series(1, 11) n;

create function private.assign_aircon_owner() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and exists (
    select 1 from private.allowed_owners where email = lower(new.email)
  ) then
    update public.devices set owner_id = new.id where owner_id is null;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_aircon_owner() from public, anon, authenticated;
create trigger assign_aircon_owner_after_auth
after insert or update of email_confirmed_at on auth.users
for each row execute function private.assign_aircon_owner();

update public.devices d set owner_id = u.id
from auth.users u join private.allowed_owners a on a.email = lower(u.email)
where u.email_confirmed_at is not null and d.owner_id is null;
