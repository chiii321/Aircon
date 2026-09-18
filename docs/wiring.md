# Stage 1 Wiring Reference

Use the listed connections for the current ESP32-WROOM-32 30-pin board hardware test. Keep all grounds common.

| Device | Pin | Connect to |
| --- | --- | --- |
| IR transmitter | DAT | ESP32 GPIO 25 |
| IR transmitter | VCC | ESP32 3.3V initially |
| IR transmitter | GND | ESP32 GND |
| IR receiver | SIGNAL | ESP32 GPIO 27 |
| IR receiver | VCC | ESP32 3.3V |
| IR receiver | GND | ESP32 GND |
| DHT22 | DATA | ESP32 GPIO 32 |
| DHT22 | VCC | ESP32 3.3V |
| DHT22 | GND | ESP32 GND |

## Notes

- The current test AC is an AUX DC inverter. Its original remote is needed to capture genuine commands.
- Start the IR transmitter at 3.3V as specified. Do not assume its range is adequate until replay is physically verified.
- DHT22 modules vary. This wiring reference does not assume an onboard or external DATA pull-up resistor; confirm the requirement for the specific module if readings fail.
