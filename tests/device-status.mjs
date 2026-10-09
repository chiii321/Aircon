import assert from 'node:assert/strict'
import { deviceStatus, devicePowerMode, estimatedAcState } from '../web/device-status.js'

const now = Date.parse('2026-09-30T08:00:00Z')
const device = { provisioned: true, last_seen_at: new Date(now - 60000).toISOString() }
assert.equal(deviceStatus(device, now), 'offline')
assert.equal(deviceStatus({ ...device, last_seen_at: new Date(now).toISOString() }, now), 'online')
assert.equal(deviceStatus({ ...device, sleep_until: new Date(now + 3600000).toISOString() }, now), 'sleeping')
assert.equal(deviceStatus({ ...device, sleep_until: new Date(now - 119000).toISOString() }, now), 'sleeping')
assert.equal(deviceStatus({ ...device, sleep_until: new Date(now - 120000).toISOString() }, now), 'offline')
assert.equal(deviceStatus({ ...device, sleep_until: 'invalid' }, now), 'offline')
assert.equal(deviceStatus({ ...device, provisioned: false, sleep_until: new Date(now + 3600000).toISOString() }, now), 'unprovisioned')
const connected = { ...device, last_seen_at: new Date(now).toISOString() }
assert.equal(devicePowerMode({ ...connected, power_mode: 'modem_sleep' }, now), 'modem_sleep')
assert.equal(deviceStatus({ ...connected, power_mode: 'modem_sleep' }, now), 'online')
assert.equal(devicePowerMode({ ...connected, power_mode: 'active' }, now), 'active')
assert.equal(devicePowerMode(connected, now), 'unknown')
assert.equal(devicePowerMode({ ...device, power_mode: 'modem_sleep' }, now), 'unknown')
assert.equal(devicePowerMode({ ...connected, power_mode: 'invalid' }, now), 'unknown')
assert.equal(devicePowerMode({ ...connected, power_mode: 'modem_sleep', sleep_until: new Date(now + 60000).toISOString() }, now), 'unknown')
console.log('Device status: online, explicit sleep, missed wake, invalid date and unprovisioned checks passed.')
const reported = { last_ir_at: new Date(now - 60000).toISOString(), last_ir_action: 'on' }
assert.equal(estimatedAcState(reported, now), 'ON')
assert.equal(estimatedAcState({ ...reported, last_ir_action: 'off' }, now), 'OFF')
assert.equal(estimatedAcState(connected, now), 'Unknown')
assert.equal(estimatedAcState({ ...reported, last_ir_at: null }, now), 'Unknown')
assert.equal(estimatedAcState({ ...reported, last_ir_at: 'invalid' }, now), 'Unknown')
assert.equal(estimatedAcState({ ...reported, last_ir_at: new Date(now + 60000).toISOString() }, now), 'Unknown')
assert.equal(estimatedAcState({ ...reported, last_ir_action: 'invalid' }, now), 'Unknown')
console.log('AC estimate: reported ON/OFF and absent/invalid/future reports verified.')
