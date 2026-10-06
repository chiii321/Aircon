-- Apply before deploying the gateway and website; upload test firmware last.
alter table public.devices add column capture_test_version smallint
  check (capture_test_version = 1);

alter table public.device_commands drop constraint device_commands_action_check;
alter table public.device_commands add constraint device_commands_action_check
  check (action in ('on', 'off', 'test_temp_down', 'test_temp_up', 'test_mode', 'test_powerful'));

-- Existing power-command permissions remain unchanged. Authorized room users
-- may test captures only while private.can_access_device grants current access.
create policy "assigned users queue capture tests" on public.device_commands
  for insert to authenticated
  with check (
    action in ('test_temp_down', 'test_temp_up', 'test_mode', 'test_powerful')
    and (select private.can_access_device(device_id))
    and requested_by = (select auth.uid())
    and status = 'queued' and acknowledged_at is null
    and error_message is null
    and exists (select 1 from public.devices d where d.id = device_id and d.provisioned)
  );

create or replace function private.set_command_deadline() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.requested_at := clock_timestamp();
  new.expires_at := new.requested_at + interval '60 seconds';
  if new.action in ('test_temp_down', 'test_temp_up', 'test_mode', 'test_powerful') then
    if not exists (select 1 from public.devices d where d.id = new.device_id
      and d.provisioned and d.capture_test_version = 1
      and d.last_seen_at > new.requested_at - interval '30 seconds'
      and d.sleep_until is null) then
      raise exception 'Online capture-test firmware required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.acknowledge_device_command(p_device_id text, p_command_id bigint, p_status text)
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
  if command.status <> 'queued' then return command.status = p_status and command.acknowledged_at is not null; end if;
  update public.device_commands set status = p_status, acknowledged_at = accepted_at,
    error_message = case when p_status = 'failed' then 'Device could not send IR' else null end
    where id = p_command_id;
  if p_status = 'sent_ir' then
    -- A captured test may contain power/mode settings we have not identified.
    -- Invalidate the old estimate instead of inferring power or a Celsius target.
    update public.devices set
      last_ir_action = case when command.action in ('on', 'off') then command.action else null end,
      last_ir_at = accepted_at
      where id = p_device_id;
  end if;
  return true;
end;
$$;
revoke all on function public.acknowledge_device_command(text, bigint, text) from public, anon, authenticated;
grant execute on function public.acknowledge_device_command(text, bigint, text) to service_role;
