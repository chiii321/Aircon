# Panasonic remote capture

Standalone capture tool for the project's ESP32-WROOM-32. It receives only;
it does not transmit, connect to Wi-Fi, or run the website's AC schedules.
Prefer a spare ESP32. Uploading this sketch to an installed controller replaces
its operating firmware until you upload the matching numbered device sketch again.

## Connections

Use a demodulating IR receiver rated to operate at 3.3V with a 3.3V-safe output.
The receiver model is not yet known: confirm its datasheet and actual pin labels.
Do not assume left-to-right pin order from a photo or the shape of the package.

| Receiver connection | ESP32 connection |
| --- | --- |
| VCC / + (if rated for 3.3V operation) | 3V3 |
| GND / - | GND |
| OUT / S / signal | GPIO27 (IO27, not physical pin number 27) |

Power the ESP32 through USB. Disconnect power before wiring. Never connect a
5V signal to GPIO27. If your receiver requires 5V, identify the exact module
before connecting it; its output may require level conversion. An IR LED is a
transmitter and cannot replace this receiver. No DHT22 or transmitter is needed.

## Upload and capture

1. Open `panasonic_ir_capture.ino` in its matching folder in Arduino IDE.
2. Install **IRremoteESP8266** through Library Manager and select your ESP32 board
   and USB port (the project's generic WROOM board uses **ESP32 Dev Module**).
3. Upload. Open Serial Monitor at **115200 baud**, with **Newline** selected.
   Press the ESP32 reset button if the startup text was missed.
4. Keep the universal remote on the Panasonic setup code that actually works
   with the CW-XN2420EPH. Record the remote model and setup code with the captures.
5. Aim the remote at the receiver from roughly 10–30 cm away. Avoid direct
   sunlight. Type a descriptive label in Serial Monitor, send it, then briefly
   press one remote button. Wait for output to finish before the next press.
6. Copy complete BEGIN/END blocks into a text file. Keep all frames if one press
   creates several blocks. The sketch does not save captures to flash.

## What to capture

Record the remote display before and after each press. Keep fan speed fixed
(for example Auto), swing unchanged, timers disabled, and Powerful off except
when explicitly testing it. Use the actual supported temperature range shown
by your remote; no range is assumed here.

| Capture | Procedure / example label |
| --- | --- |
| Power ON and OFF | Record both with known mode, temperature, fan and Powerful state. |
| Cool mode | Press MODE until Cool is selected. Record previous mode and final displayed settings, e.g. `MODE_TO_COOL_24C_FAN_AUTO_POWERFUL_OFF`. |
| Temperature down | Starting at the highest supported Cool temperature, press down once per capture until the minimum. Label each transition, e.g. `COOL_24C_FAN_AUTO_POWERFUL_OFF_DOWN_FROM_25C`. |
| Temperature up | Starting at the minimum, capture every step back to the maximum, e.g. `COOL_25C_FAN_AUTO_POWERFUL_OFF_UP_FROM_24C`. |
| Powerful ON | Start in Cool at a recorded temperature/fan setting with Powerful off; press Powerful and record any display changes. |
| Powerful OFF | Press Powerful again, or use the remote's documented way to disable it. Record resulting temperature/fan/mode. |

Capture each operation at least twice, restoring the starting settings before
each repeated test. Many remotes send an entire state rather than an isolated
increase/decrease command. A universal remote may lack Powerful or send a code
your AC does not accept. Do not substitute a different feature for Powerful.

Separately confirm the actual AC responds to each requested function and note
the response with its capture. A receiver detecting a code, or a changed remote
display, does not establish that the AC supports it. Powerful compatibility and
all captured temperature commands remain unverified until tested on the unit.

If output is UNKNOWN, retain it: raw timings may still be useful. If output says
INVALID, recapture it. If one button press appears split across blocks, retain
all blocks for review; the 50 ms receive timeout may need adjustment. A
demodulating receiver does not measure the carrier frequency, so raw output
alone does not establish a replay frequency.

Send back the saved capture text, remote model/setup code, and actual AC test
observations. Those are the inputs needed before adding website controls.

Based on the library's official receiver example:
https://github.com/crankyoldgit/IRremoteESP8266/blob/master/examples/IRrecvDumpV2/IRrecvDumpV2.ino
