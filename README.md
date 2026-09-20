# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for the design and development of an IoT-based air-conditioning control and energy-monitoring system. This repository currently covers only Stage 1 hardware testing: confirming that an ESP32 can read the DHT22, capture the AUX remote's IR commands, and replay verified ON/OFF signals.

## Current hardware

- ESP32-WROOM-32, 30-pin board
- DHT22 temperature and humidity sensor
- IR receiver
- Temporary harvested IR LED from previous transmitter module, driven by a 2N2222 with 1kΩ base and 100Ω LED resistors
- Planned final LED: bare 5mm 940 nm IR LED (not yet available)
- Test air conditioner: AUX DC inverter, with original remote
- Future implementation air conditioner: Panasonic window type

## Current pin connections

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| IR driver | Base through 1kΩ resistor | GPIO 25 |
| IR driver | 2N2222 emitter | GND |
| IR driver | 2N2222 collector | Harvested LED cathode (-) |
| Harvested LED | Anode (+) through 100Ω resistor | 5V/VIN (verify board rail) |
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

See [docs/wiring.md](docs/wiring.md) for the wiring reference. The old 3-pin transmitter module is no longer connected; only its removed LED is reused. Its wavelength, current rating, and polarity are unconfirmed—do not describe it as a confirmed 940 nm LED. The 100Ω resistor is the requested test value, not a validated current rating for this unknown LED.

Temporary circuit: GPIO 25 → 1kΩ → 2N2222 base; emitter → GND; collector → LED cathode; LED anode → 100Ω → board 5V/VIN. Keep all grounds common. Verify the transistor pinout, LED polarity, and the board's actual 5V rail before powering. `IR_SEND_INVERTED` remains false. Recommended: 100nF ceramic capacitor across IR receiver VCC/GND, close to the receiver.

Initially test 10–20 cm from the AC receiver. If possible, compare IR emission with the original remote using a phone camera; some cameras filter IR. Only the AC's physical response verifies transmission. A proper bare 5mm 940 nm LED remains planned; select its resistor from its actual specifications when available.

## Future system architecture (not implemented)

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

The sketch defaults to Wi-Fi and NTP disabled. If you enable them later, define `WIFI_SSID` and `WIFI_PASSWORD` in a local `wifi_credentials.h` file; it is ignored by Git. Wi-Fi and NTP use the ESP32 Arduino core's built-in `WiFi.h` and `time.h`.

## Run Stage 1

1. Wire the components exactly as shown in [docs/wiring.md](docs/wiring.md).
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**, with **Newline**, **Carriage return**, or **Both NL & CR** enabled. Commands are processed only when a line ends.
6. Run `status`, then `dht` to confirm sensor readings.
7. Aim the AUX remote at the IR receiver and press its ON and OFF commands separately. Copy each printed source/raw capture into a documented capture record.
8. The current ON/OFF commands use the original remote's confirmed COOLIX captures: ON `0xB21F38`, OFF `0xB27BE0`. Use `on` and `off` to test actual AC response. If neither works, follow [IR troubleshooting](docs/ir-troubleshooting.md), including the `capture` / `replay` diagnostic. The older ELECTRA_AC captures remain archived under `docs/ir-captures/`.

Available serial commands: `status`, `dht`, `time`, `on`, `off`, `capture`, and `replay`. `capture` records the next non-overflowed, non-repeat remote frame in RAM and pauses DHT/local sending for up to 60 seconds. `replay` transmits its raw timings at 38 kHz. Neither command changes the permanent ON/OFF states.

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

This executes the actual sketch with mocked GPIO, clock, Serial, DHT, and IR interfaces. It checks debounce, holding/releasing buttons, boot behavior, timer rollover, Serial line handling, checksum rejection, and DHT/receiver control flow. It cannot verify electrical timing, IR range, sensor accuracy, or AC behavior.

## Local web controller test

The ESP32 can serve a simple local control page with ON and OFF buttons. This is a local-network test only; it is not GitHub Pages or cloud control.

1. Create `firmware/stage1_hardware_test/wifi_credentials.h` locally. Do not commit it.
2. Add your network values:
   ```cpp
   #define WIFI_SSID "your-network-name"
   #define WIFI_PASSWORD "your-network-password"
   ```
3. Enable Wi-Fi locally by changing the default `ENABLE_WIFI` value to `true` in `stage1_hardware_test.ino`.
4. Upload the sketch and open Serial Monitor at 115200 baud.
5. On a device connected to the same Wi-Fi network, open the printed `http://` address.

The ESP32 uses its own local IP address. `http://localhost` on a laptop or phone does not reach the ESP32.

Wi-Fi connects in the background and prints its address when connected, including after a reconnect. Physical controls remain available while connecting. This local test page has no authentication; use a trusted test network without port forwarding.

## Working together through GitHub

Pull with `git pull --ff-only` before editing/uploading. Use small branches/PRs and wait for **Firmware checks**, which compiles both standalone and Wi-Fi modes and runs host regression tests. Record the tested commit and `status` build timestamp with hardware results using [the handoff template](docs/ir-troubleshooting.md). A GitHub push does not flash the ESP32, and passing CI does not establish physical AC replay.

## Progress checklist

- [ ] ESP32 sketch uploaded
- [ ] DHT22 produces reliable readings
- [x] AUX ON COOLIX code captured twice (`0xB21F38`)
- [x] AUX OFF COOLIX code captured twice (`0xB27BE0`)
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
- What are the harvested LED's polarity, wavelength, and current rating, and does the temporary driver provide adequate range?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?
