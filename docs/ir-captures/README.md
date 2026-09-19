# AUX IR Capture Records

Do not add invented values. Create one record for every real capture, preferably a Markdown file with a descriptive name such as `aux-dc-inverter-on-2026-09-18.md`.

Record all of the following:

- AC brand and model
- Command (for example, ON or OFF)
- Power state
- Temperature setting
- Mode
- Fan setting
- Swing setting, if relevant
- Decoded protocol
- Raw timing data or protocol state data
- Date captured
- Whether replay was verified, including a brief test result

The Stage 1 sketch prints decoded information and Arduino source/raw data to Serial Monitor. Preserve the output exactly. The existing ON/OFF records contain 13-byte ELECTRA_AC state data, already copied into `kAuxOnState` and `kAuxOffState`; there are no raw placeholders in the maintained sketch. Do not reuse captures marked as overflowing/incomplete.

Both recorded checksums are valid. ON/OFF labels are confirmed by the user from actual AUX behavior during capture. Firmware uses these exact records under their original labels; inferred protocol bits must not override that physical evidence. Replay with the temporary harvested-LED transistor circuit remains unverified. See [the library's protocol definition](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.8.6/src/ir_Electra.h) and [power/checksum implementation](https://github.com/crankyoldgit/IRremoteESP8266/blob/v2.8.6/src/ir_Electra.cpp).

For fresh diagnostics use [capture/replay and the hardware handoff](../ir-troubleshooting.md). Save complete raw output, settings, tested commit, and observed AC response.

AC remotes often send complete state rather than a standalone ON/OFF code. Capture commands with the intended temperature, mode, fan, and swing settings because those settings may be replayed as part of the command.
