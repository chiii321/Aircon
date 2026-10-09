# INUVAIR power and sleep plan

Updated: 2026-10-01. The supplied solar plan is reference material; the product name is INUVAIR.

The complete [reference plan](inuvair-solar-reference-plan.md) is preserved with the INUVAIR name.

## Current constraints

The MT3608 boost converter, four-cell parallel battery holder, and battery protector / 1S BMS are not available. Solar-powered battery operation is pending those components and hardware verification. Use the existing USB supply for firmware testing. Do not treat the proposed battery wiring as the current build.

The reference design targets a CN3065, 5V solar panel, protected 1S4P pack, regulated 5V boost output, DHT22 on GPIO32, and two IR LEDs sharing the GPIO25 transistor driver. Board variant, LED ratings, cell suitability, wiring and physical AC response still require confirmation. Existing recorded Panasonic IR captures are preserved.

## Current USB behavior

The user's clarified requirement is to sleep after extended inactivity and become active automatically for schedules. `INUVAIR_DEEP_SLEEP` defaults to `0` in all device sketches and both firmware sources. After ten minutes without schedule changes, commands or a scheduled window, the controller enables Wi-Fi modem sleep while keeping the connection and five-second polling. A newly received schedule, command or hold change resets the idle timer and disables modem sleep. It becomes active 30 seconds before a cached boundary and stays active during an unpaused window. Heartbeats and regular sensor reads do not reset the idle timer. This is connected radio power saving, not CPU deep sleep. The installed SDK does not enable CONFIG_PM_ENABLE or FreeRTOS tickless idle, so automatic CPU light sleep is unavailable in this build. Physical current consumption remains unmeasured.

It continues running cached daily schedules and reconnects after a lost connection. Saving a schedule does not require another reset once this firmware is uploaded and connected. Updated firmware reports its configured active/modem_sleep mode on every poll. The website shows **Idle sleep · online** for a fresh reported modem-sleep heartbeat, with live readings and manual controls available. Older firmware shows **Power mode not reported**; time elapsed without website edits never proves sleep. The legacy Sleeping status is reserved for reported deep sleep with unavailable Wi-Fi. Offline devices cannot retain a current idle badge.

An already sleeping controller cannot receive this firmware or be remotely awakened through the website. Upload the updated sketch once. Sleep status clears on its first successful poll; the website must not show it online before that heartbeat.

## Optional future deep-sleep behavior

When INUVAIR_DEEP_SLEEP=1, the device sketches use timer deep sleep without requiring the missing solar components. Wake, read DHT22, connect with bounded retries, synchronize schedules and time, execute a due event, report the expected wake time, then disconnect Wi-Fi and sleep. A successful wake stays up until at least 20 seconds after boot so dashboard refresh and manual polling have a brief online window. Wake 30 seconds before a cached daily boundary or at the next refresh, whichever comes first. Maximum sleep between refreshes is six hours; during an active daily window, sleep for at most one minute to retain temperature check-in sampling. Failed synchronization retries after two minutes, or before a nearer cached event.

Cached schedules and the last executed event remain in Preferences. RTC memory carries a pending boundary across timer sleep; a boundary reached during reconnect can be executed up to two minutes late. An invalid clock never triggers IR. Manual actions retain the existing command expiry and only work while the device is online. Schedule edits and holds reach sleeping devices on their next successful sync, so an urgent change cannot remotely wake them.

The website displays reported sleep and expected wake time separately from offline status, and labels sleeping readings as last reported. A missed wake becomes offline after a two-minute allowance. Sleep reporting indicates device intent, not measured power consumption or proof that the AC responded.

INUVAIR_DEEP_SLEEP defaults to 0 for connected USB operation and Serial/IR transmission diagnostics. The numbered Panasonic sketches are now transmit-only: the receiver and RAM capture/replay commands have been removed. The recorded raw frames remain in firmware; both LED branches share GPIO25 and send the same command.

## Verification boundary

Compilation and software checks do not prove timer wake, power consumption, DHT22 operation, or physical AC response. Upload and observe on USB before testing the planned solar supply.
