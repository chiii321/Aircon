import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0?bundle'

const api = createClient('https://jvdudsbtcjojbgtanbzo.supabase.co', 'sb_publishable_B4ZZZ62G7PF8sNcKGxWA0A_MKmvhTcF')
const mode = document.body.dataset.authMode
const form = document.getElementById('auth-form')
const status = document.getElementById('auth-status')
const submit = form.querySelector('button[type="submit"]')

const current = await api.auth.getSession()
if (current.data.session) location.replace('dashboard.html')

form.addEventListener('submit', async event => {
  event.preventDefault()
  submit.disabled = true
  status.classList.remove('error')
  status.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…'
  const email = form.elements.email.value.trim()
  const password = form.elements.password.value
  const result = mode === 'register'
    ? await api.auth.signUp({ email, password, options: { emailRedirectTo: new URL('dashboard.html', location.href).href } })
    : await api.auth.signInWithPassword({ email, password })
  submit.disabled = false
  if (result.error) {
    status.classList.add('error')
    status.textContent = result.error.message
    return
  }
  if (mode === 'register') status.textContent = 'Check your inbox to confirm your email, then sign in.'
  else location.replace('dashboard.html')
})
