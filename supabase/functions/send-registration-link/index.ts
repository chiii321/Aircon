import { brandedEmail } from '../_shared/email-template.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'

const headers = { 'Access-Control-Allow-Origin': 'https://inuvair.tech', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST') return reply(405, 'Method not allowed.')
  try {
    const authorization = request.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return reply(401, 'Sign in to send invitations.')
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: user, error: authError } = await client.auth.getUser()
    if (authError || !user.user) return reply(401, 'Sign in to send invitations.')
    const { data: access, error: accessError } = await client.rpc('get_my_access_context')
    if (accessError || access?.role !== 'admin') return reply(403, 'Only admins can send invitations.')
    const { email } = await request.json()
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, 'Enter a valid email address.')
    const key = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('REGISTRATION_EMAIL_FROM')
    if (!key || !from) return reply(503, 'Email sending is not configured yet. Contact the site administrator.')
    const recipient = email.trim().toLowerCase()
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const saved = await admin.from('registration_invitations').insert({ token_hash: tokenHash, email: recipient, created_by: user.user.id })
    if (saved.error) return reply(503, 'Could not create a secure invitation. Try again later.')
    const link = new URL('https://inuvair.tech/register.html')
    link.searchParams.set('email', recipient)
    link.searchParams.set('invite', token)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `registration-${tokenHash}` },
      body: JSON.stringify({ from, to: [recipient], subject: 'Welcome to INUVAIR — your invitation', html: brandedEmail('Welcome to INUVAIR', ['Your administrator has invited you to join our room climate workspace. We are glad to have you here.', 'After registration, open the confirmation email to verify your address and sign in. Your administrator will approve your account and assign your room timetable.', 'This invitation is valid for 48 hours and can be used once, only with your invited email address. If you were not expecting it, you can ignore it.'], { label: 'Create your account', url: link.href }), text: `Welcome to INUVAIR!\n\nYour administrator has invited you to join our room climate workspace. We are glad to have you here.\n\nCreate your account and choose a password here:\n${link.href}\n\nAfter signing up, check your inbox for the confirmation email. Open its link to verify your email and sign in automatically. Your administrator will approve your account and assign your room timetable.\n\nYou do not need a Vercel account or a Vercel access request.\n\nIf you were not expecting this invitation, you can ignore it.` }),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, response.status === 429 ? 'Email sending limit reached. Try again later.' : 'The email provider could not send the invitation. Check the sender configuration before retrying.')
    return new Response(JSON.stringify({ accepted: true }), { headers })
  } catch {
    return reply(500, 'Could not send the invitation. Try again later.')
  }
})
