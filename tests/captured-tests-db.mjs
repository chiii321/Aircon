// Usage: node tests/captured-tests-db.mjs <directory with @electric-sql/pglite>
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require = createRequire(resolve(process.argv[2], 'package.json'))
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')
const db = new PGlite({ extensions: { btree_gist } })
const admin = '00000000-0000-0000-0000-000000000001'
const member = '00000000-0000-0000-0000-000000000002'
const outsider = '00000000-0000-0000-0000-000000000003'
const migrations = new URL('../supabase/migrations/', import.meta.url)
const migration = suffix => readFileSync(new URL(readdirSync(migrations).find(name => name.endsWith(suffix)), migrations), 'utf8')
const rows = async sql => (await db.query(sql)).rows
const asUser = id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`)
const queue = (action, id = '01', user = member) => `insert into public.device_commands(device_id, requested_by, action) values ('${id}', '${user}', '${action}') returning id`
const rejects = (sql, code) => assert.rejects(db.query(sql), error => error.code === code)
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_app_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
      ('${admin}','admin@example.test',now(),'{}'),
      ('${member}','member@example.test',now(),'{"inuvair_role":"authorized"}'),
      ('${outsider}','outsider@example.test',now(),'{"inuvair_role":"authorized"}');`)
  for (const suffix of ['_aircon_live_control_schema.sql', '_command_and_schedule_integrity.sql', '_admin_authorized_device_access.sql', '_private_admin_rpc_wrappers.sql', '_schedule_confirmation_workflow.sql', '_weekly_room_assignments.sql', '_excel_only_room_access.sql', '_device_sleep_reporting.sql']) {
    await db.exec(migration(suffix))
  }
  const currentApproval = migration('_remove_manual_approval.sql').match(/create or replace function private\.is_authorized_user\(\)[\s\S]*?\$\$;/)[0]
  await db.exec(currentApproval)
  await db.exec(migration('_captured_signal_tests.sql'))
  await db.exec(`insert into private.allowed_owners values ('admin@example.test');
    update public.devices set provisioned=true, last_seen_at=now();
    grant select, update on public.devices, public.device_commands to service_role;
    insert into public.weekly_room_assignments(user_id,user_email,room_number,device_id,weekday,start_time,end_time)
      values ('${member}','member@example.test','301','01',extract(isodow from now() at time zone 'Asia/Manila'),'00:00','23:59');`)
  await asUser(member)
  await rejects(queue('test_temp_down'), '23514') // No capable firmware.
  await db.exec(`reset role; update public.devices set capture_test_version=1;`)
  await asUser(member)
  for (const action of ['test_temp_down', 'test_temp_up', 'test_mode', 'test_powerful']) {
    const command = (await rows(queue(action)))[0]
    await db.exec('reset role; set role service_role;')
    assert.equal((await rows(`select public.acknowledge_device_command('02',${command.id},'sent_ir') as ok`))[0].ok, false)
    await db.exec(`update public.devices set last_ir_action='on',last_ir_at=now() where id='01';`)
    assert.equal((await rows(`select public.acknowledge_device_command('01',${command.id},'sent_ir') as ok`))[0].ok, true)
    assert.equal((await rows(`select last_ir_action from public.devices where id='01'`))[0].last_ir_action, null)
    const ack = (await rows(`select acknowledged_at from public.device_commands where id=${command.id}`))[0]
    assert.equal((await rows(`select public.acknowledge_device_command('01',${command.id},'sent_ir') as ok`))[0].ok, true)
    assert.deepEqual((await rows(`select acknowledged_at from public.device_commands where id=${command.id}`))[0], ack)
    await asUser(member)
  }
  await rejects(queue('on'), '42501') // Do not extend existing power permissions.
  await rejects(queue('test_mode', '02'), '23514') // RLS hides the other room from the readiness check.
  await rejects(queue('test_mode', '01', admin), '42501')
  await rejects(`update public.devices set capture_test_version=1 where id='01'`, '42501')
  await rejects(`select public.acknowledge_device_command('01',1,'sent_ir')`, '42501')
  await db.exec(`reset role; update public.devices set last_seen_at=now()-interval '31 seconds';`)
  await asUser(member)
  await rejects(queue('test_mode'), '23514')
  await db.exec(`reset role; update public.devices set last_seen_at=now(),sleep_until=now()+interval '1 minute';`)
  await asUser(member)
  await rejects(queue('test_mode'), '23514')
  await db.exec(`reset role; update public.devices set sleep_until=null;`)
  await asUser(outsider)
  await rejects(queue('test_mode','01',outsider), '23514')
  await db.exec(`reset role; update public.weekly_room_assignments set weekday=case when weekday=7 then 1 else weekday+1 end;`)
  await asUser(member)
  await rejects(queue('test_mode'), '23514') // Expired assignment hides the room from the readiness check.
  await asUser(admin)
  const power = (await rows(queue('off', '01', admin)))[0]
  await db.exec('reset role; set role service_role;')
  assert.equal((await rows(`select public.acknowledge_device_command('01',${power.id},'sent_ir') as ok`))[0].ok, true)
  assert.equal((await rows(`select last_ir_action from public.devices where id='01'`))[0].last_ir_action, 'off')
  await db.exec('reset role; set role anon;')
  await rejects(queue('test_mode'), '42501')
  console.log('PASS: capture actions, current-room RLS, capability/offline/sleep gating, acknowledgement isolation/idempotency and unchanged power permissions.')
} finally { await db.close() }
