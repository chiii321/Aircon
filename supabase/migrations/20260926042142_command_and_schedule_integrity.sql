-- Apply before deploying the matching device-sync function.
-- Preserve the existing status vocabulary so older dashboards/firmware still work.
alter table public.device_commands add column expires_at timestamptz;
update public.device_commands set expires_at = requested_at + interval '60 seconds';
alter table public.device_commands alter column expires_at set not null;

create function private.set_command_deadline() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- A client cannot extend a manual command's lifetime or backdate it.
  new.requested_at := clock_timestamp();
  new.expires_at := new.requested_at + interval '60 seconds';
  return new;
end;
$$;
revoke all on function private.set_command_deadline() from public, anon, authenticated;
create trigger set_command_deadline before insert on public.device_commands
for each row execute function private.set_command_deadline();

-- One transaction records both the acknowledgement and the device's last IR report.
-- Only the authenticated device gateway (service_role) can call this RPC.
create function public.acknowledge_device_command(p_device_id text, p_command_id bigint, p_status text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  command public.device_commands%rowtype;
  accepted_at timestamptz := clock_timestamp();
begin
  if p_status is null or p_status not in ('sent_ir', 'failed') then
    raise exception 'Invalid acknowledgement status' using errcode = '22023';
  end if;
  select * into command from public.device_commands
    where id = p_command_id and device_id = p_device_id for update;
  if not found then return false; end if;
  -- An HTTP retry is successful without changing the original timestamp/state.
  if command.status <> 'queued' then return command.status = p_status and command.acknowledged_at is not null; end if;
  update public.device_commands set status = p_status, acknowledged_at = accepted_at,
    error_message = case when p_status = 'failed' then 'Device could not send IR' else null end
    where id = p_command_id;
  if p_status = 'sent_ir' then
    update public.devices set last_ir_action = command.action, last_ir_at = accepted_at
      where id = p_device_id;
  end if;
  return true;
end;
$$;
revoke all on function public.acknowledge_device_command(text, bigint, text) from public, anon, authenticated;
grant execute on function public.acknowledge_device_command(text, bigint, text) to service_role;

-- Closed ranges reject touching boundaries as well as overlaps, including
-- concurrent API writes. Convert time-of-day to seconds for an immutable range.
create extension if not exists btree_gist with schema extensions;
alter table public.device_schedules add constraint device_schedules_minute_precision
  check (extract(second from on_time) = 0 and extract(second from off_time) = 0
    and on_time >= time '00:00' and off_time < time '24:00');
alter table public.device_schedules add constraint device_schedules_no_overlap
  exclude using gist (device_id extensions.gist_text_ops with =,
    int4range(extract(epoch from on_time)::integer, extract(epoch from off_time)::integer, '[]') with &&)
  where (enabled);

create function private.limit_device_schedules() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize writers for this device before counting the firmware's cache slots.
  perform pg_advisory_xact_lock(hashtextextended('aircon-schedules:' || new.device_id, 0));
  if (select count(*) from public.device_schedules where device_id = new.device_id and id <> new.id) >= 12 then
    raise exception 'Maximum 12 windows per device' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.limit_device_schedules() from public, anon, authenticated;
create trigger limit_device_schedules before insert or update on public.device_schedules
for each row execute function private.limit_device_schedules();
