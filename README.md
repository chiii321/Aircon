# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for INUVAIR, an IoT air-conditioning controller. Each ESP32 reads a DHT22 and sends IR ON/OFF commands to its air conditioners, following schedules set on the website. Physical AC response remains unverified.

## Current hardware

The full parts list, battery arrangement, and power wiring are in the [hardware and power plan](INUVAIR_HARDWARE_AND_POWER_PLAN.md).

- ESP32-WROOM-32, 38-pin USB-C board
- DHT22 temperature and humidity sensor
- Two IR LEDs driven together by one 2N2222A on GPIO 25, so a single command reaches two ACs at once
- Solar power: 5 V panel → CN3065 charger → 1S BMS with four 18650 cells in parallel (1S4P) → MT3608 boost converter set to 5.00 V → ESP32 5V/VIN
- Test air conditioner: AUX DC inverter, with original remote
- Implementation air conditioner: Panasonic window type

The IR receiver and the physical ON/OFF buttons have been removed. GPIO 26, 27, and 33 are unused.

## Pin connections

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| 2N2222A | Base, through a 1 kΩ resistor | GPIO 25 |
| 2N2222A | Base, through a 10 kΩ pull-down | GND |
| 2N2222A | Emitter | GND |
| 2N2222A | Collector | Both IR LED cathodes (−) |
| IR LED 1 | Anode (+), through its own 100 Ω resistor | 5V/VIN |
| IR LED 2 | Anode (+), through its own 100 Ω resistor | 5V/VIN |
| DHT22 | DATA | GPIO 32 |
| DHT22 | VCC | 3.3V |
| DHT22 | GND | GND |
| MT3608 boost converter | OUT+ / OUT− | 5V/VIN / GND |

See [docs/wiring.md](docs/wiring.md) for the diagram and the checks to do before powering up. A bare 4-pin DHT22 also needs a 10 kΩ pull-up from DATA to 3.3V; a 3-pin module doesn't.

Before powering, verify the transistor's pinout, both LEDs' polarity, and that the MT3608 outputs 5.00 V. Check that the transistor and supply can handle both LED currents together. Keep all grounds common. `IR_SEND_INVERTED` stays false.

Initially test 10–20 cm from the AC's IR sensor. Phone-camera visibility depends on the camera and the LED; failure to see a flash alone does not prove the LED is off. Only the AC's physical response verifies transmission.

## System architecture

For upload and first connection, start with [live setup](docs/live-setup.md). The [website handoff](docs/website-handoff.md) covers the site's layout and secret-handling rules.

See [controller architecture](docs/architecture.md) for trust boundaries, command expiry, database schedule enforcement, checks, and the rollout order for the prepared reliability changes.

```text
Website
  ↓
Cloud / Supabase
  ↓
ESP32
├── DHT22
└── GPIO 25 → 2N2222A ─┬→ IR LED 1 → AC 1
                       └→ IR LED 2 → AC 2 (same command)
```

The ESP32 executes synced schedules locally. A browser does not need to remain open for an AC command to run at its scheduled time. After an offline reboot, schedule execution waits for a valid NTP clock.

## Current development stage

**Connected prototype** — the website and cloud sync endpoint are deployed. The ESP32 has not yet been flashed or observed online in this session, and AC response remains unverified. Temperature automation and energy monitoring remain future work. See [live setup](docs/live-setup.md).

## Repository structure

```text
Aircon/
├── AGENTS.md                  Working rules for contributors and agents
├── README.md
├── vercel.json                Serves web/ on Vercel
├── .github/workflows/         Firmware compile check
├── .gitignore
├── devices/             # Panasonic sketches: 01/01.ino through 11/11.ino
├── firmware/
│   └── stage1_hardware_test/  Maintained ESP32 sketch, CA cert, credentials template
├── supabase/
│   ├── migrations/            Database schema and row level security
│   └── functions/device-sync/ API the ESP32 polls
├── web/                       Static website and dashboard
└── docs/                      Setup, wiring, IR captures, and handoff notes
```

`INUVAIR_HARDWARE_AND_POWER_PLAN.md` is the current parts list and power design. `PIN_CONNECTION_LAYOUT.md` is a quick pin reference. `CODEX_HANDOFF_AC_IOT.md` is the original project brief, kept for context.

## Firmware on this branch

`firmware/stage1_hardware_test/stage1_hardware_test.ino` is the AUX test sketch. It replays captured ELECTRA_AC frames on GPIO 25 and reads the DHT22 on GPIO 32. It still contains `capture` and `replay` commands for an IR receiver on GPIO 27, written before the receiver was removed.

The `devices/01` through `devices/11` folders each contain a copy of the Panasonic-values sketch with the matching device ID, required headers, and a credentials example. Open the matching `.ino` file in Arduino IDE for each controller. Fill in that folder's local, Git-ignored `device_credentials.h` with Wi-Fi settings and the unique token provisioned for that ID before uploading. To change Wi-Fi for all eleven devices, run `devices/set-wifi.cmd` or the PowerShell command in [device Wi-Fi setup](docs/device-wifi-setup.md), then recompile and upload each matching sketch. Firmware uses station mode only, with no setup hotspot. Never commit real credentials. Device online status still requires successful cloud synchronization.

## Required Arduino libraries

Install these through the Arduino IDE Library Manager:

- **DHT sensor library** by Adafruit
- **Adafruit Unified Sensor** (dependency of the DHT library)
- **IRremoteESP8266** by David Conran and contributors
- **ArduinoJson** by Benoit Blanchon

CI compiles the sketch on every push with ESP32 board package **2.0.17**, IRremoteESP8266 **2.8.6**, DHT sensor library **1.4.6**, Adafruit Unified Sensor **1.1.15**, and ArduinoJson **7.4.3**. A local build has also succeeded with ESP32 core **3.3.11**.

The sketch uses Wi-Fi, HTTPS polling, NTP, and locally cached daily schedule windows.

## Run the test sketch

For current Panasonic operation, open the matching `devices/XX/XX.ino`, wire the two transmitter branches as described above. Serial commands are `status`, `dht`, `on`, `off`, and `testir`. Both LEDs share GPIO 25; test the saved signals on each AC separately before testing both together. Set `INUVAIR_DEEP_SLEEP=0` for continuous bench diagnostics, then restore the intended sleep setting. The steps below are for the older AUX test sketch.

1. Wire the board as shown in [docs/wiring.md](docs/wiring.md). Follow [live setup](docs/live-setup.md) to fill the ignored local Wi-Fi credentials before upload.
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**, with **Newline**, **Carriage return**, or **Both NL & CR** enabled. Commands are processed only when a line ends.
6. Run `status`, then `dht` to confirm sensor readings.
7. Use `on` and `off` to test the actual AC response. Both commands replay captured ELECTRA_AC raw frames (104 bits, 211 timings each) at 38 kHz through both LEDs; `status` prints the state bytes for each. If either fails, follow [IR troubleshooting](docs/ir-troubleshooting.md). Earlier captures are archived under `docs/ir-captures/`; see that folder's README for an unresolved ON/OFF labeling conflict.

Serial commands for the current hardware: `status`, `dht`, `on`, `off`, and `testir`. `testir` sends repeated 38 kHz bursts for an optical emission check; a camera may filter them. The sketch also accepts `capture` and `replay`, but those need an IR receiver on GPIO 27, which the current hardware doesn't have.

The current Panasonic source is `firmware/stage1_hardware_test_panasonic_values_only/stage1_hardware_test_panasonic_values_only.ino`, with per-ID copies in `devices/01` through `devices/11`. The older AUX capture sketch is retained at `firmware/stage1_hardware_test/stage1_hardware_test.ino`.

## Power

In normal use the board runs from the solar and battery chain in the [hardware and power plan](INUVAIR_HARDWARE_AND_POWER_PLAN.md), with the MT3608 feeding regulated 5 V into the ESP32's 5V/VIN pin. Set the MT3608 to 5.00 V before connecting it. For bench testing, the board can run from its USB-C port instead.

The sketch starts Wi-Fi without blocking boot and sends no IR automatically at boot. DHT22 readings run every two seconds; `dht` may return the library's cached reading within that interval.

Follow [the hardware test checklist](docs/test-plan.md) before marking Stage 1 complete.

## Software checks

With the versions above installed, build without uploading:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/stage1_hardware_test
```

The firmware compile checks integration; physical IR and network behavior require a device test.

Website checks use Playwright with synthetic data and send no real commands: run `npm --prefix tests install`, `npm --prefix tests run browsers` once, then `npm --prefix tests test`. See [website checks](docs/website-checks.md).

## Working together through GitHub

Pull with `git pull --ff-only` before editing/uploading. Use small branches/PRs and wait for **Firmware checks**, which compiles the controller sketch. Record the tested commit and `status` build timestamp with hardware results using [the handoff template](docs/ir-troubleshooting.md). A GitHub push does not flash the ESP32, and passing CI does not establish physical AC replay.

## Progress checklist

- [ ] ESP32 sketch uploaded
- [ ] DHT22 produces reliable readings
- [x] AUX ON COOLIX capture recorded (`0xB21F48`, 2026-09-23)
- [x] AUX OFF raw capture stored (`UNKNOWN`, 199 timings, 2026-09-23)
- [ ] Captures documented with settings and protocol/raw data
- [ ] AUX ON replay verified
- [ ] AUX OFF replay verified
- [ ] ESP32 01 reports online and sends DHT22 telemetry to the website
- [ ] Website ON/OFF command acknowledgement observed from ESP32 01
- [ ] Daily schedule boundary tested on the ESP32
- [ ] Both IR LEDs reach their ACs from the final mounting position
- [ ] Solar and battery runtime and restart tested

## Future phases

- Validate local schedule execution on hardware, including offline behavior
- Provision ESP32 02 through 11 with separate credentials
- Confirm physical AC response to website and scheduled commands
- Temperature automation
- Energy monitoring
- Panasonic window-type AC integration

## Unresolved questions

- Which ELECTRA_AC frame really turns the AC ON? The firmware labels and the 2026-09-18 capture records disagree; see [IR captures](docs/ir-captures/README.md).
- Is the DHT22 a 3-pin module or a bare 4-pin sensor? The bare sensor needs the 10 kΩ pull-up on DATA.
- Does replay through the two-LED transistor driver reliably reproduce the captured ON/OFF frames on both ACs?
- Can the 2N2222A, its 1 kΩ base resistor, and the 5 V supply drive both LEDs together with reliable range?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?

