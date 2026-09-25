import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function sameHash(a: string, b: string) {
  if (a.length !== 64 || b.length !== 64) return false
  let difference = 0
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply({ error: 'POST required' }, 405)
  const deviceId = request.headers.get('x-device-id') ?? ''
  const token = request.headers.get('x-device-token') ?? ''
  if (!/^\d{2}$/.test(deviceId) || !/^[0-9a-f]{64}$/.test(token)) return reply({ error: 'Unauthorized' }, 401)

  const { data: credential, error: credentialError } = await db.from('device_tokens')
    .select('token_sha256').eq('device_id', deviceId).maybeSingle()
  if (credentialError) return reply({ error: 'Credential lookup failed' }, 500)
  if (!credential || !sameHash(credential.token_sha256, await sha256(token))) return reply({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return reply({ error: 'Invalid JSON' }, 400) }
  if (body.type === 'poll') {
    const temperature = body.temperature_c
    const humidity = body.humidity_pct
    const readingsValid = (temperature === null || (typeof temperature === 'number' && temperature >= -40 && temperature <= 80))
      && (humidity === null || (typeof humidity === 'number' && humidity >= 0 && humidity <= 100))
    if (!readingsValid) return reply({ error: 'Invalid sensor values' }, 400)
    const { error: heartbeatError } = await db.from('devices').update({
      last_seen_at: new Date().toISOString(),
      temperature_c: temperature,
      humidity_pct: humidity,
    }).eq('id', deviceId)
    if (heartbeatError) return reply({ error: 'Heartbeat failed' }, 500)
    const [{ data: commands, error: commandsError }, { data: schedules, error: schedulesError }] = await Promise.all([
      db.from('device_commands').select('id,action').eq('device_id', deviceId).eq('status', 'queued').order('id').limit(1),
      db.from('device_schedules').select('id,on_time,off_time,enabled').eq('device_id', deviceId).eq('enabled', true).order('on_time'),
    ])
    if (commandsError || schedulesError) return reply({ error: 'Sync failed' }, 500)
    return reply({ command: commands?.[0] ?? null, schedules: schedules ?? [], server_time: new Date().toISOString() })
  }
  if (body.type === 'ack') {
    const id = body.command_id
    const status = body.status
    if (!Number.isSafeInteger(id) || (status !== 'sent_ir' && status !== 'failed')) return reply({ error: 'Invalid acknowledgement' }, 400)
    const { data, error } = await db.from('device_commands').update({
      status, acknowledged_at: new Date().toISOString(),
      error_message: status === 'failed' ? 'Device could not send IR' : null,
    }).eq('id', id).eq('device_id', deviceId).eq('status', 'queued').select('id').maybeSingle()
    if (error) return reply({ error: 'Acknowledgement failed' }, 500)
    if (data && status === 'sent_ir') {
      const { data: command } = await db.from('device_commands').select('action').eq('id', id).single()
      if (command) await db.from('devices').update({ last_ir_action: command.action, last_ir_at: new Date().toISOString() }).eq('id', deviceId)
    }
    return reply({ acknowledged: Boolean(data) })
  }
  if (body.type === 'schedule_event') {
    if (body.action !== 'on' && body.action !== 'off') return reply({ error: 'Invalid action' }, 400)
    const { error } = await db.from('devices').update({ last_ir_action: body.action, last_ir_at: new Date().toISOString() }).eq('id', deviceId)
    if (error) return reply({ error: 'Event update failed' }, 500)
    return reply({ recorded: true })
  }
  return reply({ error: 'Unknown request type' }, 400)
})
