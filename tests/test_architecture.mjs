// Usage: node tests/test_architecture.mjs <directory with @electric-sql/pglite installed>
// Runs real Postgres constraints and RLS in an isolated in-memory database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(resolve(process.argv[2], 'package.json'))
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')
const db = new PGlite({ extensions: { btree_gist } })
const owner = '00000000-0000-0000-0000-000000000001'
const outsider = '00000000-0000-0000-0000-000000000002'
let checks = 0
const check = (value, expected) => { assert.deepEqual(value, expected); checks++ }
async function rejects(sql, code) {
  await assert.rejects(db.exec(sql), error => error.code === code)
  checks++
}
const rows = async sql => (await db.query(sql)).rows
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${owner}', 'owner@example.test', now()), ('${outsider}', 'outsider@example.test', now());
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20260925094453_aircon_live_control_schema.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20260926042142_command_and_schedule_integrity.sql', import.meta.url), 'utf8'))
  await db.exec(`update public.devices set owner_id = '${owner}', provisioned = true;
    grant select, update on public.device_commands, public.devices to service_role;`)
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';
    insert into public.device_commands(device_id, requested_by, action, requested_at, expires_at)
      values ('01', '${owner}', 'on', '2099-01-01', '2100-01-01');`)
  const command = (await rows('select * from public.device_commands'))[0]
  check(Date.parse(command.expires_at) - Date.parse(command.requested_at), 60000)
  check(Date.parse(command.requested_at) < Date.parse('2099-01-01'), true)
  await rejects(`select public.acknowledge_device_command('01', ${command.id}, 'sent_ir')`, '42501')
  await db.exec('reset role; set role service_role;')
  check((await rows(`select public.acknowledge_device_command('02', ${command.id}, 'sent_ir') as accepted`))[0].accepted, false)
  check((await rows(`select public.acknowledge_device_command('01', ${command.id}, 'sent_ir') as accepted`))[0].accepted, true)
  const first = (await rows(`select acknowledged_at from public.device_commands where id = ${command.id}`))[0]
  check((await rows(`select public.acknowledge_device_command('01', ${command.id}, 'sent_ir') as accepted`))[0].accepted, true)
  check((await rows(`select acknowledged_at from public.device_commands where id = ${command.id}`))[0], first)
  check((await rows("select last_ir_action from public.devices where id='01'"))[0].last_ir_action, 'on')
  check((await rows(`select public.acknowledge_device_command('01', ${command.id}, 'failed') as accepted`))[0].accepted, false)
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${outsider}';`)
  check((await rows('select * from public.device_commands')).length, 0)
  await rejects(`insert into public.device_schedules(device_id, owner_id, on_time, off_time) values ('01', '${outsider}', '07:00', '09:00')`, '42501')
  await db.exec(`set request.jwt.claim.sub = '${owner}';`)
  const window = (on, off, device = '01') => `insert into public.device_schedules(device_id, owner_id, on_time, off_time) values ('${device}', '${owner}', '${on}', '${off}')`
  await db.exec(window('07:00', '09:00'))
  await rejects(window('08:00', '10:00'), '23P01')
  await rejects(window('09:00', '10:00'), '23P01')
  await rejects(window('10:00:30', '11:00'), '23514')
  await rejects(window('23:00', '24:00'), '23514')
  await rejects(window('11:00', '10:00'), '23514')
  await db.exec(window('09:01', '10:00'))
  for (let hour = 0; hour < 12; hour++) {
    const h = String(hour).padStart(2, '0')
    await db.exec(window(`${h}:00`, `${h}:30`, '02'))
  }
  await rejects(window('12:00', '12:30', '02'), '23514')
  // A failure updating devices must roll back the command acknowledgement too.
  await db.exec(`insert into public.device_commands(device_id, requested_by, action) values ('01', '${owner}', 'off'); reset role;
    create function public.reject_device_update() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
    create trigger reject_device_update before update on public.devices for each row execute function public.reject_device_update();
    set role service_role;`)
  const pending = (await rows("select id from public.device_commands where status='queued'"))[0]
  await rejects(`select public.acknowledge_device_command('01', ${pending.id}, 'sent_ir')`, 'P0001')
  check((await rows(`select status from public.device_commands where id=${pending.id}`))[0].status, 'queued')
  // Simulate reconnection after expiry. Expiry is not an IR acknowledgement.
  await db.exec(`update public.device_commands set expires_at = now() - interval '1 second' where id=${pending.id};
    update public.device_commands set status='failed', error_message='Command expired before delivery'
      where device_id='01' and status='queued' and expires_at <= now();`)
  check((await rows(`select status, acknowledged_at from public.device_commands where id=${pending.id}`))[0], { status: 'failed', acknowledged_at: null })
  check((await rows("select id from public.device_commands where device_id='01' and status='queued' and expires_at > now()" )).length, 0)
  check((await rows(`select public.acknowledge_device_command('01', ${pending.id}, 'sent_ir') as accepted`))[0].accepted, false)
  console.log(`Passed ${checks} architecture checks (Postgres constraints, RLS, deadlines, scoped/repeated acknowledgement and transaction rollback).`)
} finally { await db.close() }
