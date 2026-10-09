import assert from 'node:assert/strict'
import { wifiSignal } from '../web/device-status.js'
const now = Date.now()
const online = { provisioned: true, last_seen_at: new Date(now).toISOString() }
for (const [wifi_rssi, expected] of [[-1, 'Excellent'], [-60, 'Excellent'], [-61, 'Good'], [-75, 'Good'], [-76, 'Poor'], [-127, 'Poor'], [null, 'Not reported'], [0, 'Not reported'], [-128, 'Not reported'], ['-55', 'Not reported']]) {
  assert.equal(wifiSignal({ ...online, wifi_rssi }, now), expected)
}
assert.equal(wifiSignal({ ...online, last_seen_at: null, wifi_rssi: -55 }, now), 'No connection')
assert.equal(wifiSignal({ ...online, sleep_until: new Date(now + 60000).toISOString() }, now), 'Sleeping')
console.log('Wi-Fi signal thresholds and stale readings passed')
