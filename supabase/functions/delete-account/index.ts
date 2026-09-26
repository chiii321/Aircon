import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'

const headers = { 'Access-Control-Allow-Origin': 'https://inuvair.tech', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed.' })
  let deleted = false
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '')
    if (!token) return reply(401, { error: 'Sign in again before deleting your account.' })
    const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await verifier.auth.getUser(token)
    if (error || !data.user?.email) return reply(401, { error: 'Sign in again before deleting your account.' })
    const { email, password } = await request.json()
    if (typeof email !== 'string' || email.trim().toLowerCase() !== data.user.email.toLowerCase()) return reply(400, { error: 'Enter your own account email address.' })
    if (typeof password !== 'string' || !password || password.length > 4096) return reply(400, { error: 'Enter your current password.' })
    const checked = await verifier.auth.signInWithPassword({ email: data.user.email, password })
    if (checked.error || checked.data.user?.id !== data.user.id) return reply(403, { error: 'Password verification failed. Your account was not deleted.' })
    await verifier.auth.signOut({ scope: 'local' })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const removed = await admin.auth.admin.deleteUser(data.user.id)
    if (removed.error) return reply(409, { error: 'Could not delete the account. If you are the last admin, promote another approved user first.' })
    deleted = true
    const key = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('REGISTRATION_EMAIL_FROM')
    let emailSent = false
    if (key && from) {
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `account-deleted-${data.user.id}` },
        body: JSON.stringify({ from, to: [data.user.email], subject: 'Your INUVAIR account was deleted', text: 'Your INUVAIR account has been permanently deleted at your request. You can no longer sign in or access assigned room information. If you did not request this deletion, contact your INUVAIR administrator.' }), signal: AbortSignal.timeout(10000)
      })
      emailSent = sent.ok
      if (emailSent) await admin.from('account_deletion_notices').update({ sent_at: new Date().toISOString() }).eq('user_id', data.user.id)
    }
    return reply(200, { deleted: true, emailSent })
  } catch {
    return deleted ? reply(200, { deleted: true, emailSent: false }) : reply(500, { error: 'Could not delete your account. Try again later.' })
  }
})
