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

export async function handleDeviceSync(request: Request) {
  if (request.method !== 'POST') return reply({ error: 'POST required' }, 405)
  const deviceId = request.headers.get('x-device-id') ?? ''
  const token = request.headers.get('x-device-token') ?? ''
  if (!/^\d{2}$/.test(deviceId) || !/^[0-9a-f]{64}$/.test(token)) return reply({ error: 'Unauthorized' }, 401)

  const { data: credential, error: credentialError } = await db.from('device_tokens')
    .select('token_sha256').eq('device_id', deviceId).maybeSingle()
  if (credentialError) return reply({ error: 'Credential lookup failed' }, 500)
  if (!credential || !sameHash(credential.token_sha256, await sha256(token))) return reply({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply({ error: 'JSON object required' }, 400)
    body = parsed
  } catch { return reply({ error: 'Invalid JSON' }, 400) }
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
    const now = new Date().toISOString()
    const { error: expiryError } = await db.from('device_commands').update({
      status: 'failed', error_message: 'Command expired before delivery',
    }).eq('device_id', deviceId).eq('status', 'queued').lte('expires_at', now)
    if (expiryError) return reply({ error: 'Command expiry failed' }, 500)
    const [{ data: commands, error: commandsError }, { data: device, error: deviceError }, { data: schedules, error: schedulesError }] = await Promise.all([
      db.from('device_commands').select('id,action,expires_at').eq('device_id', deviceId).eq('status', 'queued').gt('expires_at', now).order('id').limit(1),
      db.from('devices').select('schedule_hold').eq('id', deviceId).single(),
      db.from('device_schedules').select('id,on_time,off_time,enabled').eq('device_id', deviceId).eq('enabled', true).order('on_time'),
    ])
    if (commandsError || deviceError || schedulesError) return reply({ error: 'Sync failed' }, 500)
    const command = commands?.[0]
    return reply({ command: command ? { ...command, expires_at_epoch: Math.floor(Date.parse(command.expires_at) / 1000) } : null, schedules: schedules ?? [], schedule_hold: device.schedule_hold, server_time: new Date().toISOString() })
  }
  if (body.type === 'ack') {
    const id = body.command_id
    const status = body.status
    if (!Number.isSafeInteger(id) || Number(id) <= 0 || (status !== 'sent_ir' && status !== 'failed')) return reply({ error: 'Invalid acknowledgement' }, 400)
    const { data, error } = await db.rpc('acknowledge_device_command', {
      p_device_id: deviceId, p_command_id: id, p_status: status,
    })
    if (error) return reply({ error: 'Acknowledgement failed' }, 500)
    return reply({ acknowledged: Boolean(data) })
  }
  if (body.type === 'schedule_event') {
    if (body.action !== 'on' && body.action !== 'off') return reply({ error: 'Invalid action' }, 400)
    const { error } = await db.from('devices').update({ last_ir_action: body.action, last_ir_at: new Date().toISOString() }).eq('id', deviceId)
    if (error) return reply({ error: 'Event update failed' }, 500)
    return reply({ recorded: true })
  }
  return reply({ error: 'Unknown request type' }, 400)
}
