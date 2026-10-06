export function deviceStatus(device, now = Date.now()) {
  if (!device.provisioned) return 'unprovisioned'
  const wake = Date.parse(device.sleep_until)
  if (Number.isFinite(wake) && now < wake + 120000) return 'sleeping'
  return device.last_seen_at && now - Date.parse(device.last_seen_at) < 30000 ? 'online' : 'offline'
}

export function devicePowerMode(device, now = Date.now()) {
  if (deviceStatus(device, now) !== 'online') return 'unknown'
  return ['active', 'modem_sleep'].includes(device.power_mode) ? device.power_mode : 'unknown'
}

export function estimatedAcState(device, now = Date.now()) {
  const sentAt = Date.parse(device.last_ir_at)
  if (!Number.isFinite(sentAt) || sentAt > now || !['on', 'off'].includes(device.last_ir_action)) return 'Unknown'
  return device.last_ir_action.toUpperCase()
}
