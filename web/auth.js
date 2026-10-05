import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0?bundle'

const api = createClient('https://jvdudsbtcjojbgtanbzo.supabase.co', 'sb_publishable_B4ZZZ62G7PF8sNcKGxWA0A_MKmvhTcF')
const mode = document.body.dataset.authMode
const form = document.getElementById('auth-form')
const status = document.getElementById('auth-status')
const submit = form.querySelector('button[type="submit"]')
const emailInput = form.elements.email
let awaitingConfirmation = false
let validInvitation = false
const invitationToken = mode === 'register' ? new URLSearchParams(location.search).get('invite') || '' : ''
const deletionNotice = sessionStorage.getItem('inuvair-deletion-notice')
if (deletionNotice) { status.textContent = deletionNotice; sessionStorage.removeItem('inuvair-deletion-notice') }
api.auth.onAuthStateChange((event, session) => {
  if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) location.replace('dashboard.html')
})
const invitedEmail = mode === 'register' ? new URLSearchParams(location.search).get('email')?.trim() : ''
if (mode === 'register' && invitedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
  emailInput.value = invitedEmail
  emailInput.readOnly = true
  emailInput.setAttribute('aria-readonly', 'true')
}

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
if (mode === 'register' && !current.data.session) {
  submit.disabled = true
  form.querySelectorAll('input').forEach(input => { input.disabled = true })
  status.textContent = 'Checking your invitation…'
  try {
    if (!invitedEmail || !/^[a-f0-9]{64}$/.test(invitationToken)) throw new Error('Invalid invitation')
    const invitation = await api.rpc('validate_registration_invitation', { invited_email: invitedEmail, invitation_token: invitationToken })
    if (invitation.error || invitation.data !== true) throw new Error('Invalid invitation')
    validInvitation = true
    form.querySelectorAll('input').forEach(input => { input.disabled = false })
    submit.disabled = false
    status.textContent = ''
  } catch {
    status.classList.add('error')
    status.textContent = 'This invitation is missing, invalid, expired, or already used. Ask your administrator to email a new registration link.'
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  submit.disabled = true
  status.classList.remove('error')
  status.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…'
  const email = emailInput.value.trim()
  const password = form.elements.password.value
  try {
    let result
    if (mode === 'register') {
      if (!validInvitation) throw new Error('A valid administrator invitation is required.')
      const first_name = form.elements.firstName.value.trim()
      const last_name = form.elements.lastName.value.trim()
      if (!first_name || !last_name) throw new Error('Enter your first and last name.')
      if (password !== form.elements.repeatPassword.value) throw new Error('Passwords do not match.')
      result = await api.auth.signUp({ email, password, options: { data: { first_name, last_name, invitation_token: invitationToken }, emailRedirectTo: 'https://inuvair.tech/dashboard.html' } })
    } else if (email.includes('@')) {
      result = await api.auth.signInWithPassword({ email, password })
    } else {
      const response = await api.functions.invoke('username-login', { body: { username: email.toLowerCase(), password } })
      if (response.error) {
        const body = response.error.context instanceof Response ? await response.error.context.json().catch(() => null) : null
        throw new Error(body?.error || 'Could not reach username sign-in. Please try again or use your email address.')
      }
      if (!response.data?.session) throw new Error('Could not complete username sign-in. Please try again.')
      result = await api.auth.setSession(response.data.session)
    }
    if (result.error) {
      status.classList.add('error')
      status.textContent = authErrorMessage(result.error)
      return
    }
    if (mode === 'register') {
      form.reset()
      emailInput.value = ''
      form.elements.password.value = ''
      if (result.data?.session) { location.replace('dashboard.html'); return }
      awaitingConfirmation = true
      form.querySelectorAll('input').forEach(input => { input.value = ''; input.disabled = true })
      submit.textContent = 'Awaiting email confirmation'
      status.textContent = 'Account created. Check your inbox and spam folder. Open the confirmation link to confirm your email and sign in automatically.'
      history.replaceState(null, '', location.pathname)
    }
    else location.replace('dashboard.html')
  } catch (error) {
    status.classList.add('error')
    status.textContent = authErrorMessage(error)
  } finally {
    submit.disabled = awaitingConfirmation || (mode === 'register' && !validInvitation)
  }
})

