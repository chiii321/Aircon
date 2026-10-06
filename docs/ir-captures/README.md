# AUX IR Capture Records

> These records were made with an IR receiver that has since been removed from the hardware. To take a new capture, temporarily connect one as described in [IR troubleshooting](../ir-troubleshooting.md#taking-new-captures).

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

The Stage 1 sketch prints decoded information and Arduino source/raw data to Serial Monitor. Preserve the output exactly. Do not reuse captures marked as overflowing/incomplete.

## What the firmware sends now

Since 2026-09-25, `on` and `off` replay two ELECTRA_AC raw frames (104 bits, 211 timings each) stored in the sketch as `kElectraOnRaw` and `kElectraOffRaw`. No dated capture record exists for those raw arrays. Decoding them gives exactly the state bytes the sketch prints:

| Firmware label | State bytes |
| --- | --- |
| ON | `C388E0004000200000200005B0` |
| OFF | `C388E000400020000000000590` |

**Unresolved labeling conflict:** the [2026-09-18 ON](aux-dc-inverter-on-2026-09-18.md) and [OFF](aux-dc-inverter-off-2026-09-18.md) records assign these same two byte sequences the opposite way round. Those records also say their labels came from observed AC behavior. Confirm with a physical test which label is right, then update the firmware or the records so they agree.

The COOLIX captures from [2026-09-20](aux-coolix-2026-09-20.md) and [2026-09-23](aux-coolix-2026-09-23.md) are kept as history. Physical AC response through the transistor-driven LED remains unverified.

For fresh diagnostics use [capture/replay and the hardware handoff](../ir-troubleshooting.md). Save complete raw output, settings, tested commit, and observed AC response.

AC remotes often send complete state rather than a standalone ON/OFF code. Capture commands with the intended temperature, mode, fan, and swing settings because those settings may be replayed as part of the command.
