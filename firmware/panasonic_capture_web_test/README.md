# Website-connected captured-signal test firmware

This is a separate copy of controller 01's firmware with four captured tests
added. The numbered sketches under `devices/` are unchanged. This is for the
Panasonic CW-XN2420EPH remote captures supplied on 2026-10-06, not a verified
Celsius setpoint controller.

## Setup

1. Keep all files in this folder together and open `panasonic_capture_web_test.ino`.
2. Copy `device_credentials.example.h` to `device_credentials.h` and fill in the
   board's existing Wi-Fi credentials and device token locally. The local
   credentials header is Git-ignored. Do not share or commit it.
3. The default `kDeviceId` is `01`. For another controller, edit that constant
   in this separate sketch and use that controller's own token.
4. Use the existing transmitter wiring: GPIO25 to the transistor driver, with
   common GND and a current-limiting resistor for each IR LED. DHT22 remains on
   GPIO32. No IR receiver is required for this sending firmware. See
   [wiring guide](../../docs/wiring.md) for the existing driver's connections.
5. Install the project's DHT, IRremoteESP8266 and ArduinoJson libraries, select
   ESP32 Dev Module, compile and upload to the selected ESP32. Uploading replaces
   that board's running firmware; it does not modify the numbered sketch files.

## Website and commands

Apply `20261006123950_captured_signal_tests.sql`, then deploy the updated
`device-sync` gateway and website before uploading this firmware. After a
successful poll the controller reports `capture_test_version: 1` and the website
enables its captured tests while online. Older firmware reports no capability;
the gateway clears it and delivers only ON/OFF commands to older firmware.

Admins find the buttons on the device detail page. Authorized users find them
on their Overview room cards, limited by the existing active-room access rules.
The existing admin-only ON/OFF and schedule-editing permissions are unchanged.

Serial Monitor at 115200 baud also accepts:

| Command / website action | Signal |
| --- | --- |
| `test_temp_down` | Capture 1, user-labelled temperature down |
| `test_temp_up` | Capture 2, user-labelled temperature up |
| `test_mode` | Capture 3, MODE press, decoder returned UNKNOWN |
| `test_powerful` | Capture 4, POWERFUL press |

Decoded Panasonic captures replay the exact 16 state bytes using the library's
`sendPanasonicAC` encoder, with no extra repetitions. MODE replays all 263
supplied raw timings at the project's existing 38 kHz setting. The demodulating
receiver did not measure carrier frequency; both the library carrier and raw
replay compatibility must be checked on the real AC.

These are fixed captured signals, not proven relative temperature commands.
They may change mode, fan or power alongside temperature. Repeated presses may
send the same settings. MODE is not labelled Cool; POWERFUL is not labelled
ON/OFF. Neither a confirmed 20–25°C range nor absolute target settings exist yet.
Shared two-LED wiring sends the same signal toward both AC units.

Website requests retain the existing 60-second expiry, scoped acknowledgement
and firmware command-ID deduplication. A successfully acknowledged test clears
the old ON/OFF estimate to Unknown. A sent-IR result only confirms the ESP32
attempted transmission, not that the AC received it. Local Serial tests do not
create a website command or cloud acknowledgement.

## Physical completion check

Record the AC's visible settings before and after each single test; verify
temperature, mode, fan, power and Powerful response. Compare with the original
remote. Confirm each requested function independently before turning these tests
into ordinary temperature controls. Schedules remain active and can send ON/OFF
at their next boundary. Restore the matching numbered sketch to return to the
previous firmware; the next poll disables the test controls.
