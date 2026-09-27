import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'
const headers = { 'Access-Control-Allow-Origin': 'https://inuvair.tech', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
  try {
    const { username, password } = await request.json()
    if (typeof username !== 'string' || !/^[a-z0-9_]{3,30}$/i.test(username) || typeof password !== 'string' || !password || password.length > 4096) return reply(400, { error: 'Invalid username or password.' })
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
    const ipHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const lookup = await admin.rpc('username_login_email', { login_username: username.toLowerCase(), ip_hash: ipHash })
    if (lookup.error) return reply(503, { error: 'Sign-in is temporarily unavailable. Try again later.' })
    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
    const result = await auth.auth.signInWithPassword({ email: lookup.data || 'invalid-username@invalid.invalid', password })
    if (!lookup.data || result.error || !result.data.session) return reply(401, { error: 'Invalid username or password, or email is not confirmed. Try again later if you have made several attempts.' })
    return reply(200, { session: { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token } })
  } catch { return reply(400, { error: 'Could not sign in. Try again.' }) }
})
