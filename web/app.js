import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0?bundle'
import { readScheduleFile, DAYS } from './schedule-import.js'

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
let accessContext = null
let accessUsers = []
let latestCommand = null
let heldDeviceIds = new Set()
let classCheckins = []
let classResponseMessage = ''
let loadingError = ''
let hasUnsavedEdits = false
let scheduleImport = null
let roomMappings = {}
let weeklyBookings = []
let weeklyLoadError = ''
let importMessage = ''
let importBusy = false
screen.addEventListener('input', event => { if (event.target.id !== 'temperature-unit') hasUnsavedEdits = true })
screen.addEventListener('change', event => { if (event.target.id !== 'temperature-unit') hasUnsavedEdits = true })
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
const isAdmin = () => accessContext?.role === 'admin'
const pageHead = (label, title, sub) => `<div class="eyebrow">${label}</div><h1>${title}</h1><p class="lead">${sub}</p>`
const banner = (title, body, warn = false) => `<div class="banner ${warn ? 'warn' : ''}"><span aria-hidden="true">${warn ? '◉' : '✳'}</span><div><strong>${title}</strong>${body}</div></div>`

function table(rows) {
  return `<div class="card table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="device-table"><thead><tr><th>Device</th><th>ID</th><th>Connection</th><th>Temperature</th><th>Last seen</th><th></th></tr></thead><tbody>${rows.map(d => `<tr data-device="${esc(d.id)}" tabindex="0" aria-label="Open device ${esc(d.id)}"><td><strong>${esc(d.name)}</strong><br><small>${esc(d.model || 'Controller slot')}</small></td><td><span class="device-id">${esc(d.id)}</span></td><td>${badge(d)}</td><td>${deviceStatus(d) === 'online' ? temperature(d.temperature_c) : '—'}</td><td>${esc(seen(d))}</td><td>↗</td></tr>`).join('')}</tbody></table></div>`
}

function renderOverview() {
  const online = devices.filter(d => deviceStatus(d) === 'online').length
  const provisioned = devices.filter(d => d.provisioned).length
  const attention = devices.filter(d => deviceStatus(d) !== 'online').length
  const workspace = isAdmin()
    ? `<div class="overview-actions"><a class="overview-action" href="#monitoring"><span>◉</span><strong>Live monitoring</strong><small>Temperature, humidity, and heartbeat</small><b>Open monitoring →</b></a><a class="overview-action" href="#devices"><span>▤</span><strong>Device registry</strong><small>Provisioning, controls, and schedules</small><b>Manage devices →</b></a></div>`
    : `<div class="overview-actions"><a class="overview-action" href="#alerts"><span>♧</span><strong>Notifications</strong><small>Updates for your assigned devices</small><b>View notifications →</b></a></div>`
  const overviewCopy = isAdmin()
    ? 'Your fleet summary is above. Open Monitoring for live controller readings or Devices to manage individual rooms.'
    : accessContext?.accessMode === 'weekly' ? 'Your rooms appear during your scheduled class slots in Philippine time. Access ends when each slot finishes.' : 'This overview includes only the devices assigned to your account. Notifications show connection and command updates for those devices.'
  const alertAction = isAdmin() ? '<small>Open Notifications to review connection status and provisioning.</small>' : '<small>Only assigned devices are included in your notifications.</small>'
  const assignedRooms = devices.map(d => `<article class="card assigned-room"><div class="panel-top"><div><strong>${esc(d.name)}</strong><small class="monitor-id">Controller ${esc(d.id)}</small></div>${badge(d)}</div><div class="reading-grid"><div class="reading"><label>Temperature</label><b>${deviceStatus(d) === 'online' ? temperature(d.temperature_c) : '—'}</b><small>${deviceStatus(d) === 'online' && d.temperature_c != null ? 'Latest sensor report' : 'No live reading'}</small></div><div class="reading"><label>Humidity</label><b>${deviceStatus(d) === 'online' ? reading(d.humidity_pct, ' %') : '—'}</b><small>${deviceStatus(d) === 'online' && d.humidity_pct != null ? 'Latest sensor report' : 'No live reading'}</small></div><div class="reading"><label>AC state</label><b>Unknown</b><small>Physical state unverified</small></div></div><p class="muted">Last heartbeat: ${esc(seen(d))}</p></article>`).join('')
  const checkinCards = renderClassCheckins()
  return `<div class="page overview-page"><div class="overview-brand"><img class="brand-symbol" src="assets/admin-logo-final.svg" alt=""><span class="brand-name">INUVAIR</span><span class="brand-caption">ROOM CLIMATE</span></div>
    ${classResponseMessage ? banner('Schedule response saved', esc(classResponseMessage)) : ''}
    <div class="summary-grid"><div class="card summary-card"><span class="summary-icon">⌂</span><div><div class="stat-label">ROOMS TRACKED</div><b>${devices.length}</b><small>${isAdmin() ? 'All controller slots' : 'Assigned devices'}</small></div></div><div class="card summary-card"><span class="summary-icon">◉</span><div><div class="stat-label">ONLINE NOW</div><b>${online}</b><small>Recent heartbeats</small></div></div><div class="card summary-card"><span class="summary-icon">✓</span><div><div class="stat-label">PROVISIONED</div><b>${provisioned}<small class="summary-total"> / ${devices.length}</small></b><small>Ready for device sync</small></div></div></div>
    <section class="card room-card overview-links"><div class="card-heading"><div><div class="eyebrow">ROOM OVERVIEW</div><h1>${isAdmin() ? 'Choose a workspace' : 'Your assigned devices'}</h1></div></div><p class="muted">${overviewCopy}</p>${workspace}</section>
    ${!isAdmin() ? `<section class="assigned-room-list"><div class="section-heading"><h2>Assigned device status</h2><small>Temperature, humidity, and AC state</small></div>${assignedRooms || '<div class="card empty">No devices are assigned to this account.</div>'}</section>${checkinCards}` : ''}
    ${heldDeviceIds.size ? `<section class="card alerts-card schedule-held"><strong>Schedule paused</strong><p>Paused for: ${[...heldDeviceIds].map(deviceName).map(esc).join(', ')}. These controllers will not turn on from their local schedules until you resume them.</p><small>The pause syncs the next time each controller connects.</small><div class="confirmation-actions"><button class="secondary resume-schedule" type="button">Resume schedules</button></div></section>` : ''}
    <section class="card alerts-card"><div class="card-heading"><div><div class="eyebrow">NEEDS ATTENTION</div><h2>Notifications</h2></div><span class="alert-count">${attention}</span></div>${attention ? `<p class="alert-row"><span class="alert-mark">!</span><span><strong>${attention} assigned controller${attention === 1 ? '' : 's'} offline or awaiting setup</strong>${alertAction}</span><a href="#alerts" aria-label="Open notifications">→</a></p>` : '<p class="alert-clear">All assigned controllers have checked in recently.</p>'}<p class="alert-foot">Online status is based on a heartbeat in the last 30 seconds. Temperature is shown only when reported; AC response is not verified.</p></section></div>`
}

function renderClassCheckins() {
  if (!classCheckins.length) return ''
  return `<section class="card alerts-card"><div class="card-heading"><div><div class="eyebrow">CLASS CHECK-IN</div><h2>Is class still continuing?</h2></div><span class="alert-count">${classCheckins.length}</span></div>${classCheckins.map(item => `<article class="schedule-confirmation"><div><strong>${esc(deviceName(item.device_id))} · temperature changed less than 0.5°C over 10 minutes</strong><p>Would you like the schedule to continue?</p><small>Detected ${esc(formatDate(item.detected_at))}. A “No” response pauses this controller schedule.</small></div><div class="confirmation-actions"><button class="secondary class-continue" data-device-id="${esc(item.device_id)}" type="button">Yes, continue</button><button class="danger class-stop" data-device-id="${esc(item.device_id)}" type="button">No, stop schedule</button></div><p class="status-text" id="class-status-${esc(item.device_id)}"></p></article>`).join('')}</section>`
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
  return `<div class="page">${pageHead('Room routines', 'Scheduling', 'Import weekly class bookings and manage daily AC timers.')}${renderScheduleImport()}${banner('AC timers run on the controller', 'Each ESP32 caches its daily ON/OFF schedule and executes it locally after syncing with a valid clock.')}
    <div class="section-heading"><h2>Schedule windows</h2><small>${allSchedules.length} windows · Asia/Manila</small></div><div class="card table-wrap" tabindex="0" role="region" aria-label="Scrollable schedule table"><table class="device-table"><thead><tr><th>Device</th><th>Turns on</th><th>Turns off</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">No schedule windows yet. Open a device to add one.</td></tr>'}</tbody></table></div><div class="section-heading"><h2>Manage schedules</h2><small>Per controller</small></div><div class="schedule-targets">${targets || '<div class="card empty">No controllers are assigned to this account.</div>'}</div></div>`
}

function renderScheduleImport() {
  const rooms = [...new Set(scheduleImport?.rows.map(row => row.room) || [])]
  const preview = scheduleImport ? `<div class="section-heading"><h3>Verified bookings</h3><small>${scheduleImport.rows.length} rows · Asia/Manila</small></div>${scheduleImport.errors.length ? `<div class="import-errors" role="alert"><strong>Fix these rows in Excel and upload again</strong><ul>${scheduleImport.errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>` : `<p class="muted">Choose the controller installed in each room. Imported bookings give the approved user room access only during the listed weekly slot.</p><div class="import-mappings">${rooms.map(room => `<div class="field"><label for="map-room-${esc(room)}">Room ${esc(room)}</label><select id="map-room-${esc(room)}" class="settings-select room-mapping" data-room="${esc(room)}"><option value="">Choose controller</option>${devices.map(device => `<option value="${esc(device.id)}" ${roomMappings[room] === device.id ? 'selected' : ''}>${esc(device.name)} · ${esc(device.id)}</option>`).join('')}</select></div>`).join('')}</div>`}<div class="table-wrap" tabindex="0" role="region" aria-label="Excel booking preview"><table class="device-table"><thead><tr><th>Excel row</th><th>User</th><th>Room</th><th>Day</th><th>Time</th><th>Class / Notes</th></tr></thead><tbody>${scheduleImport.rows.map(row => `<tr><td>${row.row}</td><td>${esc(row.email)}</td><td>${esc(row.room)}</td><td>${esc(DAYS[row.day - 1] || 'Invalid')}</td><td>${esc(row.start)}–${esc(row.end)}</td><td>${esc(row.notes)}</td></tr>`).join('')}</tbody></table></div><div class="button-row"><button class="primary" id="save-import" type="button" ${importBusy || scheduleImport.errors.length || weeklyLoadError ? 'disabled' : ''}>${importBusy ? 'Saving…' : 'Review changes'}</button><button class="secondary" id="clear-import" type="button" ${importBusy ? 'disabled' : ''}>Clear preview</button></div><small class="muted">Saving adds bookings. Exact duplicates are skipped; existing bookings are kept. Remove an old booking below before changing its time.</small>` : ''
  const saved = weeklyBookings.map(row => `<tr><td>${esc(row.user_email)}</td><td>${esc(row.room_number)}<br><small>${esc(deviceName(row.device_id))}</small></td><td>${esc(DAYS[row.weekday - 1])}</td><td>${esc(row.start_time.slice(0, 5))}–${esc(row.end_time.slice(0, 5))}</td><td>${esc(row.notes)}</td><td><button class="secondary remove-booking" data-booking-id="${esc(row.id)}" type="button">Remove</button></td></tr>`).join('')
  return `<section class="card panel schedule-import"><div class="panel-top"><div><div class="eyebrow">EXCEL TIMETABLE</div><h2>Weekly room bookings</h2></div><a class="secondary template-download" href="templates/inuvair-weekly-room-schedule-template.xlsx" download>Download Excel template</a></div><p class="muted">Upload a filled template to assign approved users to rooms by weekday and time. Bookings repeat weekly in Philippine time. They do not automatically turn an AC on or off.</p><div class="field"><label for="schedule-file">Upload schedule (.xlsx, up to 2 MB / 500 bookings)</label><input id="schedule-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ${importBusy ? 'disabled' : ''}></div><p class="status-text" id="import-status" role="status">${esc(importMessage)}</p>${weeklyLoadError ? `<p class="error-text">${esc(weeklyLoadError)}</p>` : ''}${preview}<div class="section-heading"><h3>Saved weekly bookings</h3><small>${weeklyBookings.length} bookings</small></div><div class="table-wrap" tabindex="0" role="region" aria-label="Saved weekly bookings"><table class="device-table"><thead><tr><th>User</th><th>Room / Controller</th><th>Day</th><th>Time</th><th>Class / Notes</th><th></th></tr></thead><tbody>${saved || '<tr><td colspan="6" class="empty">No weekly bookings saved yet.</td></tr>'}</tbody></table></div></section>`
}

function confirmScheduleImport(rows, mappings) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.className = 'import-confirmation'
    dialog.setAttribute('aria-labelledby', 'import-confirm-title')
    dialog.innerHTML = `<h2 id="import-confirm-title">Confirm weekly room access</h2><p>Save these ${rows.length} verified bookings? Approved users will see the listed rooms during these weekly time slots in Philippine time.</p><p>Existing bookings stay in place. Exact duplicates are skipped. AC ON/OFF timers are unchanged. Only the Schedule sheet’s six template columns are used.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Bookings to implement"><table class="device-table"><thead><tr><th>User</th><th>Room / Controller</th><th>Day</th><th>Time</th><th>Class / Notes</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.email)}</td><td>${esc(row.room)} · ${esc(deviceName(mappings[row.room]))}</td><td>${esc(DAYS[row.day - 1])}</td><td>${esc(row.start)}–${esc(row.end)}</td><td>${esc(row.notes)}</td></tr>`).join('')}</tbody></table></div><p class="muted">The server checks approval, room mappings and conflicts again before saving. Any failed check cancels the entire import.</p><div class="button-row"><button class="secondary" id="cancel-import" type="button" autofocus>Go back</button><button class="primary" id="confirm-import" type="button">Confirm and save</button></div>`
    const finish = confirmed => { dialog.close(); dialog.remove(); document.getElementById('save-import')?.focus(); resolve(confirmed) }
    dialog.querySelector('#cancel-import').onclick = () => finish(false)
    dialog.querySelector('#confirm-import').onclick = () => finish(true)
    dialog.oncancel = event => { event.preventDefault(); finish(false) }
    document.body.append(dialog)
    dialog.showModal()
  })
}

function attachScheduleImport() {
  document.getElementById('schedule-file').onchange = async event => {
    const file = event.target.files[0]
    if (!file) return
    importBusy = true
    importMessage = 'Reading Excel file…'
    scheduleImport = null
    try {
      scheduleImport = await readScheduleFile(file, accessUsers)
      roomMappings = {}
      for (const room of new Set(scheduleImport.rows.map(row => row.room))) {
        const saved = weeklyBookings.find(booking => booking.room_number === room)
        const named = devices.filter(device => new RegExp(`^room\\s+${room}$`, 'i').test(device.name.trim()))
        roomMappings[room] = saved?.device_id || (named.length === 1 ? named[0].id : '')
      }
      importMessage = `${file.name}: ${scheduleImport.rows.length} verified booking rows extracted. Review before saving.`
    } catch (error) { importMessage = error.message || 'The Excel file could not be read.' }
    finally { importBusy = false; render(); hasUnsavedEdits = true }
  }
  document.querySelectorAll('.room-mapping').forEach(select => select.onchange = () => { roomMappings[select.dataset.room] = select.value; hasUnsavedEdits = true })
  const clear = document.getElementById('clear-import')
  if (clear) clear.onclick = () => { scheduleImport = null; roomMappings = {}; importMessage = ''; render() }
  const save = document.getElementById('save-import')
  if (save) save.onclick = async () => {
    const rooms = [...new Set(scheduleImport.rows.map(row => row.room))]
    if (rooms.some(room => !roomMappings[room])) return setMessage('import-status', 'Choose a controller for every room.', true)
    if (new Set(rooms.map(room => roomMappings[room])).size !== rooms.length) return setMessage('import-status', 'Each room must use a different controller.', true)
    for (const row of scheduleImport.rows) {
      const conflict = weeklyBookings.find(booking => {
        if (booking.room_number === row.room && booking.device_id !== roomMappings[row.room] || booking.device_id === roomMappings[row.room] && booking.room_number !== row.room) return true
        const duplicate = booking.user_email.toLowerCase() === row.email && booking.device_id === roomMappings[row.room] && booking.weekday === row.day && booking.start_time.slice(0, 5) === row.start && booking.end_time.slice(0, 5) === row.end
        return !duplicate && booking.weekday === row.day && row.start < booking.end_time.slice(0, 5) && booking.start_time.slice(0, 5) < row.end && (booking.user_email.toLowerCase() === row.email || booking.device_id === roomMappings[row.room])
      })
      if (conflict) return setMessage('import-status', `Row ${row.row} conflicts with a saved booking or room mapping. Fix it before confirming.`, true)
    }
    if (!(await confirmScheduleImport(scheduleImport.rows, roomMappings))) return
    importBusy = true
    document.querySelectorAll('#schedule-file, #save-import, #clear-import, .room-mapping, .remove-booking').forEach(element => element.disabled = true)
    const { data, error } = await api.rpc('admin_import_weekly_bookings', { bookings: scheduleImport.rows.map(row => ({ email: row.email, room_number: row.room, device_id: roomMappings[row.room], weekday: row.day, start_time: row.start, end_time: row.end, notes: row.notes })) })
    importBusy = false
    if (error) { document.querySelectorAll('#schedule-file, #save-import, #clear-import, .room-mapping, .remove-booking').forEach(element => element.disabled = false); return setMessage('import-status', error.message, true) }
    importMessage = `${data.added} bookings saved; ${data.skipped} duplicates skipped.`
    scheduleImport = null
    roomMappings = {}
    await refresh(true)
  }
  document.querySelectorAll('.remove-booking').forEach(button => button.onclick = async () => {
    button.disabled = true
    const { error } = await api.rpc('admin_remove_weekly_booking', { booking_id: button.dataset.bookingId })
    if (error) { button.disabled = false; return setMessage('import-status', error.message, true) }
    importMessage = 'Weekly booking removed.'
    await refresh(true)
  })
}

function commandStatus(c) {
  return c.status === 'sent_ir' ? 'IR sent' : c.status === 'failed' ? 'Failed' : 'Queued'
}

function renderHistory() {
  const rows = commandHistory.map(c => `<tr><td>${esc(formatDate(c.requested_at))}</td><td><strong>${esc(deviceName(c.device_id))}</strong><br><small>${esc(c.device_id)}</small></td><td><span class="command-action ${esc(c.action)}">${esc(c.action.toUpperCase())}</span></td><td><span class="badge command-${esc(c.status)}">${commandStatus(c)}</span></td><td>${esc(c.error_message || (c.status === 'sent_ir' ? 'IR transmission acknowledged; AC response unverified' : c.status === 'queued' ? 'Waiting for device acknowledgement' : 'See device status'))}</td></tr>`).join('')
  return `<div class="page">${pageHead('Recent activity', 'History', 'Recent manual ON/OFF requests and their device acknowledgements.')}
    <div class="section-heading"><h2>Command history</h2><small>Latest ${commandHistory.length} requests</small></div><div class="card table-wrap" tabindex="0" role="region" aria-label="Scrollable command history table"><table class="device-table history-table"><thead><tr><th>Requested</th><th>Device</th><th>Action</th><th>Result</th><th>Details</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">No website commands have been recorded.</td></tr>'}</tbody></table></div><p class="muted history-note">An “IR sent” result confirms the ESP32 attempted transmission; it does not confirm the air conditioner changed state.</p></div>`
}

function renderAlerts() {
  const attention = devices.filter(d => deviceStatus(d) !== 'online')
  const failures = commandHistory.filter(c => c.status === 'failed')
  const deviceRows = attention.map(d => `<div class="alert-detail"><span class="alert-mark">!</span><div><strong>${esc(d.name)} · ${badge(d)}</strong><small>${d.provisioned ? `Last heartbeat: ${esc(seen(d))}` : 'Controller has not been provisioned yet.'}</small></div>${isAdmin() ? `<a class="subtle-link" href="#device/${encodeURIComponent(d.id)}">Open →</a>` : ''}</div>`).join('')
  const commandRows = failures.map(c => `<div class="alert-detail"><span class="alert-mark">!</span><div><strong>${esc(deviceName(c.device_id))} · ${esc(c.action.toUpperCase())} request failed</strong><small>${esc(c.error_message || 'The controller reported that the IR send failed.')}${c.acknowledged_at ? ` · ${esc(formatDate(c.acknowledged_at))}` : ''}</small></div>${isAdmin() ? `<a class="subtle-link" href="#device/${encodeURIComponent(c.device_id)}">Open →</a>` : ''}</div>`).join('')
  return `<div class="page">${pageHead('System notices', 'Notifications', isAdmin() ? 'Connection and command issues from across the controller fleet.' : 'Connection, schedule check-ins, and command updates for devices assigned to you.')}
    ${classResponseMessage ? banner('Schedule response saved', esc(classResponseMessage)) : ''}
    ${!isAdmin() ? renderClassCheckins() : ''}
    <div class="stats"><div class="card stat"><div class="stat-label">Offline or setup needed</div><div class="stat-value">${attention.length}</div><div class="stat-sub">Controller slots requiring attention</div></div><div class="card stat"><div class="stat-label">Failed commands</div><div class="stat-value">${failures.length}</div><div class="stat-sub">In the latest ${commandHistory.length} requests</div></div><div class="card stat"><div class="stat-label">All systems clear</div><div class="stat-value">${attention.length || failures.length ? '—' : '✓'}</div><div class="stat-sub">Based on available device data</div></div></div>
    <section class="card alert-list"><div class="card-heading"><div><div class="eyebrow">DEVICE STATUS</div><h2>Offline or not set up</h2></div></div>${deviceRows || (devices.length ? '<p class="alert-clear">All assigned controllers are online.</p>' : '<p class="alert-clear">No devices are assigned to this account.</p>')}</section><section class="card alert-list"><div class="card-heading"><div><div class="eyebrow">COMMANDS</div><h2>Failed transmissions</h2></div></div>${commandRows || '<p class="alert-clear">No failed command acknowledgements in recent history.</p>'}</section></div>`
}

function renderSettings() {
  const unit = localStorage.getItem('temperature-unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius'
  return `<div class="page">${pageHead('Preferences', 'Settings', 'Manage display preferences and review system information.')}
    <section class="card settings-card"><div class="card-heading"><div><div class="eyebrow">DISPLAY</div><h2>Temperature unit</h2></div></div><p class="muted">Choose how reported temperatures appear across Overview, Devices, and Monitoring.</p><label class="settings-field" for="temperature-unit">Temperature</label><select id="temperature-unit" class="settings-select"><option value="celsius" ${unit === 'celsius' ? 'selected' : ''}>Celsius (°C)</option><option value="fahrenheit" ${unit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit (°F)</option></select></section>
    <section class="card settings-card"><div class="card-heading"><div><div class="eyebrow">SYSTEM</div><h2>Connection and schedule</h2></div></div><dl class="settings-list"><div><dt>Account</dt><dd>${esc(session?.user?.email || 'Signed in')}</dd></div><div><dt>Schedule time zone</dt><dd>Asia/Manila (UTC+8)</dd></div><div><dt>Online threshold</dt><dd>Heartbeat within 30 seconds</dd></div><div><dt>Dashboard refresh</dt><dd>Every 8 seconds</dd></div></dl></section></div>`
}

function renderUserAccess() {
  return `<div class="page">${pageHead('Administration', 'User access', 'Invite users, approve accounts, manage roles, and assign room access.')}${renderAccessManager()}</div>`
}

function renderAccessManager() {
  const userCard = user => {
    const approved = user.role === 'authorized'
    const admin = user.role === 'admin'
    const adminCount = accessUsers.filter(account => account.role === 'admin').length
    const roleAction = admin
      ? `<p class="muted">Can view and control all devices.</p><button class="secondary change-user-role" type="button" data-user-id="${esc(user.id)}" data-role="authorized" ${adminCount <= 1 ? 'disabled' : ''}>Demote to authorized user</button>${adminCount <= 1 ? '<small class="access-help">The last admin cannot be demoted.</small>' : ''}`
      : approved ? `<button class="secondary change-user-role" type="button" data-user-id="${esc(user.id)}" data-role="admin">Promote to admin</button>` : ''
    const selected = new Set(user.deviceIds || [])
    const assignment = approved ? `<label class="settings-field" for="assigned-devices-${esc(user.id)}">Assigned devices</label><select id="assigned-devices-${esc(user.id)}" class="settings-select access-device-select" multiple size="4">${devices.map(d => `<option value="${esc(d.id)}" ${selected.has(d.id) ? 'selected' : ''}>${esc(d.name)} · ${esc(d.id)}</option>`).join('')}</select><small class="access-help">A controller can be assigned to one authorized user at a time.</small><div class="access-actions"><button class="secondary save-user-devices" type="button" data-user-id="${esc(user.id)}">Save assignments</button><button class="danger revoke-user" type="button" data-user-id="${esc(user.id)}">Revoke approval</button></div>` : `<p class="muted">This account cannot access devices until approved.</p><button class="primary approve-user" type="button" data-user-id="${esc(user.id)}">Approve user</button>`
    return `<article class="user-access-card"><div class="panel-top"><div><strong>${esc(user.email)}</strong><small class="monitor-id">Account access${user.id === session?.user?.id ? ' · You' : ''}</small></div><span class="badge ${admin || approved ? 'online' : 'offline'}">${admin ? 'Admin' : approved ? 'Authorized' : 'Pending'}</span></div>${admin ? '' : assignment}<div class="access-actions">${roleAction}</div></article>`
  }
  const rows = [
    { role: 'admin', title: 'Admins', empty: 'No admin accounts to show.' },
    { role: 'authorized', title: 'Authorized users', empty: 'No authorized users yet.' },
    { role: 'pending', title: 'Awaiting approval', empty: 'No accounts awaiting approval.' },
  ].map(group => {
    const members = accessUsers.filter(user => user.role === group.role)
    return `<section class="user-role-group" aria-labelledby="role-group-${group.role}"><div class="section-heading"><h3 id="role-group-${group.role}">${group.title}</h3><small>${members.length} account${members.length === 1 ? '' : 's'}</small></div><div class="user-access-list">${members.map(userCard).join('') || `<p class="muted">${group.empty}</p>`}</div></section>`
  }).join('')
  return `<section class="card access-manager"><div class="card-heading"><div><div class="eyebrow">ADMIN ONLY</div><h2>Invite and manage users</h2></div><small>${accessUsers.filter(user => user.role === 'authorized').length} approved</small></div><p class="muted">Create a personal signup link for an email address. After email confirmation, approve the account and assign the devices it can access.</p><form id="invite-form" class="invite-form"><label class="settings-field" for="invite-email">Invitee email address</label><div class="invite-controls"><input id="invite-email" type="email" autocomplete="email" placeholder="person@example.com" required><button class="secondary" type="submit">Create invite link</button></div></form><div id="invite-result" class="invite-result" hidden><label class="settings-field" for="invite-link">Share this registration link</label><div class="invite-controls"><input id="invite-link" type="url" readonly><button id="copy-invite" class="secondary" type="button">Copy link</button></div></div><div id="access-status" class="status-text" role="status" aria-live="polite"></div><div class="user-access-list">${rows || '<p class="alert-clear">No other accounts have signed up yet.</p>'}</div></section>`
}

function renderPendingApproval() {
  return `<div class="page pending-page">${pageHead('Account access', 'Awaiting admin approval', 'Your account is signed in, but it has not been approved for INUVAIR yet. Ask the site administrator to approve your account and assign your devices.')}
    <section class="card pending-card"><div class="summary-icon">◷</div><strong>Access is not active yet</strong><p class="muted">Once approved, you will be able to view Overview and Notifications for only the devices assigned to your account.</p></section></div>`
}

function scheduleRows() {
  return schedules.map(s => `<div class="schedule-row" data-schedule="${s.id}"><div class="field"><label for="schedule-on-${s.id}">ON · 24-hour</label><input type="time" id="schedule-on-${s.id}" class="on-time" value="${esc(s.on_time.slice(0, 5))}"></div><div class="field"><label for="schedule-off-${s.id}">OFF · 24-hour</label><input type="time" id="schedule-off-${s.id}" class="off-time" value="${esc(s.off_time.slice(0, 5))}"></div><button class="secondary save-schedule" type="button">Save</button><button class="danger remove-schedule" type="button">Remove</button></div>`).join('')
}

function renderDetail(id) {
  const d = devices.find(item => item.id === id)
  if (!d) return `<div class="page">${pageHead('Device', 'Device unavailable.', 'This device is not assigned to your verified account.')}<a class="back" href="#devices">← Back to devices</a></div>`
  const online = deviceStatus(d) === 'online'
  const commandExpired = latestCommand?.status === 'queued' && latestCommand.expires_at && Date.parse(latestCommand.expires_at) <= Date.now()
  const commandText = latestCommand ? `Last request: ${latestCommand.action.toUpperCase()} · ${latestCommand.status === 'sent_ir' ? 'IR sent by ESP32' : commandExpired ? 'Expired before delivery' : latestCommand.status === 'queued' ? 'Waiting for ESP32' : latestCommand.error_message || 'Send failed'}` : 'No website commands recorded.'
  return `<div class="page"><a class="back" href="#devices">← All devices</a>${pageHead('Device ' + esc(id), esc(d.name), esc(d.model || 'Controller slot'))}
    <div class="detail-grid"><section class="card panel"><div class="panel-top"><h2>Live device status</h2>${badge(d)}</div><div class="reading-grid"><div class="reading"><label>Temperature</label><b>${online ? temperature(d.temperature_c) : '—'}</b><small>${online ? 'Latest DHT22 report' : 'No live reading'}</small></div><div class="reading"><label>Humidity</label><b>${online ? reading(d.humidity_pct, ' %') : '—'}</b><small>${online ? 'Latest DHT22 report' : 'No live reading'}</small></div><div class="reading"><label>AC state</label><b>Unknown</b><small>Physical state unverified</small></div></div><p class="muted">Last heartbeat: ${esc(seen(d))}. ${d.last_ir_at ? `Last reported IR: ${esc(d.last_ir_action?.toUpperCase())} at ${esc(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.last_ir_at)))}` : 'No IR transmission report yet.'}</p>
      <div class="rule"></div><div class="panel-top"><h2>Manual control</h2><span class="tag">Live command</span></div><p class="muted">Commands are queued securely and sent at the next device poll. A manual command holds until the next schedule boundary.</p><div class="button-row"><button class="primary manual" data-action="on" ${online ? '' : 'disabled'}>Turn on</button><button class="secondary manual" data-action="off" ${online ? '' : 'disabled'}>Turn off</button></div><p class="status-text" id="command-status">${esc(commandText)}</p><p class="muted">The ESP32 acknowledgement reports IR transmission, not physical AC response.</p></section>
      <section class="card panel"><div class="panel-top"><h2>Daily schedule</h2><span class="tag">Asia/Manila</span></div><p class="muted">Each ON/OFF window repeats daily. The ESP32 caches synced schedules and executes them locally when its clock is valid.</p><div id="schedule-rows">${scheduleRows() || '<p class="muted">No windows set.</p>'}</div><div class="rule"></div><div class="schedule-row"><div class="field"><label for="new-on">New ON time</label><input type="time" id="new-on" value="07:00"></div><div class="field"><label for="new-off">New OFF time</label><input type="time" id="new-off" value="09:00"></div><button class="primary" id="add-schedule" type="button" ${d.provisioned ? '' : 'disabled'}>Add window</button></div><p class="status-text" id="schedule-status"></p><p class="muted">Windows must end after they start and cannot overlap or touch. After a reboot without internet, scheduling waits for a valid clock.</p></section></div></div>`
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

function attachAccessManager() {
  const inviteForm = document.getElementById('invite-form')
  inviteForm.onsubmit = event => {
    event.preventDefault()
    const email = document.getElementById('invite-email').value.trim().toLowerCase()
    const link = new URL('register.html', location.href)
    link.searchParams.set('email', email)
    const result = document.getElementById('invite-result')
    document.getElementById('invite-link').value = link.href
    result.hidden = false
    setMessage('access-status', 'Link created with the email prefilled. Share it directly with the intended recipient; it is not an expiring or revocable invitation. The recipient still needs email confirmation and your approval.')
  }
  document.getElementById('copy-invite').onclick = async () => {
    const button = document.getElementById('copy-invite')
    try {
      await navigator.clipboard.writeText(document.getElementById('invite-link').value)
      setMessage('access-status', 'Invite link copied.')
    } catch {
      setMessage('access-status', 'Copy was blocked by the browser. Select and copy the link above.', true)
    }
    button.blur()
  }
  document.querySelectorAll('.approve-user').forEach(button => button.onclick = async () => {
    button.disabled = true
    const { error } = await api.rpc('admin_set_user_authorized', { target_user_id: button.dataset.userId, approved: true })
    if (error) { button.disabled = false; return setMessage('access-status', error.message, true) }
    await refresh(true)
    setMessage('access-status', 'User approved. Assign the devices they are allowed to view.')
  })
  document.querySelectorAll('.change-user-role').forEach(button => button.onclick = async () => {
    const user = accessUsers.find(account => account.id === button.dataset.userId)
    const promote = button.dataset.role === 'admin'
    if (!confirm(promote
      ? `Make ${user?.email} an admin? They will be able to control all devices and manage users.`
      : `Demote ${user?.email} to authorized user? They will lose admin access and retain their assigned room access.`)) return
    button.disabled = true
    try {
      const { error } = await api.rpc('admin_set_user_role', { target_user_id: button.dataset.userId, new_role: button.dataset.role })
      if (error) throw error
      await refresh(true)
      setMessage('access-status', promote ? 'User promoted to admin.' : 'User demoted to authorized user.')
    } catch (error) {
      button.disabled = false
      setMessage('access-status', error.message || 'Could not change the role. Please try again.', true)
    }
  })
  document.querySelectorAll('.save-user-devices').forEach(button => button.onclick = async () => {
    button.disabled = true
    const card = button.closest('.user-access-card')
    const deviceIds = [...card.querySelector('.access-device-select').selectedOptions].map(option => option.value)
    const { error } = await api.rpc('admin_set_user_devices', { target_user_id: button.dataset.userId, device_ids: deviceIds })
    if (error) { button.disabled = false; return setMessage('access-status', error.message, true) }
    await refresh(true)
    setMessage('access-status', 'Device assignments saved.')
  })
  document.querySelectorAll('.revoke-user').forEach(button => button.onclick = async () => {
    button.disabled = true
    const { error } = await api.rpc('admin_set_user_authorized', { target_user_id: button.dataset.userId, approved: false })
    if (error) { button.disabled = false; return setMessage('access-status', error.message, true) }
    await refresh(true)
    setMessage('access-status', 'Approval revoked and device assignments removed.')
  })
}

function render() {
  accountEmail.textContent = session?.user?.email || ''
  signOut.hidden = !session
  const current = route()
  const role = accessContext?.role
  document.querySelectorAll('[data-route]').forEach(link => {
    link.hidden = role === 'pending' || role === 'unverified' || (role === 'authorized' && !['overview', 'alerts'].includes(link.dataset.route))
    link.classList.toggle('active', current === link.dataset.route || current.startsWith('device/') && link.dataset.route === 'devices')
  })
  breadcrumb.textContent = current.startsWith('device/') ? `Device ${selectedId()}` : ({ overview: 'Overview', devices: 'Devices', monitoring: 'Monitoring', scheduling: 'Scheduling', history: 'History', alerts: 'Notifications', 'user-access': 'User access', settings: 'Settings' }[current] || 'Overview')
  if (!session) { location.replace('login.html'); return }
  document.getElementById('app').hidden = false
  if (loadingError) {
    screen.innerHTML = `<div class="page">${banner('Could not load live data', esc(loadingError), true)}<p><button class="primary" id="retry-load" type="button">Try again</button></p></div>`
    document.getElementById('retry-load').onclick = () => refresh(true)
    return
  }
  if (role === 'pending') { screen.innerHTML = renderPendingApproval(); return }
  if (role === 'authorized' && !['overview', 'alerts'].includes(current)) { location.hash = 'overview'; return }
  if (role !== 'admin' && role !== 'authorized') { screen.innerHTML = `<div class="page">${banner('Could not verify account access', 'Sign out and sign in again. If this continues, contact the administrator.', true)}</div>`; return }
  const pages = { overview: renderOverview, devices: renderDevices, monitoring: renderMonitoring, scheduling: renderScheduling, history: renderHistory, alerts: renderAlerts, 'user-access': renderUserAccess, settings: renderSettings }
  screen.innerHTML = selectedId() ? renderDetail(selectedId()) : (pages[current] || renderOverview)()
  document.getElementById('page-loading')?.setAttribute('hidden', '')
  hasUnsavedEdits = false
  attachTableLinks()
  if (selectedId() && devices.some(d => d.id === selectedId())) attachDetail(selectedId())
  if (current === 'user-access' && isAdmin()) attachAccessManager()
  if (current === 'scheduling' && isAdmin()) attachScheduleImport()
  if (current === 'overview' || current === 'alerts') attachClassConfirmation()
  const unitSelect = document.getElementById('temperature-unit')
  if (unitSelect) unitSelect.onchange = () => { localStorage.setItem('temperature-unit', unitSelect.value); hasUnsavedEdits = false; render() }
}

function attachClassConfirmation() {
  const resume = document.querySelector('.resume-schedule')
  if (resume) resume.onclick = async () => {
    resume.disabled = true
    const results = await Promise.all([...heldDeviceIds].map(id => api.rpc('respond_to_schedule_confirmation', { p_device_id: id, p_continue: true })))
    const failure = results.find(result => result.error)
    if (failure) return window.alert(failure.error.message)
    classResponseMessage = 'Schedules resumed. Controllers will receive the change at their next sync.'
    await refresh(true)
  }
  document.querySelectorAll('.class-continue, .class-stop').forEach(button => button.onclick = async () => {
    const deviceId = button.dataset.deviceId
    const continueClass = button.classList.contains('class-continue')
    document.querySelectorAll(`.class-continue[data-device-id="${CSS.escape(deviceId)}"], .class-stop[data-device-id="${CSS.escape(deviceId)}"]`).forEach(item => item.disabled = true)
    const { error } = await api.rpc('respond_to_schedule_confirmation', { p_device_id: deviceId, p_continue: continueClass })
    if (error) {
      document.querySelectorAll(`.class-continue[data-device-id="${CSS.escape(deviceId)}"], .class-stop[data-device-id="${CSS.escape(deviceId)}"]`).forEach(item => item.disabled = false)
      return window.alert(error.message)
    }
    classResponseMessage = continueClass
      ? `Class confirmed for ${deviceName(deviceId)}. Its schedule will continue.`
      : `Schedule stopped for ${deviceName(deviceId)}. Its controller will skip cached ON events after syncing.`
    await refresh(true)
  })
}

async function refresh(force = false) {
  if (!session) return
  if (!force && hasUnsavedEdits) return
  loadingError = ''
  try {
  const accessResult = await api.rpc('get_my_access_context')
  if (accessResult.error || !['admin', 'authorized', 'pending'].includes(accessResult.data?.role)) {
    accessContext = { role: 'unverified' }
    devices = []
    loadingError = accessResult.error?.message || 'The account access response was invalid.'
    render()
    return
  }
  accessContext = accessResult.data
  if (accessContext.role === 'pending') {
    devices = []
    schedules = []
    allSchedules = []
    commandHistory = []
    accessUsers = []
    render()
    return
  }
  const current = route()
  if (accessContext.role === 'authorized' && !['overview', 'alerts'].includes(current)) {
    location.hash = 'overview'
    return
  }
  const { data, error } = await api.from('devices').select('*').order('id')
  loadingError = error?.message || ''
  if (!error) devices = data || []
  heldDeviceIds = accessContext.role === 'authorized' ? new Set(devices.filter(d => d.schedule_hold).map(d => d.id)) : new Set()
  if (!error && accessContext.role === 'authorized' && ['overview', 'alerts'].includes(current)) {
    const checkins = await api.from('class_checkins').select('id,device_id,detected_at').eq('status', 'pending').order('detected_at')
    if (checkins.error) loadingError = checkins.error.message
    else classCheckins = checkins.data || []
  } else classCheckins = []
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
  if (!error && ['user-access', 'scheduling'].includes(current) && isAdmin()) {
    const result = await api.rpc('admin_list_users')
    if (result.error) loadingError = result.error.message
    else accessUsers = Array.isArray(result.data) ? result.data : []
  }
  if (!error && current === 'scheduling' && isAdmin()) {
    const result = await api.from('weekly_room_assignments').select('id,user_email,room_number,device_id,weekday,start_time,end_time,notes').order('weekday').order('start_time')
    weeklyLoadError = result.error ? 'Weekly bookings are unavailable. The database update must be installed before saving imports.' : ''
    if (!result.error) weeklyBookings = result.data || []
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
  if (force || (!hasUnsavedEdits && (!screen.contains(document.activeElement) || document.activeElement?.tagName !== 'INPUT'))) render()
  } catch (error) {
    loadingError = error?.message || 'The connection failed. Please try again.'
    render()
  }
}

signOut.onclick = async () => { await api.auth.signOut(); location.replace('login.html') }
window.addEventListener('hashchange', () => { schedules = []; allSchedules = []; commandHistory = []; accessUsers = []; latestCommand = null; refresh(true) })
api.auth.onAuthStateChange((_event, current) => { session = current; if (!current) location.replace('login.html'); else setTimeout(() => refresh(true), 0) })
const initial = await api.auth.getSession()
session = initial.data.session
if (session) await refresh(true)
else render()
setInterval(() => refresh(), 8000)
