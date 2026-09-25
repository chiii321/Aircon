# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for an IoT-based air-conditioning controller. The current sketch adds Wi-Fi control and locally cached daily schedules to the DHT22 and AUX IR prototype. Physical AUX ON/OFF replay remains unverified.

## Current hardware

- ESP32-WROOM-32, 30-pin board
- DHT22 temperature and humidity sensor
- IR receiver
- Temporary harvested IR LED from the previous 3-pin transmitter module, driven by a 2N2222A; its wavelength and ratings are unconfirmed. A bare 5mm 940 nm IR LED is still planned.
- Test air conditioner: AUX DC inverter, with original remote
- Future implementation air conditioner: Panasonic window type

## Current pin connections

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| IR driver | Base through 1kΩ resistor | GPIO 25 |
| IR driver | 2N2222A emitter | GND |
| IR driver | 2N2222A collector | Temporary harvested IR LED cathode (-) |
| Temporary harvested IR LED | Anode (+) through series resistor | 5V/VIN |
| IR receiver | SIGNAL | GPIO 27 |
| IR receiver | VCC | 3.3V |
| IR receiver | GND | GND |
| DHT22 | DATA | GPIO 32 |
| DHT22 | VCC | 3.3V |
| DHT22 | GND | GND |
| Physical ON/OFF buttons | Removed from prototype | Not used |

See [docs/wiring.md](docs/wiring.md) for the temporary harvested-LED wiring. The final transmitter LED is planned to be a bare 5mm 940 nm IR LED, but its replacement series resistor must be selected from that LED's datasheet; do not assume the temporary LED has the same ratings.

Transmitter circuit: GPIO 25 → 1kΩ → 2N2222A base; emitter → GND; collector → harvested LED cathode; LED anode → its existing series resistor → board 5V/VIN. Keep grounds common. The harvested LED's wavelength and electrical ratings are unknown; do not infer them from the old module. Verify transistor pinout, LED polarity, resistor, and 5V rail before powering. `IR_SEND_INVERTED` remains false. Recommended: 100nF ceramic capacitor across IR receiver VCC/GND, close to the receiver.

Initially test 10–20 cm from the AC receiver. Phone-camera visibility depends on the camera and the LED; failure to see a flash alone does not prove the LED is off. Only the AC's physical response verifies transmission.

## System architecture

For upload and first connection, start with [live setup](docs/live-setup.md). The [website handoff](docs/website-handoff.md) records the earlier planning state.

```text
Website
  ↓
Cloud / Supabase
  ↓
ESP32
├── DHT22
├── IR Receiver
└── IR Transmitter → AC
```

The ESP32 executes synced schedules locally. A browser does not need to remain open for an AC command to run at its scheduled time. After an offline reboot, schedule execution waits for a valid NTP clock.

## Current development stage

**Connected prototype** — the website and cloud sync endpoint are deployed. The ESP32 has not yet been flashed or observed online in this session, and AC response remains unverified. Temperature automation and energy monitoring remain future work. See [live setup](docs/live-setup.md).

## Repository structure

```text
aircon/
├── AGENTS.md
├── README.md
├── .gitignore
├── firmware/
│   └── stage1_hardware_test/
│       └── stage1_hardware_test.ino
├── docs/
│   ├── wiring.md
│   └── ir-captures/
│       └── README.md
├── web/
│   └── index.html
└── database/
    └── schema.sql
```

## Required Arduino libraries

Install these through the Arduino IDE Library Manager:

- **DHT sensor library** by Adafruit
- **Adafruit Unified Sensor** (dependency of the DHT library)
- **IRremoteESP8266** by David Conran and contributors
- **ArduinoJson** by Benoit Blanchon

CI targets ESP32 board package **2.0.17**, IRremoteESP8266 **2.8.6**, DHT sensor library **1.4.6**, Adafruit Unified Sensor **1.1.15**, and ArduinoJson **7.4.3**. A local build succeeded with ESP32 core **3.3.11** and the installed current libraries. CI's older package combination has not yet run against this change.

The sketch uses Wi-Fi, HTTPS polling, NTP, and locally cached daily schedule windows. GPIO 33 and 26 are not used for buttons.

## Run Stage 1

1. Wire the remaining components as shown in [docs/wiring.md](docs/wiring.md), omitting the physical buttons. Follow [live setup](docs/live-setup.md) to fill the ignored local Wi-Fi credentials before upload.
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**, with **Newline**, **Carriage return**, or **Both NL & CR** enabled. Commands are processed only when a line ends.
6. Run `status`, then `dht` to confirm sensor readings.
7. Aim the AUX remote at the IR receiver and press its ON and OFF commands separately. Copy each printed source/raw capture into a documented capture record.
8. Current commands follow the latest button-labeled remote captures: ON sends COOLIX `0xB21F48`; OFF replays the saved 199-timing raw frame because its decoder result was UNKNOWN. Use `on` and `off` to test actual AC response. If either fails, follow [IR troubleshooting](docs/ir-troubleshooting.md), including the `capture` / `replay` diagnostic. Earlier captures remain archived under `docs/ir-captures/`.

Available serial commands: `status`, `dht`, `on`, `off`, `testir`, `capture`, and `replay`. `testir` sends repeated 38 kHz bursts for an optical emission check; a camera may filter them. `capture` records the next non-overflowed, non-repeat remote frame in RAM and pauses DHT reads for up to 60 seconds. `replay` transmits the captured raw timings at 38 kHz.

Only `firmware/stage1_hardware_test/stage1_hardware_test.ino` is maintained. The root `esp32_stage1_hardware_test.ino` is a retired marker that deliberately stops compilation and points to the maintained sketch.

## USB power

Upload once, disconnect the laptop, and power the board through its USB connector using a power bank. The sketch starts Wi-Fi without blocking boot and sends no IR automatically at boot. Keep the power bank on under this load. DHT22 readings run every two seconds; `dht` may return the library's cached reading within that interval.

Follow [the hardware test checklist](docs/test-plan.md) before marking Stage 1 complete.

## Software checks

With the versions above installed, build without uploading:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/stage1_hardware_test
```

The old `tests/test_stage1.py` still targets the retired button behavior and is not part of current CI. The firmware compile checks integration; physical IR and network behavior require a device test.

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

- Which exact DHT22 module variant is used, and does it require an external pull-up resistor on DATA?
- Does physical replay with the temporary transistor-driven LED reliably reproduce the confirmed ON/OFF captures?
- Does the transistor driver and datasheet-sized resistor provide reliable IR range?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?
