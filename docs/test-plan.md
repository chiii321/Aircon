# Stage 1 verification

Use the maintained sketch and wiring in the README. No physical tests below have been performed by this audit.

For the reported no-response issue, first follow [IR troubleshooting](ir-troubleshooting.md). Firmware uses COOLIX ON/OFF labels captured twice from the original remote. Replay with the bare 940 nm LED and transistor driver remains unverified; see [wiring.md](wiring.md).

1. Upload to the ESP32-WROOM-32 using the documented board/library versions. At 115200 baud, run `status` and check GPIOs 25/27/32/33/26. Boot must not transmit a command.
2. Verify plausible DHT22 readings every two seconds and with `dht`. Disconnect DATA temporarily: a read failure should be reported and buttons/IR capture should continue. Reconnect and confirm recovery.
3. Capture fresh AUX ON and OFF signals, recording exact AC/remote models, visible settings, decoded state, and raw timings. Keep the physically confirmed capture labels; do not reverse them from inferred protocol bits. Reject incomplete/overflowed captures.
4. Verify 940 nm LED polarity, datasheet-based current limiting resistor, and transistor wiring. Send `testir` and compare with the original remote using a camera known to show 940 nm. A phone camera may filter IR. Start 10–20 cm from the AC receiver. Run `on` and `off` separately. Check actual AC response and range, following the AC manual's restart interval. A Serial send message is not proof of AC operation.
5. For each physical button, press and hold for five seconds: expect one send log. Release for at least 50 ms, then press again: expect one additional send. Verify contact bounce does not cause repeats. Use one button at a time.
6. Send part of a Serial command without a newline, then press a button: the button must still work. End the command to process it. A line longer than 32 characters must be discarded, and the next valid command must work.
7. Capture another remote frame after each local transmission to verify IR reception resumes. Check DHT readings continue. IR capture can be disturbed during a DHT transaction or local transmission; repeat any incomplete capture.
8. Disconnect the laptop and boot from a USB power bank. Verify both buttons physically control the AC. Restart with a button held: no transmission until release and a fresh press. Test idle operation for the intended demonstration duration and confirm the power bank remains on.

Record date, hardware versions, pass/fail, and observed behavior. Keep replay marked unverified until the real AC responds correctly and repeatedly.
