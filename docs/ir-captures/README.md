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

The Stage 1 sketch prints decoded information and Arduino source/raw data to Serial Monitor. Preserve the output exactly. The current ON/OFF firmware sends the COOLIX codes in [the latest capture record](aux-coolix-2026-09-20.md). Older 13-byte ELECTRA_AC captures remain archived here. Do not reuse captures marked as overflowing/incomplete.

The older ELECTRA_AC checksums are valid, but the fresh COOLIX captures decoded consistently twice. Firmware sends the COOLIX codes. Physical AC response through the 2N2222A and bare 940 nm LED remains unverified.

For fresh diagnostics use [capture/replay and the hardware handoff](../ir-troubleshooting.md). Save complete raw output, settings, tested commit, and observed AC response.

AC remotes often send complete state rather than a standalone ON/OFF code. Capture commands with the intended temperature, mode, fan, and swing settings because those settings may be replayed as part of the command.
