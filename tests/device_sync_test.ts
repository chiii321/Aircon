// deno test --allow-env tests/device_sync_test.ts
// Exercise the real gateway handler and Supabase HTTP client with a fake backend.
Deno.env.set('SUPABASE_URL', 'https://backend.example.test')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
const { handleDeviceSync } = await import('../supabase/functions/device-sync/handler.ts')
const token = 'a'.repeat(64)
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
type Call = { url: URL; method: string; body: Record<string, unknown> | null }
let calls: Call[] = []
let failRpc = false
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method || 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ url, method, body })
  let result: unknown = null
  if (url.pathname.endsWith('/device_tokens')) result = { token_sha256: hash }
  if (url.pathname.endsWith('/device_commands') && method === 'GET') result = [{ id: 1, action: 'on', expires_at: '2099-01-01T00:00:00Z' }]
  if (url.pathname.endsWith('/device_schedules')) result = []
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
Deno.test('poll expires old commands and only selects live commands for this device', async () => {
  const response = await send({ type: 'poll', temperature_c: null, humidity_pct: null })
  assert(response.status === 200, 'Poll failed')
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
