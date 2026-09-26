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
    const link = new URL('https://inuvair.tech/register.html')
    link.searchParams.set('email', recipient)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `registration-${user.user.id}-${recipient}-${Math.floor(Date.now() / 60000)}` },
      body: JSON.stringify({ from, to: [recipient], subject: 'Welcome to INUVAIR — your invitation', text: `Welcome to INUVAIR!\n\nYour administrator has invited you to join our room climate workspace. We are glad to have you here.\n\nCreate your account and choose a password here:\n${link.href}\n\nAfter signing up, check your inbox for the confirmation email. Open its link to verify your email and sign in automatically. Your administrator will approve your account and assign your room timetable.\n\nYou do not need a Vercel account or a Vercel access request.\n\nIf you were not expecting this invitation, you can ignore it.` }),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, response.status === 429 ? 'Email sending limit reached. Try again later.' : 'The email provider could not send the invitation. Check the sender configuration before retrying.')
    return new Response(JSON.stringify({ accepted: true }), { headers })
  } catch {
    return reply(500, 'Could not send the invitation. Try again later.')
  }
})
