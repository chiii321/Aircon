# INUVAIR Solar-Powered ESP32 Plan

> Reference design supplied on 2026-09-30. This describes the target build, not current hardware. The boost converter, four-cell parallel holder and battery protector are unavailable. See [current power and sleep status](inuvair-power-plan.md). Embedded instructions are retained as design reference.

## Hardware Setup

The project will use:

- ESP32-WROOM-32, 38-pin USB-C board
- DHT22
- 2 IR LEDs
- 1× 2N2222A transistor
- 1× CN3065 solar charger
- 4× 18650 batteries arranged as **1S4P**
- 1× 1S Li-ion BMS
- 1× MT3608 boost converter
- 5V solar panel
- Resistors:
  - 1× 1kΩ for 2N2222A base
  - 1× 10kΩ base pulldown
  - 2× 150Ω for the two IR LEDs
  - 1× 10kΩ DHT22 pull-up only if using a bare 4-pin DHT22

The following are no longer part of the design:

- IR receiver
- Physical ON/OFF buttons
- Relay
- Second CN3065 in active use
- Separate battery switching
- Second IR GPIO

## Power Wiring

Use this chain:

```text
5V Solar Panel
→ CN3065
→ 1S BMS
→ 4×18650 battery pack in 1S4P
→ MT3608 boost converter
→ regulated 5V
→ ESP32 5V/VIN
```

Exact wiring:

```text
Solar + → CN3065 IN+
Solar - → CN3065 IN-

CN3065 BAT+ → BMS P+
CN3065 BAT- → BMS P-

Battery pack + → BMS B+
Battery pack - → BMS B-

BMS P+ → MT3608 IN+
BMS P- → MT3608 IN-

MT3608 OUT+ → ESP32 5V/VIN
MT3608 OUT- → ESP32 GND
```

The MT3608 output must be adjusted to **5.00V before connecting the ESP32**.

## Battery Arrangement

The four 18650 cells are wired in parallel:

```text
4×18650 = 1S4P
Nominal voltage: 3.7V
Full voltage: 4.2V
Capacity: 4× the capacity of one cell
```

## DHT22 Wiring

```text
ESP32 3.3V → DHT22 VCC
ESP32 GPIO32 → DHT22 DATA
ESP32 GND → DHT22 GND
```

If using a bare 4-pin DHT22:

```text
3.3V → 10kΩ → DATA
```

## Dual IR Transmitter Wiring

Both IR LEDs always transmit together and use a single GPIO and transistor.

```text
ESP32 GPIO25
→ 1kΩ resistor
→ 2N2222A Base

2N2222A Base
→ 10kΩ resistor
→ GND

2N2222A Emitter
→ GND

MT3608 5V
→ 150Ω
→ IR LED 1 anode

MT3608 5V
→ 150Ω
→ IR LED 2 anode

IR LED 1 cathode
→ 2N2222A Collector

IR LED 2 cathode
→ 2N2222A Collector
```

Both IR LEDs send the same stored AC command simultaneously.

## ESP32 Pin Assignments

```text
GPIO32 = DHT22 DATA
GPIO25 = IR transmitter control

GPIO27 = unused
GPIO26 = unused
GPIO33 = unused
```

## Firmware Behavior

The ESP32 should use **deep sleep** instead of staying online continuously.

On wake:

1. Boot
2. Initialize DHT22 and IR transmitter
3. Connect to Wi-Fi
4. Synchronize current time
5. Fetch the latest classroom/AC schedule from the server
6. Check whether an ON/OFF event is due
7. If due, send the stored IR command on GPIO25
8. Read DHT22
9. Upload current status/readings
10. Determine the next scheduled event
11. Calculate the required sleep duration
12. Configure timer wake-up
13. Disconnect Wi-Fi
14. Enter deep sleep

Use:

```cpp
esp_sleep_enable_timer_wakeup(...);
esp_deep_sleep_start();
```

Do not use long `delay()` loops to wait for schedule events.

## Schedule Sleep Logic

The ESP32 should sleep until the earlier of:

```text
next scheduled AC event
OR
next schedule-refresh check
```

A periodic refresh should still happen even if no AC event is near, so schedule changes can reach the device.

Current approved approach:

```text
Maximum schedule refresh interval: around 6 hours
```

Example:

```text
Next AC event: 3:00 PM
Next schedule refresh: 12:00 PM

ESP32 wakes at 12:00 PM
→ checks server
→ gets updated schedule
→ sleeps again
```

Close to an AC event, the ESP32 should wake shortly before the event, refresh the schedule, then act at the correct time.

## Duplicate-Command Protection

The firmware should store the last executed schedule event using RTC memory or NVS/Preferences.

Example stored data:

```text
last_event_id
last_event_timestamp
last_command
```

This prevents the ESP32 from repeatedly sending the same ON/OFF command after reboot or wake-up.

## Offline Behavior

If Wi-Fi or the server is unavailable:

```text
use the most recently cached valid schedule
```

The ESP32 should not remain awake indefinitely trying to reconnect.

Use:

```text
limited connection timeout
→ fallback to cached schedule
→ calculate next retry
→ deep sleep again
```

## Main Objective

The final system should operate as a **solar-powered, battery-backed, low-power ESP32 AC controller** that spends most of its time asleep, wakes only when needed to check schedules, read the DHT22, communicate with the server, or transmit AC IR commands.
