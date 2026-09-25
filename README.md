# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for an IoT-based air-conditioning controller. Stage 1 focuses on DHT22 readings, IR capture, and testing AUX ON/OFF replay from the ESP32.

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
| ON button | One terminal | GPIO 33 |
| ON button | Other terminal | GND |
| OFF button | One terminal | GPIO 26 |
| OFF button | Other terminal | GND |

See [docs/wiring.md](docs/wiring.md) for the temporary harvested-LED wiring. The final transmitter LED is planned to be a bare 5mm 940 nm IR LED, but its replacement series resistor must be selected from that LED's datasheet; do not assume the temporary LED has the same ratings.

Transmitter circuit: GPIO 25 → 1kΩ → 2N2222A base; emitter → GND; collector → harvested LED cathode; LED anode → its existing series resistor → board 5V/VIN. Keep grounds common. The harvested LED's wavelength and electrical ratings are unknown; do not infer them from the old module. Verify transistor pinout, LED polarity, resistor, and 5V rail before powering. `IR_SEND_INVERTED` remains false. Recommended: 100nF ceramic capacitor across IR receiver VCC/GND, close to the receiver.

Initially test 10–20 cm from the AC receiver. Phone-camera visibility depends on the camera and the LED; failure to see a flash alone does not prove the LED is off. Only the AC's physical response verifies transmission.

## Future system architecture (not implemented)

For the next website session, start with [the website handoff](docs/website-handoff.md). It records the verified GitHub, Supabase, and Cloudflare setup and the remaining device-control work.

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

Design rule: the ESP32 will eventually execute schedules locally. A browser must not need to remain open for an AC command to run at its scheduled time.

## Current development stage

**Stage 1 — hardware test**, with optional local ESP32 web control. Cloud website/Supabase, scheduling, temperature automation, and energy monitoring remain future work.

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

Use ESP32 board package **2.0.17**, IRremoteESP8266 **2.8.6**, DHT sensor library **1.4.6**, and Adafruit Unified Sensor **1.1.15** for the build checked during this audit. Newer ESP32 cores are not verified here.

The Stage 1 sketch is standalone: Wi-Fi, web service, and NTP are removed while validating IR control.

## Run Stage 1

1. Wire the components exactly as shown in [docs/wiring.md](docs/wiring.md).
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**, with **Newline**, **Carriage return**, or **Both NL & CR** enabled. Commands are processed only when a line ends.
6. Run `status`, then `dht` to confirm sensor readings.
7. Aim the AUX remote at the IR receiver and press its ON and OFF commands separately. Copy each printed source/raw capture into a documented capture record.
8. Current commands follow the latest button-labeled remote captures: ON sends COOLIX `0xB21F48`; OFF replays the saved 199-timing raw frame because its decoder result was UNKNOWN. Use `on` and `off` to test actual AC response. If either fails, follow [IR troubleshooting](docs/ir-troubleshooting.md), including the `capture` / `replay` diagnostic. Earlier captures remain archived under `docs/ir-captures/`.

Available serial commands: `status`, `dht`, `on`, `off`, `testir`, `capture`, and `replay`. `testir` sends repeated 38 kHz bursts for an optical emission check; a camera may filter them. `capture` records the next non-overflowed, non-repeat remote frame in RAM and pauses DHT reads for up to 60 seconds. `replay` transmits the captured raw timings at 38 kHz.

Only `firmware/stage1_hardware_test/stage1_hardware_test.ino` is maintained. The root `esp32_stage1_hardware_test.ino` is a retired marker that deliberately stops compilation and points to the maintained sketch.

## Standalone buttons and USB power

Buttons use `INPUT_PULLUP`: press connects GPIO 33 (ON) or GPIO 26 (OFF) to GND. A state must remain stable for 50 ms. Holding a button sends once; release for at least 50 ms before pressing again. A button held during boot must first be released. Both buttons pressed together can send both commands (ON is polled first); use one at a time.

Upload once, disconnect the laptop, and power the board through its USB connector using a power bank. The sketch does not wait for Serial, Wi-Fi, or a browser and sends nothing automatically at boot. Check that the power bank stays on under this load. IR transmission and capture printing briefly occupy the loop; very short presses during those operations may be missed. DHT22 readings run every two seconds; `dht` may return the library's cached reading within that interval.

Follow [the hardware test checklist](docs/test-plan.md) before marking Stage 1 complete.

## Software checks

With the versions above installed, build without uploading:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/stage1_hardware_test
```

Run the host control-flow check with Python 3 and a C++17 compiler:

```sh
python tests/test_stage1.py
# Or pass the full path to clang++ or g++ as the first argument.
```

This executes the actual sketch with mocked GPIO, clock, Serial, DHT, and IR interfaces. It checks debounce, holding/releasing buttons, boot behavior, timer rollover, Serial line handling, and DHT/receiver control flow. It cannot verify electrical timing, IR range, sensor accuracy, or AC behavior.

## Working together through GitHub

Pull with `git pull --ff-only` before editing/uploading. Use small branches/PRs and wait for **Firmware checks**, which compiles the standalone sketch and runs host regression tests. Record the tested commit and `status` build timestamp with hardware results using [the handoff template](docs/ir-troubleshooting.md). A GitHub push does not flash the ESP32, and passing CI does not establish physical AC replay.

## Progress checklist

- [ ] ESP32 sketch uploaded
- [ ] DHT22 produces reliable readings
- [x] AUX ON COOLIX capture recorded (`0xB21F48`, 2026-09-23)
- [x] AUX OFF raw capture stored (`UNKNOWN`, 199 timings, 2026-09-23)
- [ ] Captures documented with settings and protocol/raw data
- [ ] AUX ON replay verified
- [ ] AUX OFF replay verified
- [ ] Buttons send once per press, including power-bank operation
- [ ] Power-bank idle endurance and restart tested

## Future phases

- Local ESP32 schedule execution
- Cloud/Supabase device, schedule, command, telemetry, and event data
- HTML, CSS, and JavaScript frontend deployed with GitHub Pages
- Temperature automation
- Energy monitoring
- Panasonic window-type AC integration

## Unresolved questions

- Which exact DHT22 module variant is used, and does it require an external pull-up resistor on DATA?
- Does physical replay with the temporary transistor-driven LED reliably reproduce the confirmed ON/OFF captures?
- Does the transistor driver and datasheet-sized resistor provide reliable IR range?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?
