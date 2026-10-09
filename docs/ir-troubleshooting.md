# AC does not respond: hardware handoff

Software changes alone don't establish working physical replay. A `Sent ...` line in
Serial Monitor proves the firmware called the IR sender. It doesn't prove IR light,
correct modulation, range, or AC reception.

## Upload the same revision

Both contributors should run `git pull --ff-only` with a clean working tree, then
record `git rev-parse --short HEAD`. Open only
`firmware/stage1_hardware_test/stage1_hardware_test.ino`, upload, and save the
`status` output (including build date/time). Pulling GitHub changes does not update
the firmware already on the ESP32. Keep local credentials out of Git.

The current firmware replays ELECTRA_AC raw frames for both `on` and `off`. Earlier
COOLIX captures remain archived under `docs/ir-captures/`, along with a note on an
unresolved ON/OFF labeling conflict. Replay still requires physical verification.

## Test one link at a time

1. Confirm the original remote operates each AC. Record the exact AC and remote
   model numbers. Check the transmitter wiring against [wiring.md](wiring.md):
   GPIO 25 → 1kΩ → 2N2222A base, 10kΩ base pull-down to GND, emitter to GND, both
   LED cathodes to the collector, and each LED anode to 5V/VIN through its own
   100Ω resistor.
2. At 115200 baud, send `testir` and look at both LEDs through a phone camera,
   comparing with the original remote. A camera that filters IR may show neither,
   so no visible flash doesn't prove a dead LED. If only one LED lights, check
   that LED's polarity, its 100Ω resistor, and its cathode connection to the
   collector.
3. Try `on` and `off` separately, aiming each LED at its AC's IR sensor from
   10–20 cm at first. Watch for the AC's beep, display, or power change;
   compressor startup can be delayed. Respect the AC manual's restart interval.
4. If neither AC responds, verify LED polarity, the exact 2N2222A pinout, common
   ground, the 1kΩ and 10kΩ base resistors, and that the MT3608 supplies 5.00 V
   at the ESP32's 5V/VIN pin. An oscilloscope on the collector, or a second
   board with an IR receiver, gives better evidence than a camera.
5. If one AC responds and the other doesn't, swap the two LEDs' aim. That tells
   you whether the problem follows the LED or the AC. Both ACs must accept the
   same command, because both LEDs always send the same frame.

Raw replay sends recorded mark/space durations at **38 kHz**. The receiver that
made the captures couldn't measure the original carrier frequency, so 38 kHz is
an assumption.

### Taking new captures

The current hardware has no IR receiver. To record a new remote code, temporarily
connect an IR receiver to GPIO 27 (SIGNAL), 3.3V, and GND. Then use the test
sketch's `capture` command, press the remote button once, and save the complete
printed output under `docs/ir-captures/`. `replay` sends the most recent capture.
Captures live in RAM only and are lost at reboot. Disconnect the receiver again
afterwards.

`IR_SEND_INVERTED` defaults to false. Only set it true and rebuild after confirming
an active-LOW transmitter driver. Don't randomly change pin polarity or supply
voltage. Never drive an IR LED directly from a GPIO or feed 5V into an ESP32 GPIO
or the 3V3 pin.

## Record the result on GitHub

Use one small branch/PR per change; pull before editing. CI compiles the firmware,
but a green check does not verify the AC. In a test record or PR, include this
filled-in template (no network credentials):

```text
Commit / printed build timestamp:
Sketch and ESP32 board/core/library versions:
AC / remote / IR LED / transistor model or markings:
Power source and wiring checked:
Original remote works:
Serial on/off response, AC 1:
Serial on/off response, AC 2:
Distance / orientation of each LED:
Complete Serial output:
```
