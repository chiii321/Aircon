import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0?bundle'

const api = createClient('https://jvdudsbtcjojbgtanbzo.supabase.co', 'sb_publishable_B4ZZZ62G7PF8sNcKGxWA0A_MKmvhTcF')
const screen = document.getElementById('screen')
const breadcrumb = document.getElementById('breadcrumb')
const accountEmail = document.getElementById('account-email')
const signOut = document.getElementById('sign-out')
let session = null
let devices = []
let schedules = []
let allSchedules = []
let commandHistory = []
let latestCommand = null
let loadingError = ''
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const route = () => decodeURIComponent(location.hash.slice(1) || 'overview')
const selectedId = () => route().startsWith('device/') ? route().split('/')[1] : null
const deviceStatus = d => !d.provisioned ? 'unprovisioned' : d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 30000 ? 'online' : 'offline'
const badge = d => { const status = deviceStatus(d); return `<span class="badge ${status}">${status === 'unprovisioned' ? 'Not provisioned' : status === 'online' ? 'Online' : 'Offline'}</span>` }
const seen = d => d.last_seen_at ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(d.last_seen_at)) : 'Never seen'
const reading = (value, unit) => value == null ? '—' : `${Number(value).toFixed(1)}${unit}`
const temperature = value => {
  if (value == null) return '—'
  const fahrenheit = localStorage.getItem('temperature-unit') === 'fahrenheit'
  return `${(fahrenheit ? Number(value) * 9 / 5 + 32 : Number(value)).toFixed(1)} °${fahrenheit ? 'F' : 'C'}`
}
const pageHead = (label, title, sub) => `<div class="eyebrow">${label}</div><h1>${title}</h1><p class="lead">${sub}</p>`
const banner = (title, body, warn = false) => `<div class="banner ${warn ? 'warn' : ''}"><span aria-hidden="true">${warn ? '◉' : '✳'}</span><div><strong>${title}</strong>${body}</div></div>`

function table(rows) {
  return `<div class="card table-wrap"><table class="device-table"><thead><tr><th>Device</th><th>ID</th><th>Connection</th><th>Temperature</th><th>Last seen</th><th></th></tr></thead><tbody>${rows.map(d => `<tr data-device="${esc(d.id)}" tabindex="0" aria-label="Open device ${esc(d.id)}"><td><strong>${esc(d.name)}</strong><br><small>${esc(d.model || 'Controller slot')}</small></td><td><span class="device-id">${esc(d.id)}</span></td><td>${badge(d)}</td><td>${deviceStatus(d) === 'online' ? temperature(d.temperature_c) : '—'}</td><td>${esc(seen(d))}</td><td>↗</td></tr>`).join('')}</tbody></table></div>`
}

function renderOverview() {
  const online = devices.filter(d => deviceStatus(d) === 'online').length
  const provisioned = devices.filter(d => d.provisioned).length
  const attention = devices.filter(d => deviceStatus(d) !== 'online').length
  return `<div class="page overview-page"><div class="overview-brand"><img class="brand-symbol" src="assets/admin-logo-final.svg" alt=""><span>INUVAIR</span><span class="brand-caption">ROOM CLIMATE</span></div>
    <div class="summary-grid"><div class="card summary-card"><span class="summary-icon">⌂</span><div><div class="stat-label">ROOMS TRACKED</div><b>${devices.length}</b><small>Controller slots</small></div></div><div class="card summary-card"><span class="summary-icon">◉</span><div><div class="stat-label">ONLINE NOW</div><b>${online}</b><small>Recent heartbeats</small></div></div><div class="card summary-card"><span class="summary-icon">✓</span><div><div class="stat-label">PROVISIONED</div><b>${provisioned}<small class="summary-total"> / 11</small></b><small>Ready for device sync</small></div></div></div>
    <section class="card room-card overview-links"><div class="card-heading"><div><div class="eyebrow">ROOM OVERVIEW</div><h1>Choose a workspace</h1></div></div><p class="muted">Your fleet summary is above. Open Monitoring for live controller readings or Devices to manage individual rooms.</p><div class="overview-actions"><a class="overview-action" href="#monitoring"><span>◉</span><strong>Live monitoring</strong><small>Temperature, humidity, and heartbeat</small><b>Open monitoring →</b></a><a class="overview-action" href="#devices"><span>▤</span><strong>Device registry</strong><small>Provisioning, controls, and schedules</small><b>Manage devices →</b></a></div></section>
    <section class="card alerts-card"><div class="card-heading"><div><div class="eyebrow">NEEDS ATTENTION</div><h2>Alerts</h2></div><span class="alert-count">${attention}</span></div>${attention ? `<p class="alert-row"><span class="alert-mark">!</span><span><strong>${attention} controller${attention === 1 ? '' : 's'} offline or awaiting setup</strong><small>Open Devices to review connection status and provisioning.</small></span><a href="#devices" aria-label="Open devices">→</a></p>` : '<p class="alert-clear">All provisioned controllers have checked in recently.</p>'}<p class="alert-foot">Online status is based on a heartbeat in the last 30 seconds. Temperature is shown only when reported; AC response is not verified.</p></section></div>`
}

function renderDevices() {
  return `<div class="page">${pageHead('Fleet view', 'All ESP32 controllers.', 'Eleven identified slots, with live data shown only when a controller reports in.')}${banner('Device 01 is the current prototype', 'The remaining slots have no credentials or hardware connection yet. Each future ESP32 needs its own token and matching firmware ID.', true)}<div class="section-heading"><h2>Device registry</h2><small>${devices.length} slots</small></div>${table(devices)}</div>`
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value)) : '—'
}

function deviceName(id) {
  return devices.find(d => d.id === id)?.name || `Device ${id}`
}

function renderMonitoring() {
  const online = devices.filter(d => deviceStatus(d) === 'online').length
  const readings = devices.filter(d => deviceStatus(d) === 'online' && (d.temperature_c != null || d.humidity_pct != null)).length
  const cards = devices.map(d => `<article class="card monitor-card"><div class="panel-top"><div><strong>${esc(d.name)}</strong><small class="monitor-id">Controller ${esc(d.id)}</small></div>${badge(d)}</div><div class="monitor-readings"><div><label>Temperature</label><b>${deviceStatus(d) === 'online' ? temperature(d.temperature_c) : '—'}</b></div><div><label>Humidity</label><b>${deviceStatus(d) === 'online' ? reading(d.humidity_pct, ' %') : '—'}</b></div></div><p class="muted">Last heartbeat: ${esc(seen(d))}</p></article>`).join('')
  return `<div class="page">${pageHead('Live telemetry', 'Monitoring', 'Current readings reported by your controllers. Values update as device heartbeats arrive.')}
    <div class="stats"><div class="card stat"><div class="stat-label">Online</div><div class="stat-value">${online}<span class="muted"> / ${devices.length}</span></div><div class="stat-sub">Heartbeat within 30 seconds</div></div><div class="card stat"><div class="stat-label">Reporting readings</div><div class="stat-value">${readings}</div><div class="stat-sub">Temperature or humidity available</div></div><div class="card stat"><div class="stat-label">Refresh</div><div class="stat-value">8<span class="muted"> sec</span></div><div class="stat-sub">Automatic page refresh</div></div></div>
    <div class="section-heading"><h2>Controller readings</h2><small>AC operating state is not verified by telemetry</small></div><div class="monitor-grid">${cards || '<div class="card empty">No controllers are assigned to this account.</div>'}</div></div>`
}

function renderScheduling() {
  const rows = allSchedules.map(s => `<tr><td><strong>${esc(deviceName(s.device_id))}</strong><br><small>${esc(s.device_id)}</small></td><td>${esc(s.on_time.slice(0, 5))}</td><td>${esc(s.off_time.slice(0, 5))}</td><td><span class="badge ${s.enabled ? 'online' : 'offline'}">${s.enabled ? 'Enabled' : 'Paused'}</span></td><td><a class="subtle-link" href="#device/${encodeURIComponent(s.device_id)}">Manage →</a></td></tr>`).join('')
  const targets = devices.map(d => `<a class="schedule-target" href="#device/${encodeURIComponent(d.id)}"><span><strong>${esc(d.name)}</strong><small>Controller ${esc(d.id)}</small></span><b>Manage →</b></a>`).join('')
  return `<div class="page">${pageHead('Daily routines', 'Scheduling', 'Review daily ON/OFF windows. Open a device to add, edit, or remove its schedule.')}${banner('Schedules run on the controller', 'Each ESP32 caches its schedule and executes it locally after syncing with a valid clock.')}
    <div class="section-heading"><h2>Schedule windows</h2><small>${allSchedules.length} windows · Asia/Manila</small></div><div class="card table-wrap"><table class="device-table"><thead><tr><th>Device</th><th>Turns on</th><th>Turns off</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">No schedule windows yet. Open a device to add one.</td></tr>'}</tbody></table></div><div class="section-heading"><h2>Manage schedules</h2><small>Per controller</small></div><div class="schedule-targets">${targets || '<div class="card empty">No controllers are assigned to this account.</div>'}</div></div>`
}

function commandStatus(c) {
  return c.status === 'sent_ir' ? 'IR sent' : c.status === 'failed' ? 'Failed' : 'Queued'
}

function renderHistory() {
  const rows = commandHistory.map(c => `<tr><td>${esc(formatDate(c.requested_at))}</td><td><strong>${esc(deviceName(c.device_id))}</strong><br><small>${esc(c.device_id)}</small></td><td><span class="command-action ${esc(c.action)}">${esc(c.action.toUpperCase())}</span></td><td><span class="badge command-${esc(c.status)}">${commandStatus(c)}</span></td><td>${esc(c.error_message || (c.status === 'sent_ir' ? 'IR transmission acknowledged; AC response unverified' : c.status === 'queued' ? 'Waiting for device acknowledgement' : 'See device status'))}</td></tr>`).join('')
  return `<div class="page">${pageHead('Recent activity', 'History', 'Recent manual ON/OFF requests and their device acknowledgements.')}
    <div class="section-heading"><h2>Command history</h2><small>Latest ${commandHistory.length} requests</small></div><div class="card table-wrap"><table class="device-table history-table"><thead><tr><th>Requested</th><th>Device</th><th>Action</th><th>Result</th><th>Details</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">No website commands have been recorded.</td></tr>'}</tbody></table></div><p class="muted history-note">An “IR sent” result confirms the ESP32 attempted transmission; it does not confirm the air conditioner changed state.</p></div>`
}

function renderAlerts() {
  const attention = devices.filter(d => deviceStatus(d) !== 'online')
  const failures = commandHistory.filter(c => c.status === 'failed')
  const deviceRows = attention.map(d => `<div class="alert-detail"><span class="alert-mark">!</span><div><strong>${esc(d.name)} · ${badge(d)}</strong><small>${d.provisioned ? `Last heartbeat: ${esc(seen(d))}` : 'Controller has not been provisioned yet.'}</small></div><a class="subtle-link" href="#device/${encodeURIComponent(d.id)}">Open →</a></div>`).join('')
  const commandRows = failures.map(c => `<div class="alert-detail"><span class="alert-mark">!</span><div><strong>${esc(deviceName(c.device_id))} · ${esc(c.action.toUpperCase())} request failed</strong><small>${esc(c.error_message || 'The controller reported that the IR send failed.')}${c.acknowledged_at ? ` · ${esc(formatDate(c.acknowledged_at))}` : ''}</small></div><a class="subtle-link" href="#device/${encodeURIComponent(c.device_id)}">Open →</a></div>`).join('')
  return `<div class="page">${pageHead('System notices', 'Alerts', 'Connection and command issues based on real controller reports.')}
    <div class="stats"><div class="card stat"><div class="stat-label">Offline or setup needed</div><div class="stat-value">${attention.length}</div><div class="stat-sub">Controller slots requiring attention</div></div><div class="card stat"><div class="stat-label">Failed commands</div><div class="stat-value">${failures.length}</div><div class="stat-sub">In the latest ${commandHistory.length} requests</div></div><div class="card stat"><div class="stat-label">All systems clear</div><div class="stat-value">${attention.length || failures.length ? '—' : '✓'}</div><div class="stat-sub">Based on available device data</div></div></div>
    <section class="card alert-list"><div class="card-heading"><div><div class="eyebrow">DEVICE STATUS</div><h2>Offline or not set up</h2></div></div>${deviceRows || '<p class="alert-clear">All assigned controllers are online.</p>'}</section><section class="card alert-list"><div class="card-heading"><div><div class="eyebrow">COMMANDS</div><h2>Failed transmissions</h2></div></div>${commandRows || '<p class="alert-clear">No failed command acknowledgements in recent history.</p>'}</section></div>`
}

function renderSettings() {
  const unit = localStorage.getItem('temperature-unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius'
  return `<div class="page">${pageHead('Preferences', 'Settings', 'Manage display preferences for this browser session.')}
    <section class="card settings-card"><div class="card-heading"><div><div class="eyebrow">DISPLAY</div><h2>Temperature unit</h2></div></div><p class="muted">Choose how reported temperatures appear across Overview, Devices, and Monitoring.</p><label class="settings-field" for="temperature-unit">Temperature</label><select id="temperature-unit" class="settings-select"><option value="celsius" ${unit === 'celsius' ? 'selected' : ''}>Celsius (°C)</option><option value="fahrenheit" ${unit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit (°F)</option></select></section>
    <section class="card settings-card"><div class="card-heading"><div><div class="eyebrow">SYSTEM</div><h2>Connection and schedule</h2></div></div><dl class="settings-list"><div><dt>Account</dt><dd>${esc(session?.user?.email || 'Signed in')}</dd></div><div><dt>Schedule time zone</dt><dd>Asia/Manila (UTC+8)</dd></div><div><dt>Online threshold</dt><dd>Heartbeat within 30 seconds</dd></div><div><dt>Dashboard refresh</dt><dd>Every 8 seconds</dd></div></dl></section></div>`
}

function scheduleRows() {
  return schedules.map(s => `<div class="schedule-row" data-schedule="${s.id}"><div class="field"><label>ON · 24-hour</label><input type="time" class="on-time" value="${esc(s.on_time.slice(0, 5))}"></div><div class="field"><label>OFF · 24-hour</label><input type="time" class="off-time" value="${esc(s.off_time.slice(0, 5))}"></div><button class="secondary save-schedule" type="button">Save</button><button class="danger remove-schedule" type="button">Remove</button></div>`).join('')
}

function renderDetail(id) {
  const d = devices.find(item => item.id === id)
  if (!d) return `<div class="page">${pageHead('Device', 'Device unavailable.', 'This device is not assigned to your verified account.')}<a class="back" href="#devices">← Back to devices</a></div>`
  const online = deviceStatus(d) === 'online'
  const commandText = latestCommand ? `Last request: ${latestCommand.action.toUpperCase()} · ${latestCommand.status === 'sent_ir' ? 'IR sent by ESP32' : latestCommand.status === 'queued' ? 'Waiting for ESP32' : 'Send failed'}` : 'No website commands recorded.'
  return `<div class="page"><a class="back" href="#devices">← All devices</a>${pageHead('Device ' + esc(id), esc(d.name), esc(d.model || 'Controller slot'))}
    <div class="detail-grid"><section class="card panel"><div class="panel-top"><h2>Live device status</h2>${badge(d)}</div><div class="reading-grid"><div class="reading"><label>Temperature</label><b>${online ? temperature(d.temperature_c) : '—'}</b><small>${online ? 'Latest DHT22 report' : 'No live reading'}</small></div><div class="reading"><label>Humidity</label><b>${online ? reading(d.humidity_pct, ' %') : '—'}</b><small>${online ? 'Latest DHT22 report' : 'No live reading'}</small></div><div class="reading"><label>AC state</label><b>Unknown</b><small>Physical state unverified</small></div></div><p class="muted">Last heartbeat: ${esc(seen(d))}. ${d.last_ir_at ? `Last reported IR: ${esc(d.last_ir_action?.toUpperCase())} at ${esc(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.last_ir_at)))}` : 'No IR transmission report yet.'}</p>
      <div class="rule"></div><div class="panel-top"><h2>Manual control</h2><span class="tag">Live command</span></div><p class="muted">Commands are queued securely and sent at the next device poll. A manual command holds until the next schedule boundary.</p><div class="button-row"><button class="primary manual" data-action="on" ${online ? '' : 'disabled'}>Turn on</button><button class="secondary manual" data-action="off" ${online ? '' : 'disabled'}>Turn off</button></div><p class="status-text" id="command-status">${esc(commandText)}</p><p class="muted">The ESP32 acknowledgement reports IR transmission, not physical AC response.</p></section>
      <section class="card panel"><div class="panel-top"><h2>Daily schedule</h2><span class="tag">Asia/Manila</span></div><p class="muted">Each ON/OFF window repeats daily. The ESP32 caches synced schedules and executes them locally when its clock is valid.</p><div id="schedule-rows">${scheduleRows() || '<p class="muted">No windows set.</p>'}</div><div class="rule"></div><div class="schedule-row"><div class="field"><label>New ON time</label><input type="time" id="new-on" value="07:00"></div><div class="field"><label>New OFF time</label><input type="time" id="new-off" value="09:00"></div><button class="primary" id="add-schedule" type="button" ${d.provisioned ? '' : 'disabled'}>Add window</button></div><p class="status-text" id="schedule-status"></p><p class="muted">Windows must end after they start and cannot overlap or touch. After a reboot without internet, scheduling waits for a valid clock.</p></section></div></div>`
}

function attachTableLinks() { document.querySelectorAll('tr[data-device]').forEach(row => { const open = () => location.hash = `device/${row.dataset.device}`; row.onclick = open; row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } } }) }
function setMessage(id, text, error = false) { const el = document.getElementById(id); if (el) { el.textContent = text; el.classList.toggle('error', error) } }
function validWindow(on, off, omit = null) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(on) && /^([01]\d|2[0-3]):[0-5]\d$/.test(off) && on < off && !schedules.some(s => s.id !== omit && on <= s.off_time.slice(0, 5) && off >= s.on_time.slice(0, 5)) }

async function saveSchedule(id, on, off, deviceId) {
  if (!id && schedules.length >= 12) return setMessage('schedule-status', 'Maximum 12 windows per device.', true)
  if (!validWindow(on, off, id)) return setMessage('schedule-status', 'Use valid non-overlapping times, with OFF after ON.', true)
  const values = { on_time: on, off_time: off, updated_at: new Date().toISOString() }
  const { error } = id ? await api.from('device_schedules').update(values).eq('id', id) : await api.from('device_schedules').insert({ ...values, device_id: deviceId, owner_id: session.user.id })
  if (error) return setMessage('schedule-status', error.message, true)
  await refresh(true)
  setMessage('schedule-status', 'Schedule saved. The ESP32 will sync it on its next poll.')
}

function attachDetail(id) {
  document.querySelectorAll('.manual').forEach(button => button.onclick = async () => {
    button.disabled = true
    setMessage('command-status', 'Queuing command…')
    const { error } = await api.from('device_commands').insert({ device_id: id, requested_by: session.user.id, action: button.dataset.action })
    if (error) { button.disabled = false; return setMessage('command-status', error.message, true) }
    await refresh(true)
    setMessage('command-status', 'Command queued. Waiting for ESP32 acknowledgement.')
  })
  document.getElementById('add-schedule').onclick = () => saveSchedule(null, document.getElementById('new-on').value, document.getElementById('new-off').value, id)
  document.querySelectorAll('[data-schedule]').forEach(row => {
    const scheduleId = Number(row.dataset.schedule)
    row.querySelector('.save-schedule').onclick = () => saveSchedule(scheduleId, row.querySelector('.on-time').value, row.querySelector('.off-time').value, id)
    row.querySelector('.remove-schedule').onclick = async () => { const { error } = await api.from('device_schedules').delete().eq('id', scheduleId); if (error) return setMessage('schedule-status', error.message, true); await refresh(true); setMessage('schedule-status', 'Window removed. The ESP32 will sync this change.') }
  })
}

function render() {
  accountEmail.textContent = session?.user?.email || ''
  signOut.hidden = !session
  const current = route()
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', current === link.dataset.route || current.startsWith('device/') && link.dataset.route === 'devices'))
  breadcrumb.textContent = current.startsWith('device/') ? `Device ${selectedId()}` : ({ overview: 'Overview', devices: 'Devices', monitoring: 'Monitoring', scheduling: 'Scheduling', history: 'History', alerts: 'Alerts', settings: 'Settings' }[current] || 'Overview')
  if (!session) { location.replace('login.html'); return }
  document.getElementById('app').hidden = false
  if (loadingError) { screen.innerHTML = `<div class="page">${banner('Could not load live data', esc(loadingError), true)}</div>`; return }
  const pages = { overview: renderOverview, devices: renderDevices, monitoring: renderMonitoring, scheduling: renderScheduling, history: renderHistory, alerts: renderAlerts, settings: renderSettings }
  screen.innerHTML = selectedId() ? renderDetail(selectedId()) : (pages[current] || renderOverview)()
  attachTableLinks()
  if (selectedId() && devices.some(d => d.id === selectedId())) attachDetail(selectedId())
  const unitSelect = document.getElementById('temperature-unit')
  if (unitSelect) unitSelect.onchange = () => { localStorage.setItem('temperature-unit', unitSelect.value); render() }
}

async function refresh(force = false) {
  if (!session) return
  const { data, error } = await api.from('devices').select('*').order('id')
  loadingError = error?.message || ''
  if (!error) devices = data || []
  const current = route()
  if (!error && current === 'scheduling') {
    const result = await api.from('device_schedules').select('id,device_id,on_time,off_time,enabled,updated_at').order('on_time')
    if (result.error) loadingError = result.error.message
    else allSchedules = result.data || []
  }
  if (!error && ['history', 'alerts'].includes(current)) {
    const result = await api.from('device_commands').select('id,device_id,action,status,requested_at,acknowledged_at,error_message').order('requested_at', { ascending: false }).limit(100)
    if (result.error) loadingError = result.error.message
    else commandHistory = result.data || []
  }
  const id = selectedId()
  if (id && !error) {
    const [scheduleResult, commandResult] = await Promise.all([
      api.from('device_schedules').select('*').eq('device_id', id).order('on_time'),
      api.from('device_commands').select('*').eq('device_id', id).order('id', { ascending: false }).limit(1),
    ])
    if (scheduleResult.error || commandResult.error) loadingError = scheduleResult.error?.message || commandResult.error?.message
    else { schedules = scheduleResult.data || []; latestCommand = commandResult.data?.[0] || null }
  }
  if (force || !screen.contains(document.activeElement) || document.activeElement?.tagName !== 'INPUT') render()
}

signOut.onclick = async () => { await api.auth.signOut(); location.replace('login.html') }
window.addEventListener('hashchange', () => { schedules = []; latestCommand = null; refresh(true) })
api.auth.onAuthStateChange((_event, current) => { session = current; if (!current) location.replace('login.html'); else setTimeout(() => refresh(true), 0) })
const initial = await api.auth.getSession()
session = initial.data.session
if (session) await refresh(true)
else render()
setInterval(() => refresh(), 8000)
