import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0?bundle'

const api = createClient('https://jvdudsbtcjojbgtanbzo.supabase.co', 'sb_publishable_B4ZZZ62G7PF8sNcKGxWA0A_MKmvhTcF')
const mode = document.body.dataset.authMode
const form = document.getElementById('auth-form')
const status = document.getElementById('auth-status')
const submit = form.querySelector('button[type="submit"]')

function authErrorMessage(error) {
  const message = String(error?.message || '')
  const isEmailLimit = error?.status === 429 || /over_email_send_rate_limit|email rate limit exceeded/i.test(message)
  if (mode === 'register' && isEmailLimit) {
    return 'Confirmation emails are temporarily rate-limited. Check your inbox for a message from an earlier attempt, or try again later.'
  }
  return message || 'We could not complete that request. Please try again.'
}

const current = await api.auth.getSession()
if (current.data.session) location.replace('dashboard.html')

form.addEventListener('submit', async event => {
  event.preventDefault()
  submit.disabled = true
  status.classList.remove('error')
  status.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…'
  const email = form.elements.email.value.trim()
  const password = form.elements.password.value
  try {
    const result = mode === 'register'
      ? await api.auth.signUp({ email, password, options: { emailRedirectTo: new URL('dashboard.html', location.href).href } })
      : await api.auth.signInWithPassword({ email, password })
    if (result.error) {
      status.classList.add('error')
      status.textContent = authErrorMessage(result.error)
      return
    }
    if (mode === 'register') status.textContent = 'Check your inbox to confirm your email, then sign in.'
    else location.replace('dashboard.html')
  } catch (error) {
    status.classList.add('error')
    status.textContent = authErrorMessage(error)
  } finally {
    submit.disabled = false
  }
})
