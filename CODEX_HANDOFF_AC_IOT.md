# CODEX HANDOFF — IoT Air Conditioning Control and Energy Monitoring System

> Historical planning document. Current Stage 1 instructions are in [README.md](README.md) and [docs/wiring.md](docs/wiring.md). The maintained sketch is `firmware/stage1_hardware_test/stage1_hardware_test.ino`; the root sketch is retired. ON/OFF buttons are GPIO 33/26. ELECTRA_AC capture labels are now confirmed from actual AUX behavior and must not be reversed from inferred protocol bits. The old 3-pin transmitter described below has been replaced by a temporary harvested IR LED driven by a 2N2222 (see current wiring docs); its wavelength/current rating/polarity are unconfirmed. A proper 5mm 940 nm LED is planned. Replay on the new circuit remains unverified. Statements below about missing captures and immediate setup actions describe the original handoff, not current status. Website, cloud, scheduling, automation, and energy monitoring remain future work.

## 1. Project

**Title:** Design and Development of an IoT-Based Air Conditioning Control and Energy Monitoring System

The project is being rebuilt essentially from scratch.

The user wants a system where a website communicates with ESP32 devices that control air conditioners through infrared transmission.

The prototype should begin with one AC, then scale to multiple AC units later, with one ESP32 per AC.

---

## 2. Confirmed Goals

The system should eventually support:

- Automatic AC scheduling from a website.
- Example: schedule 07:30-08:00.
  - At 07:30 the ESP32 sends the AC ON command.
  - At 08:00 the ESP32 sends the AC OFF command.
- Manual ON/OFF control from the website.
- Manual control should temporarily override schedule behavior.
- DHT22 temperature and humidity monitoring.
- Temperature should eventually influence whether the AC turns on or off.
- Real-time or near-real-time display of:
  - temperature
  - humidity
  - current time
  - AC state
  - active/current schedule
  - next scheduled action
  - ESP32 online/offline state
- Energy monitoring.
- Support for multiple ACs later.

---

## 3. AC Units

### Test AC
- Brand: AUX
- Type: DC inverter
- Original remote: available
- IR signals: not yet captured

### Intended implementation AC
- Brand: Panasonic
- Type: window type
- Original remote: not currently available

Development should start using the AUX unit because the original remote is available.

---

## 4. Current Hardware

- ESP32-WROOM-32
- 30-pin development board
- DHT22 3-pin module
- 3-pin IR transmitter module marked DAT / VCC / GND
- IR receiver being added, likely KY-022 / VS1838B-style 38 kHz receiver

Energy-monitoring hardware is not selected yet.

---

## 5. Recommended Pin Map

| Component | Module Pin | ESP32 Pin |
|---|---|---|
| IR transmitter | DAT | GPIO 25 |
| IR transmitter | VCC | 3.3V initially |
| IR transmitter | GND | GND |
| IR receiver | SIGNAL / S | GPIO 27 |
| IR receiver | VCC / + | 3.3V |
| IR receiver | GND / - | GND |
| DHT22 3-pin module | DATA / OUT | GPIO 32 |
| DHT22 3-pin module | VCC | 3.3V |
| DHT22 3-pin module | GND | GND |

### Electrical notes

- Start DHT22 and IR receiver on 3.3V.
- Start the pictured IR transmitter on 3.3V for safe prototype testing.
- Do not assume VIN/5V is correct for the transmitter until its circuit is verified.
- If IR range is weak, add a proper transistor or MOSFET driver rather than overloading an ESP32 GPIO.
- The final transmitter must have line-of-sight and enough optical power to reach the AC IR receiver.

---

## 6. Existing Old Code

The previous sketch should not be used as the main base.

Problems:
- IR TX pin was GPIO 4, while current wiring is GPIO 25.
- It referred to an Astron AC, but the test AC is AUX.
- ON/OFF raw arrays were empty.
- No IR receiver/capture logic.
- No DHT22 logic.
- No scheduler.
- No NTP/current time.
- No cloud/backend/database.
- No temperature automation.
- No energy monitoring.
- It hosted a local WebServer directly on the ESP32, which is not the preferred final architecture.

Treat it only as historical context.

---

## 7. Recommended Architecture

```text
                     INTERNET
                        |
          +-------------+--------------+
          |                            |
    GitHub Pages                    Supabase
    Web Frontend                    Cloud Backend
    HTML/CSS/JS                     PostgreSQL
          |                            |
          +-------------+--------------+
                        |
                      Wi-Fi
                        |
                      ESP32
          +-------------+-------------+
          |             |             |
        DHT22       IR Receiver   IR Transmitter
          |                           |
          |                           v
          |                         AC Unit
          |
          +---- temperature/humidity telemetry
```

### Important scheduling rule

The website should **not** be responsible for staying open and sending an ON/OFF command at the exact schedule time.

Preferred behavior:

1. User creates or edits schedule on website.
2. Schedule is saved in cloud database.
3. ESP32 syncs/downloads relevant schedules.
4. ESP32 maintains correct time using NTP.
5. ESP32 decides locally when a schedule boundary occurs.
6. ESP32 sends IR ON/OFF locally.

Eventually the ESP32 should cache enough schedule data to continue operating temporarily if the cloud or internet becomes unavailable.

---

## 8. GitHub / GitHub Pages / Database Direction

Recommended:

### GitHub
Use for:
- source repository
- version control
- collaboration
- documentation
- GitHub Pages static frontend

Do **not** use GitHub itself as the database.

### Supabase
Recommended for:
- PostgreSQL database
- schedules
- device registry
- commands
- telemetry
- AC status
- heartbeat/online status
- user/authentication later
- realtime dashboard updates

---

## 9. Development Order

### Stage 1 — Hardware diagnostics
Verify:
- ESP32 boots
- DHT22 works
- IR receiver sees AUX remote
- IR transmitter is connected correctly

### Stage 2 — Capture AUX remote
Capture at minimum:
- AUX ON
- AUX OFF

Record the full remote state when capturing:
- power
- temperature
- mode
- fan
- swing
- other active settings

### Stage 3 — Replay AUX IR
ESP32 must reliably reproduce:
- ON
- OFF

Repeat multiple times.

### Stage 4 — Wi-Fi and NTP
Add:
- Wi-Fi connection
- reconnect behavior
- UTC+8 Philippine time
- correct current time

### Stage 5 — Local scheduler
Prove scheduling locally before cloud integration.

### Stage 6 — Supabase
Design cloud database.

### Stage 7 — ESP32 <-> cloud
Implement reliable synchronization.

### Stage 8 — Web dashboard
Add scheduling, status, telemetry.

### Stage 9 — Manual override
Implement proper state precedence.

### Stage 10 — Temperature automation
Only after schedule logic is stable.

### Stage 11 — Energy monitoring
Select safe hardware and integrate.

### Stage 12 — Multi-device support
One ESP32 per AC with unique device identity.

---

## 10. Arduino Libraries for Stage 1

Install:

- IRremoteESP8266 by David Conran
- DHT sensor library by Adafruit
- Adafruit Unified Sensor

ESP32 board package must also be installed.

Likely Arduino IDE board selection:
- ESP32 Dev Module

Adjust later if the exact board profile requires it.

---

## 11. Stage 1 Firmware

A starter file has already been created:

`esp32_stage1_hardware_test.ino`

It currently supports:

- DHT22 reading on GPIO 32
- IR receive on GPIO 27
- IR transmit on GPIO 25
- dumping captured IR data to Serial
- optional Wi-Fi
- optional NTP time
- serial commands:
  - `status`
  - `dht`
  - `time`
  - `on`
  - `off`

The `on` and `off` commands intentionally do nothing useful until real AUX captures are inserted.

---

## 12. IR Capture Rules

Air-conditioner remotes often send a complete state frame, not just a simple one-button code.

For every capture, save:
- decoded protocol
- state bytes if available
- raw timing data
- visible remote settings at time of capture

Suggested labels:

```text
AUX_POWER_ON_24C_COOL_AUTO
AUX_POWER_OFF
```

If IRremoteESP8266 recognizes AUX with a native AC protocol implementation, prefer using the library's AC-specific class later.

Use raw replay as fallback.

---

## 13. Manual Override Requirement

Confirmed:
- manual web ON/OFF is required
- manual action should temporarily override schedule

Do not implement this as a random boolean.

Use an explicit control model later, for example:

```text
SCHEDULE
MANUAL_ON
MANUAL_OFF
TEMPERATURE_AUTO
```

Exact precedence still needs user confirmation.

---

## 14. Real AC State Requirement

The user wants the system to know if someone uses the physical AC remote.

Therefore, do not assume:
- transmitted ON = AC definitely ON
- transmitted OFF = AC definitely OFF

Possible later strategy:
- continuously listen for physical remote IR traffic
- use energy/current sensing to verify whether the AC is actually operating
- combine both

Consider keeping separate fields such as:

```text
commanded_state
observed_state
last_ir_command
last_energy_confirmation
```

---

## 15. Scheduling Requirements Already Known

Known:
- schedule configured from website
- exact ON/OFF boundaries
- multiple ACs later
- one ESP32 per AC
- temperature influence later
- manual web control
- manual override

Still unknown:
- recurring weekday schedules
- date-specific schedules
- overlapping schedules
- restart behavior
- missed schedule handling
- override expiration
- interaction between schedule and temperature automation
- offline schedule behavior
- RTC requirement
- acceptable time error

---

## 16. How Codex Should Ask Questions

The user explicitly does **not** want another giant list of 100 questions.

Codex should:

- ask only questions that block the current implementation step
- ask around 3-5 questions at a time
- continue implementing non-blocked work
- avoid guessing important capstone behavior
- avoid side comments

### First questions after Stage 1 capture

1. What exact AUX model number is being used?
2. What default AC state should scheduled ON use? Example: Cool, 24 C, Auto fan.
3. Does the AUX remote use a power toggle or a distinct OFF state/frame?
4. What exact IR receiver output appears for AUX ON and AUX OFF?
5. Does replay reliably control the AUX unit?

### Scheduling questions later

6. Are schedules one-time, recurring, or both?
7. Can multiple schedules exist on the same day?
8. What should happen if schedules overlap?
9. If ESP32 restarts during an active schedule, should it immediately make the AC match that schedule?
10. If the ESP32 misses the scheduled start but reconnects before the end time, should it turn the AC on immediately?

### Manual override questions later

11. When should manual override expire?
12. Does it end at next schedule boundary, after a timer, or only after "Resume Schedule"?
13. What wins if manual override conflicts with temperature automation?

### Temperature automation questions later

14. What temperature thresholds are required?
15. Should temperature automation only turn AC ON/OFF, or also change setpoint?
16. Should temperature automation only operate during scheduled periods?

### Network/offline questions later

17. Should cached schedules execute without internet?
18. Is an RTC such as DS3231 acceptable?
19. How quickly must dashboard data update?
20. How stable is implementation-site Wi-Fi?

### User/account questions later

21. Is login required?
22. What user roles exist?
23. Who can modify schedules?
24. How many devices should the database support from day one?

### Energy-monitoring questions later

25. Required measurements: current, voltage, watts, kWh, cost?
26. Is direct mains wiring allowed?
27. Is non-invasive current sensing preferred?
28. Is billing-grade accuracy required or only prototype-level monitoring?

---

## 17. Possible Future Database Model

Do not finalize until schedule behavior is confirmed.

Possible tables:

### devices
```text
id
device_code
name
room
ac_brand
ac_model
online
last_seen_at
current_temperature
current_humidity
commanded_ac_state
observed_ac_state
control_mode
created_at
updated_at
```

### schedules
```text
id
device_id
name
enabled
schedule_type
start_date
end_date
start_time
end_time
days_of_week
desired_ac_state
created_at
updated_at
```

### commands
```text
id
device_id
command_type
payload
status
requested_at
executed_at
source
```

### telemetry
```text
id
device_id
temperature
humidity
power_w
energy_kwh
observed_ac_state
created_at
```

### device_events
```text
id
device_id
event_type
details
created_at
```

---

## 18. Security Rules

Never commit:
- Wi-Fi passwords
- service-role secrets
- private API keys
- production credentials

Never put a Supabase service-role key in:
- GitHub Pages JavaScript
- public GitHub repo
- ESP32 firmware committed publicly

Use Row Level Security for browser-side access.

Device authentication should be designed before deployment.

---

## 19. Suggested Repository Structure

```text
ac-iot-capstone/
|
|-- firmware/
|   |-- stage1_hardware_test/
|   |   `-- stage1_hardware_test.ino
|   |
|   `-- ac_controller/
|
|-- web/
|   |-- index.html
|   |-- css/
|   |-- js/
|   `-- assets/
|
|-- database/
|   |-- schema.sql
|   `-- migrations/
|
|-- docs/
|   |-- architecture.md
|   |-- wiring.md
|   |-- requirements.md
|   |-- test-plan.md
|   `-- ir-captures/
|
|-- .gitignore
|-- README.md
`-- LICENSE
```

---

## 20. First Milestone Definition of Done

Do not move to cloud integration until:

- ESP32 boots reliably.
- DHT22 reports plausible values.
- IR receiver captures AUX remote signals.
- AUX ON capture is saved.
- AUX OFF capture is saved.
- IR transmitter can turn AUX ON.
- IR transmitter can turn AUX OFF.
- Both operations work repeatedly.

---

## 21. Engineering Priority

Prioritize:

1. Hardware correctness
2. Reliable AC IR control
3. Local scheduling
4. State handling
5. Offline tolerance
6. Cloud synchronization
7. Website UX
8. Temperature automation
9. Energy monitoring
10. Multi-device scaling

Do not build a polished dashboard around unverified hardware.

---

## 22. Current Quick Reference

```text
Project:
Design and Development of an IoT-Based Air Conditioning
Control and Energy Monitoring System

ESP32:
ESP32-WROOM-32, 30-pin

Test AC:
AUX DC inverter
Remote available

Deployment AC:
Panasonic window type
Remote unavailable for now

IR TX:
GPIO 25

IR RX:
GPIO 27 recommended

DHT22:
GPIO 32
3-pin module

IR commands:
Not captured yet

Immediate milestone:
Capture AUX ON/OFF and replay reliably

Frontend later:
GitHub Pages

Backend later:
Supabase recommended

Multiple ACs:
Yes later, one ESP32 per AC

Manual web control:
Yes

Manual override:
Yes

Temperature control:
Yes later

Energy monitoring:
Required, sensor not selected yet
```

---

## 23. Do Not Assume

Do not silently assume:
- AUX IR protocol
- raw ON/OFF arrays
- exact AUX model
- default AC setpoint
- temperature thresholds
- manual override expiration
- recurring schedule rules
- offline behavior
- user roles
- energy sensor model
- final Panasonic IR protocol

Ask when each becomes relevant.

---

## 24. Immediate Next Actions for Codex

1. Create the repository structure.
2. Place `esp32_stage1_hardware_test.ino` under `firmware/stage1_hardware_test/`.
3. Create `docs/wiring.md` from the pin layout.
4. Create `docs/requirements.md` from this handoff.
5. Create `docs/test-plan.md`.
6. Confirm the required Arduino libraries.
7. Help the user compile and upload Stage 1.
8. Capture AUX ON/OFF from Serial Monitor.
9. Save captures under `docs/ir-captures/`.
10. Modify firmware to replay the confirmed AUX commands.
11. Do not begin Supabase/GitHub Pages implementation until this hardware milestone passes.
