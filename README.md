# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for an IoT-based air-conditioning controller. The current sketch adds Wi-Fi control and locally cached daily schedules to the DHT22 and AUX IR prototype. Physical AUX ON/OFF replay remains unverified.

## Current hardware

- ESP32-WROOM-32, 30-pin board
- DHT22 temperature and humidity sensor
- IR receiver removed from the Panasonic device setup; GPIO 27 is unused
- Two IR LED branches requested on the GPIO 25 transistor driver, with separate current-limiting resistors. The existing harvested LED's ratings and the second LED's specifications are unconfirmed; combined driver current requires verification.
- Test air conditioner: AUX DC inverter, with original remote
- Future implementation air conditioner: Panasonic window type

## Current pin connections

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| IR driver | Base through 1kΩ resistor | GPIO 25 |
| IR driver | 2N2222A emitter | GND |
| IR driver | 2N2222A collector | Both IR LED cathodes (-), combined current to be verified |
| IR LED 1 | Anode (+) through its own resistor R1 | 5V/VIN |
| IR LED 2 | Anode (+) through its own resistor R2 | 5V/VIN |
| IR receiver | Removed from Panasonic device setup | GPIO 27 unused |
| DHT22 | DATA | GPIO 32 |
| DHT22 | VCC | 3.3V |
| DHT22 | GND | GND |
| Physical ON/OFF buttons | Removed from prototype | Not used |

See [docs/wiring.md](docs/wiring.md) for the two-LED wiring and the required combined-current check. Resistor values depend on the actual LED/transistor ratings; they have not been verified for this arrangement.

Transmitter circuit: GPIO 25 → base resistor → 2N2222A base; emitter → GND; collector → both LED cathodes. Each LED anode connects to board 5V/VIN through its own series resistor. The existing base resistor is 1kΩ, but its suitability for the combined LED current needs checking. Keep grounds common and verify transistor pinout, LED polarity and the supply. `IR_SEND_INVERTED` remains false. Both LEDs transmit the same stored command.

Initially test 10–20 cm from the AC receiver. Phone-camera visibility depends on the camera and the LED; failure to see a flash alone does not prove the LED is off. Only the AC's physical response verifies transmission.

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
└── GPIO 25 IR driver → LED 1 → AC 1
                     └→ LED 2 → AC 2 (same command)
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

`CODEX_HANDOFF_AC_IOT.md` is the original project brief, kept for context. `PIN_CONNECTION_LAYOUT.md` is a quick pin reference.
The `devices/01` through `devices/11` folders each contain a copy of the Panasonic-values sketch with the matching device ID, required headers, and a credentials example. Open the matching `.ino` file in Arduino IDE for each controller. Fill in that folder's local, Git-ignored `device_credentials.h` with Wi-Fi settings and the unique token provisioned for that ID before uploading. To change Wi-Fi for all eleven devices, run `devices/set-wifi.cmd` or the PowerShell command in [device Wi-Fi setup](docs/device-wifi-setup.md), then recompile and upload each matching sketch. Firmware uses station mode only, with no setup hotspot. Never commit real credentials. Device online status still requires successful cloud synchronization.

## Required Arduino libraries

Install these through the Arduino IDE Library Manager:

- **DHT sensor library** by Adafruit
- **Adafruit Unified Sensor** (dependency of the DHT library)
- **IRremoteESP8266** by David Conran and contributors
- **ArduinoJson** by Benoit Blanchon

CI compiles the sketch on every push with ESP32 board package **2.0.17**, IRremoteESP8266 **2.8.6**, DHT sensor library **1.4.6**, Adafruit Unified Sensor **1.1.15**, and ArduinoJson **7.4.3**. A local build has also succeeded with ESP32 core **3.3.11**.

The sketch uses Wi-Fi, HTTPS polling, NTP, and locally cached daily schedule windows. GPIO 33 and 26 are not used for buttons.

## Run Stage 1

For current Panasonic operation, open the matching `devices/XX/XX.ino`, disconnect the IR receiver and wire the two transmitter branches as described above. Serial commands are `status`, `dht`, `on`, `off`, and `testir`. Both LEDs share GPIO 25; test the saved signals on each AC separately before testing both together. Set `INUVAIR_DEEP_SLEEP=0` for continuous bench diagnostics, then restore the intended sleep setting. The older AUX receiver/capture workflow below is retained for reference and does not apply to these transmit-only device sketches.

1. Wire the remaining components as shown in [docs/wiring.md](docs/wiring.md), omitting the physical buttons. Follow [live setup](docs/live-setup.md) to fill the ignored local Wi-Fi credentials before upload.
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**, with **Newline**, **Carriage return**, or **Both NL & CR** enabled. Commands are processed only when a line ends.
6. Run `status`, then `dht` to confirm sensor readings.
7. Aim the AUX remote at the IR receiver and press its ON and OFF commands separately. Copy each printed source/raw capture into a documented capture record.
8. Use `on` and `off` to test the actual AC response. Both commands replay captured ELECTRA_AC raw frames (104 bits, 211 timings each) at 38 kHz; `status` prints the state bytes for each. If either fails, follow [IR troubleshooting](docs/ir-troubleshooting.md), including the `capture` / `replay` diagnostic. Earlier COOLIX captures are archived under `docs/ir-captures/`; see that folder's README for an unresolved ON/OFF labeling conflict.

Available serial commands: `status`, `dht`, `on`, `off`, `testir`, `capture`, and `replay`. `testir` sends repeated 38 kHz bursts for an optical emission check; a camera may filter them. `capture` records the next non-overflowed, non-repeat remote frame in RAM and pauses DHT reads for up to 60 seconds. `replay` transmits the captured raw timings at 38 kHz.

The current Panasonic source is `firmware/stage1_hardware_test_panasonic_values_only/stage1_hardware_test_panasonic_values_only.ino`, with per-ID copies in `devices/01` through `devices/11`. The older AUX capture sketch is retained at `firmware/stage1_hardware_test/stage1_hardware_test.ino`.

## USB power

Upload once, disconnect the laptop, and power the board through its USB connector using a power bank. The sketch starts Wi-Fi without blocking boot and sends no IR automatically at boot. Keep the power bank on under this load. DHT22 readings run every two seconds; `dht` may return the library's cached reading within that interval.

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
- [ ] Power-bank idle endurance and restart tested

## Future phases

- Validate local schedule execution on hardware, including offline behavior
- Provision ESP32 02 through 11 with separate credentials
- Confirm physical AC response to website and scheduled commands
- Temperature automation
- Energy monitoring
- Panasonic window-type AC integration

## Unresolved questions

- Which ELECTRA_AC frame really turns the AC ON? The firmware labels and the 2026-09-18 capture records disagree; see [IR captures](docs/ir-captures/README.md).
- Which exact DHT22 module variant is used, and does it require an external pull-up resistor on DATA?
- Does physical replay with the temporary transistor-driven LED reliably reproduce the confirmed ON/OFF captures?
- Does the transistor driver and datasheet-sized resistor provide reliable IR range?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?

