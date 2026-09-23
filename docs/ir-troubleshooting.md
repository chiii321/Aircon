# AC does not respond: hardware handoff

Current software fixes do not establish working physical replay. The reported logs
(`Physical ON/OFF button pressed` followed by `Sent AUX ...`) prove that GPIO input
reaches the sender. They do not prove IR light, correct modulation, range, or AC reception.

## Upload the same revision

Both contributors should run `git pull --ff-only` with a clean working tree, then
record `git rev-parse --short HEAD`. Open only
`firmware/stage1_hardware_test/stage1_hardware_test.ino`, upload, and save the
`status` output (including build date/time). Pulling GitHub changes does not update
the firmware already on the ESP32. Keep local credentials out of Git.

The current firmware sends the latest button-labeled captures: ON is COOLIX
`0xB21F48`; OFF is the saved 199-timing raw frame because it decoded as UNKNOWN.
Earlier COOLIX and ELECTRA_AC captures remain archived under `docs/ir-captures/`.
Replay with the transmitter still requires physical verification.

## Test one link at a time

1. Confirm the original remote operates the AC. Record exact AC and remote model
   numbers. The current transmitter uses a bare 5mm 940 nm LED with a 2N2222A
   driver as shown in [wiring.md](wiring.md). Size the series resistor from the
   LED datasheet and measured supply voltage.
2. At 115200 baud, send `testir` and compare through a phone camera with the
   original remote. A camera that blocks 940 nm may show neither; no visible
   camera flash does not establish a failed transmitter. Then try `on` and `off` separately while
   aiming at the AC receiver from 10–20 cm initially. Observe the AC beep/display/power response;
   compressor startup can be delayed. Respect the AC manual's restart interval.
3. If neither works, type `capture`. DHT reads and local sends pause for at most
   60 seconds. Aim the original remote at GPIO 27's receiver and press once.
   Wait for `Raw capture saved in RAM`. Save the entire printed decode/raw output.
   Overflowed and marked-repeat frames are not saved; keep other remotes away.
4. To test an ON capture, first restore the AC to OFF with the original remote.
   Later remote traffic does not replace the explicitly saved capture. Aim the
   ESP32 transmitter at the AC and type `replay`. For an OFF capture, start with
   the AC ON instead. Repeat the procedure for the other command.
5. If raw replay works but `on`/`off` does not, commit the fresh state AND raw
   timings plus remote settings under `docs/ir-captures/`. The saved protocol,
   frame contents, or library timing is then the next item to investigate.
6. If raw replay also fails, verify LED polarity, exact 2N2222A pinout, common
   ground, 1kΩ base resistor, datasheet-sized LED resistor, and board 5V/VIN rail.
   Compare with a camera or detector known to show 940 nm; many phone cameras
   filter it and show nothing.
   A second receiver/ESP32 or oscilloscope gives better evidence. The sender's
   own receiver is deliberately disabled during sending, so its silence is expected.

Raw replay reproduces recorded mark/space durations at **38 kHz**. A demodulating
receiver does not measure the original carrier, and a capture may omit a later
frame separated by more than the 50 ms capture timeout. Raw replay is a diagnostic,
not proof of a complete remote transaction. Saved raw data is RAM-only, is cleared
by a new `capture`, and is lost at reboot; no automatic replay occurs.

`IR_SEND_INVERTED` defaults to false. Only set it true and rebuild after confirming
an active-LOW transmitter driver. Do not randomly change pin polarity or supply
voltage. A bare IR LED needs current limiting and an appropriate driver; do not
drive a high-current LED directly from a GPIO or feed 5V into ESP32 GPIO/3V3.

## Record the result on GitHub

Use one small branch/PR per change; pull before editing. CI checks both firmware
modes and the host tests, but a green check does not verify the AC. In a capture
record or PR, include this filled-in template (no network credentials):

```text
Commit / printed build timestamp:
Sketch and ESP32 board/core/library versions:
AC / remote / transmitter / receiver model or markings:
Power source and wiring checked:
Original remote works:
Serial on/off AC response:
Physical button AC response:
Raw replay ON/OFF response:
Distance / orientation:
Complete Serial capture output:
```
