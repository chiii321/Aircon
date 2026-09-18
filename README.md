# IoT-Based Air Conditioning Control and Energy Monitoring System

Capstone project workspace for the design and development of an IoT-based air-conditioning control and energy-monitoring system. This repository currently covers only Stage 1 hardware testing: confirming that an ESP32 can read the DHT22, capture the AUX remote's IR commands, and replay verified ON/OFF signals.

## Current hardware

- ESP32-WROOM-32, 30-pin board
- DHT22 temperature and humidity sensor
- IR receiver
- IR transmitter
- Test air conditioner: AUX DC inverter, with original remote
- Future implementation air conditioner: Panasonic window type

## Current pin connections

| Component | Connection | ESP32 pin |
| --- | --- | --- |
| IR transmitter | DAT | GPIO 25 |
| IR transmitter | VCC | 3.3V initially |
| IR transmitter | GND | GND |
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

See [docs/wiring.md](docs/wiring.md) for the wiring reference.

## Simple system architecture

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

**Stage 1 — hardware test.** No website, Supabase backend, scheduling, temperature automation, or energy monitoring is implemented yet.

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

The sketch defaults to Wi-Fi and NTP disabled. If you enable them later, define `WIFI_SSID` and `WIFI_PASSWORD` in a local `wifi_credentials.h` file; it is ignored by Git. Wi-Fi and NTP use the ESP32 Arduino core's built-in `WiFi.h` and `time.h`.

## Run Stage 1

1. Wire the components exactly as shown in [docs/wiring.md](docs/wiring.md).
2. Install the required Arduino libraries.
3. Open `firmware/stage1_hardware_test/stage1_hardware_test.ino` in Arduino IDE.
4. Select an ESP32 board matching the ESP32-WROOM-32 and its correct serial port, then upload.
5. Open Serial Monitor at **115200 baud**.
6. Run `status`, then `dht` to confirm sensor readings.
7. Aim the AUX remote at the IR receiver and press its ON and OFF commands separately. Copy each printed source/raw capture into a documented capture record.
8. Add only the real, verified captures to the marked `kAuxOnRaw` and `kAuxOffRaw` sections in the sketch. Upload again and use `on` and `off` to test replay.

Available serial commands: `status`, `dht`, `time`, `on`, and `off`.

## Progress checklist

- [ ] ESP32 sketch uploaded
- [ ] DHT22 produces reliable readings
- [ ] AUX remote ON captured
- [ ] AUX remote OFF captured
- [ ] Captures documented with settings and protocol/raw data
- [ ] AUX ON replay verified
- [ ] AUX OFF replay verified

## Future phases

- Local ESP32 schedule execution
- Cloud/Supabase device, schedule, command, telemetry, and event data
- HTML, CSS, and JavaScript frontend deployed with GitHub Pages
- Temperature automation
- Energy monitoring
- Panasonic window-type AC integration

## Unresolved questions

- Which exact DHT22 module variant is used, and does it require an external pull-up resistor on DATA?
- Which decoded protocol and raw timing data will the AUX remote provide?
- Does the IR transmitter circuit provide sufficient range and current at 3.3V, or will a transistor-driven supply be needed later?
- What energy-meter hardware and electrical isolation approach will be selected for the future energy-monitoring phase?
