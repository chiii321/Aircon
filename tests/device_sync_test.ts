// deno test --allow-env tests/device_sync_test.ts
Deno.test('Wi-Fi telemetry validates and clears missing readings', async () => {
  for (const wifi_rssi of [-127, -75, -60, -1, null, undefined]) {
    const response = await send({ type: 'poll', temperature_c: null, humidity_pct: null, wifi_rssi })
    assert(response.status === 200, 'Valid RSSI rejected')
    const write = calls.find(call => call.method === 'PATCH' && call.url.pathname.endsWith('/devices'))!
    assert(write.body?.wifi_rssi === (wifi_rssi ?? null), 'RSSI missing or stale')
    assert(write.url.searchParams.get('id') === 'eq.01', 'RSSI crossed device boundary')
  }
  for (const wifi_rssi of [0, 1, -128, -60.5, '-60', true]) {
    assert((await send({ type: 'poll', temperature_c: null, humidity_pct: null, wifi_rssi })).status === 400, 'Invalid RSSI accepted')
    assert(calls.every(call => call.method === 'GET'), 'Invalid RSSI wrote data')
  }
})
// Exercise the real gateway handler and Supabase HTTP client with a fake backend.
Deno.env.set('SUPABASE_URL', 'https://backend.example.test')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
const { handleDeviceSync } = await import('../supabase/functions/device-sync/handler.ts')
const token = 'a'.repeat(64)
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
type Call = { url: URL; method: string; body: Record<string, unknown> | null }
let calls: Call[] = []
let failRpc = false
let currentSchedules: { id: number; on_time: string; off_time: string; enabled: boolean }[] = []
let commandAction = 'on'
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method || 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ url, method, body })
  let result: unknown = null
  if (url.pathname.endsWith('/device_tokens')) result = { token_sha256: hash }
  if (url.pathname.endsWith('/device_commands') && method === 'GET') {
    const allowed = url.searchParams.get('action') || ''
    result = allowed.includes(commandAction) ? [{ id: 1, action: commandAction, expires_at: '2099-01-01T00:00:00Z' }] : []
  }
  if (url.pathname.endsWith('/device_schedules')) result = currentSchedules
  if (url.pathname.endsWith('/devices')) result = { schedule_hold: true }
  if (url.pathname.endsWith('/acknowledge_device_command')) result = failRpc ? { message: 'Test transaction failed', code: 'XX000' } : true
  return new Response(JSON.stringify(result), { status: failRpc && url.pathname.endsWith('/acknowledge_device_command') ? 500 : 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

function assert(value: unknown, message: string) { if (!value) throw new Error(message) }
async function send(body: unknown, suppliedToken = token) {
  calls = []
  return await handleDeviceSync(new Request('https://gateway.example.test', {
    method: 'POST', headers: { 'x-device-id': '01', 'x-device-token': suppliedToken, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

Deno.test('invalid JSON shapes and sensor ranges never write telemetry', async () => {
  for (const body of [null, [], 'poll', { type: 'poll', temperature_c: 200, humidity_pct: 50 }]) {
    const response = await send(body)
    assert(response.status === 400, 'Expected validation failure')
    assert(calls.every(call => call.method === 'GET'), 'Invalid request wrote to the database')
  }
})
Deno.test('wrong token stops at credential lookup', async () => {
  assert((await send({ type: 'poll' }, 'b'.repeat(64))).status === 401, 'Expected unauthorized')
  assert(calls.length === 1, 'Unauthorized request reached operational tables')
})
Deno.test('power-mode reports are validated, scoped and replaced on each heartbeat', async () => {
  for (const power_mode of ['active', 'modem_sleep', null, undefined]) {
    const response = await send({ type: 'poll', temperature_c: null, humidity_pct: null, power_mode })
    assert(response.status === 200, 'Power report rejected')
    const write = calls.find(call => call.url.pathname.endsWith('/devices') && call.method === 'PATCH')!
    assert(write.url.searchParams.get('id') === 'eq.01', 'Power report not scoped to authenticated device')
    assert(write.body?.power_mode === (power_mode ?? null), 'Reported mode was not stored or legacy mode was inferred')
  }
  for (const power_mode of ['sleeping', true, 1, {}]) {
    assert((await send({ type: 'poll', temperature_c: null, humidity_pct: null, power_mode })).status === 400, 'Invalid mode accepted')
    assert(calls.every(call => call.method === 'GET'), 'Invalid mode wrote telemetry')
  }
  assert((await send({ type: 'poll', power_mode: 'modem_sleep' }, 'b'.repeat(64))).status === 401, 'Power report bypassed token check')
})
Deno.test('connected polls deliver newly saved and subsequently edited schedules', async () => {
  try {
    for (const on_time of ['23:21:00', '23:22:00']) {
      currentSchedules = [{ id: 8, on_time, off_time: '23:25:00', enabled: true }]
      const response = await send({ type: 'poll', temperature_c: null, humidity_pct: null })
      assert(response.status === 200, 'Connected poll failed')
      const body = await response.json()
      assert(body.schedules[0].on_time === on_time, 'Saved change did not reach the next poll')
    }
  } finally { currentSchedules = [] }
})
Deno.test('sleep report validates duration and scopes expected wake to the authenticated device', async () => {
  for (const sleep_seconds of [0, -1, 21601, 1.5, '60', null]) {
    assert((await send({ type: 'sleep', sleep_seconds })).status === 400, 'Invalid sleep accepted')
    assert(calls.every(call => call.method === 'GET'), 'Invalid sleep wrote telemetry')
  }
  const before = Date.now()
  assert((await send({ type: 'sleep', sleep_seconds: 21600 })).status === 200, 'Sleep failed')
  const write = calls.find(call => call.method === 'PATCH')!
  assert(write.url.searchParams.get('id') === 'eq.01', 'Sleep not scoped to device')
  assert(write.body?.power_mode === null, 'Deep sleep kept a stale connected power mode')
  const wake = Date.parse(String(write.body?.sleep_until))
  assert(wake >= before + 21600000 && wake <= Date.now() + 21600000, 'Expected wake incorrect')
  assert((await send({ type: 'sleep', sleep_seconds: 60 }, 'b'.repeat(64))).status === 401, 'Sleep bypassed token check')
})
Deno.test('poll expires old commands and only selects live commands for this device', async () => {
  const response = await send({ type: 'poll', temperature_c: null, humidity_pct: null })
  assert(response.status === 200, 'Poll failed')
  const heartbeat = calls.find(call => call.url.pathname.endsWith('/devices') && call.method === 'PATCH')!
  assert(heartbeat.body?.sleep_until === null, 'Wake poll did not clear sleep intent')
  const body = await response.json()
  assert(body.command.expires_at_epoch === Math.floor(Date.parse('2099-01-01T00:00:00Z') / 1000), 'Firmware deadline missing')
  assert(body.schedule_hold === true, 'Persisted schedule hold missing from device poll')
  const expiry = calls.find(call => call.url.pathname.endsWith('/device_commands') && call.method === 'PATCH')!
  assert(expiry.url.searchParams.get('device_id') === 'eq.01' && expiry.url.searchParams.get('status') === 'eq.queued', 'Expiry is not scoped')
  assert(expiry.url.searchParams.get('expires_at')?.startsWith('lte.'), 'Expiry has no deadline filter')
  const delivery = calls.find(call => call.url.pathname.endsWith('/device_commands') && call.method === 'GET')!
  assert(delivery.url.searchParams.get('expires_at')?.startsWith('gt.'), 'Expired command could be delivered')
  assert(delivery.url.searchParams.get('device_id') === 'eq.01', 'Delivery is not scoped')
})
Deno.test('acknowledgement uses one scoped RPC and reports transaction failure', async () => {
  const response = await send({ type: 'ack', command_id: 1, status: 'sent_ir' })
  assert(response.status === 200 && (await response.json()).acknowledged, 'Acknowledgement failed')
  assert(calls.length === 2 && calls[1].body?.p_device_id === '01', 'Acknowledgement was not atomic and scoped')
  failRpc = true
  try { assert((await send({ type: 'ack', command_id: 1, status: 'sent_ir' })).status === 500, 'Database failure reported as success') }
  finally { failRpc = false }
  assert((await send({ type: 'ack', command_id: 0, status: 'sent_ir' })).status === 400, 'Invalid command id accepted')
})

Deno.test('capture tests require reported capability and legacy polls revoke it', async () => {
  try {
    for (const action of ['test_temp_down', 'test_temp_up', 'test_mode', 'test_powerful']) {
      commandAction = action
      const legacy = await send({ type: 'poll', temperature_c: null, humidity_pct: null })
      assert((await legacy.json()).command === null, 'Legacy firmware received a captured test')
      const legacyWrite = calls.find(call => call.url.pathname.endsWith('/devices') && call.method === 'PATCH')!
      assert(legacyWrite.body?.capture_test_version === null, 'Legacy firmware kept stale test capability')
      const capable = await send({ type: 'poll', temperature_c: null, humidity_pct: null, capture_test_version: 1 })
      assert((await capable.json()).command.action === action, 'Capable firmware did not receive its test command')
      const write = calls.find(call => call.url.pathname.endsWith('/devices') && call.method === 'PATCH')!
      assert(write.body?.capture_test_version === 1, 'Capability missing from heartbeat')
      assert(write.url.searchParams.get('id') === 'eq.01', 'Capability update crossed device boundary')
    }
    for (const capture_test_version of [true, '1', 2, {}]) {
      assert((await send({ type: 'poll', temperature_c: null, humidity_pct: null, capture_test_version })).status === 400, 'Invalid capability accepted')
      assert(calls.every(call => call.method === 'GET'), 'Invalid capability wrote data')
    }
    assert((await send({ type: 'poll', temperature_c: null, humidity_pct: null, capture_test_version: 1 }, 'b'.repeat(64))).status === 401, 'Capability bypassed authentication')
  } finally { commandAction = 'on' }
})
