# INUVAIR Solar-Powered ESP32 Hardware Plan

## Current Hardware

| Component | Quantity | Use |
|---|---:|---|
| ESP32-WROOM-32 38-pin USB-C board | 1 | Main controller |
| DHT22 | 1 | Temperature and humidity sensing |
| IR LED | 2 | Sends the same AC command to two AC units at the same time |
| 2N2222A transistor | 1 | Drives both IR LEDs |
| CN3065 solar charger | 1 | Charges the 1S battery pack from the solar panel |
| 18650 battery | 4 | Battery pack cells |
| 4-cell 18650 parallel holder | 1 | Holds the four cells as a 1S4P pack |
| 1S Li-ion BMS | 1 | Battery protection |
| MT3608 boost converter | 1 | Boosts battery voltage to regulated 5V for the ESP32 |
| 5V solar panel | 1 | Solar charging source |
| 1kΩ resistor | 1 | 2N2222A base resistor |
| 100Ω resistor | 2 | One current-limiting resistor per IR LED |
| 10kΩ resistor | 1 | 2N2222A base pulldown |
| 10kΩ resistor | 1 optional | DHT22 DATA pull-up only if using a bare 4-pin DHT22 |

## Battery Arrangement

The four 18650 cells are connected as **1S4P**.

```text
Cell 1 + ─┐
Cell 2 + ─┤
Cell 3 + ─┼── PACK +
Cell 4 + ─┘

Cell 1 - ─┐
Cell 2 - ─┤
Cell 3 - ─┼── PACK -
Cell 4 - ─┘
```

- Nominal pack voltage: **3.7V**
- Fully charged pack voltage: **4.2V**
- Total capacity: approximately four times the capacity of one cell

The holder must be a true **parallel / 1S4P** holder.

## Power Wiring

| From | To |
|---|---|
| Solar Panel **+** | CN3065 **IN+** |
| Solar Panel **−** | CN3065 **IN−** |
| CN3065 **BAT+** | BMS **P+** |
| CN3065 **BAT−** | BMS **P−** |
| 4×18650 Parallel Holder **+** | BMS **B+** |
| 4×18650 Parallel Holder **−** | BMS **B−** |
| BMS **P+** | MT3608 **IN+** |
| BMS **P−** | MT3608 **IN−** |
| MT3608 **OUT+** | ESP32 **5V/VIN** |
| MT3608 **OUT−** | ESP32 **GND** |

Set the MT3608 output to **5.00V before connecting it to the ESP32**.

## DHT22 Wiring

| From | To |
|---|---|
| ESP32 **3.3V** | DHT22 **VCC** |
| ESP32 **GPIO32** | DHT22 **DATA** |
| ESP32 **GND** | DHT22 **GND** |
| ESP32 **3.3V** | **10kΩ → DHT22 DATA** only if using a bare 4-pin DHT22 |

## Dual IR LED Wiring

Both IR LEDs are controlled by the same **GPIO25** and transmit at the same time.

| From | To |
|---|---|
| ESP32 **GPIO25** | **1kΩ resistor** |
| Other side of 1kΩ resistor | 2N2222A **Base (B)** |
| 2N2222A **Base (B)** | **10kΩ resistor → GND** |
| 2N2222A **Emitter (E)** | Common **GND** |
| MT3608 **5V OUT+** | **100Ω resistor #1** |
| 100Ω resistor #1 | IR LED #1 **Anode (+)** |
| IR LED #1 **Cathode (−)** | 2N2222A **Collector (C)** |
| MT3608 **5V OUT+** | **100Ω resistor #2** |
| 100Ω resistor #2 | IR LED #2 **Anode (+)** |
| IR LED #2 **Cathode (−)** | 2N2222A **Collector (C)** |

Each IR LED has its own **100Ω** resistor.

## ESP32 Pin Assignments

| ESP32 Pin | Function |
|---|---|
| GPIO25 | Controls both IR LEDs simultaneously through the 2N2222A |
| GPIO32 | DHT22 DATA |
| 3.3V | DHT22 power |
| 5V/VIN | Regulated 5V input from MT3608 |
| GND | Common ground |

GPIO26, GPIO27, and GPIO33 are unused in the current hardware configuration.

## Power Flow

```text
5V Solar Panel
      ↓
   CN3065
      ↓
    1S BMS ↔ 4×18650 1S4P
      ↓
   MT3608
   5.00V
      ↓
    ESP32
   ├── DHT22 on GPIO32
   └── GPIO25 → 2N2222A → IR LED #1 + IR LED #2
```

## Deep-Sleep and Schedule Operation

The ESP32 should spend most of its time in deep sleep to reduce battery consumption.

### Wake Cycle

1. Wake from deep sleep.
2. Initialize the DHT22 and IR output.
3. Connect to Wi-Fi.
4. Synchronize the current time.
5. Fetch the latest AC/classroom schedule from the server.
6. Determine whether an ON or OFF event is due.
7. If an event is due, send the saved IR command using GPIO25. Both IR LEDs transmit the command simultaneously.
8. Read the DHT22.
9. Upload the latest readings and device status.
10. Determine the next scheduled AC event.
11. Determine the next periodic schedule-refresh time.
12. Sleep until whichever occurs first.
13. Disconnect Wi-Fi and enter deep sleep.

Use ESP32 timer wake-up rather than long delay loops:

```cpp
esp_sleep_enable_timer_wakeup(...);
esp_deep_sleep_start();
```

### Sleep Timing

The ESP32 sleeps until the earlier of:

```text
next scheduled AC event
OR
next schedule-refresh check
```

The current schedule-refresh interval is approximately **6 hours maximum**, so schedule changes can still reach the device even when no AC event is nearby.

### Duplicate Command Protection

Store the last executed event in RTC memory or Preferences/NVS, such as:

```text
last_event_id
last_event_timestamp
last_command
```

This prevents the same ON/OFF command from being sent repeatedly after wake-up or reboot.

### Offline Behavior

If Wi-Fi or the server cannot be reached:

1. Stop retrying after a limited connection timeout.
2. Use the most recently cached valid schedule.
3. Calculate the next retry or scheduled wake time.
4. Return to deep sleep instead of remaining awake indefinitely.

## Current Removed Hardware

The current 1S4P design does not use:

- IR receiver
- Physical ON/OFF buttons
- Relay
- Second CN3065
- Second battery holder
- Separate IR GPIO
