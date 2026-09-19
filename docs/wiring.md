# Stage 1 Wiring Reference

Use the listed connections for the current ESP32-WROOM-32 30-pin board hardware test. Keep all grounds common.

| Device | Pin | Connect to |
| --- | --- | --- |
| 2N2222 | BASE | GPIO 25 through 1kΩ resistor |
| 2N2222 | EMITTER | GND |
| 2N2222 | COLLECTOR | Harvested IR LED cathode (-) |
| Harvested IR LED | Anode (+) | ESP32 5V/VIN through 100Ω resistor |
| IR receiver | SIGNAL | ESP32 GPIO 27 |
| IR receiver | VCC | ESP32 3.3V |
| IR receiver | GND | ESP32 GND |
| DHT22 | DATA | ESP32 GPIO 32 |
| DHT22 | VCC | ESP32 3.3V |
| DHT22 | GND | ESP32 GND |
| ON push button | One terminal | ESP32 GPIO 33 |
| ON push button | Other terminal | ESP32 GND |
| OFF push button | One terminal | ESP32 GPIO 26 |
| OFF push button | Other terminal | ESP32 GND |

## Temporary IR transmitter

Use the **temporary harvested IR LED from previous transmitter module** as a bare LED. The old module board is not used. Its wavelength, current rating, and polarity are not confirmed. A bare 5mm 940 nm IR LED is planned for the final transmitter but is not yet available.

```text
GPIO 25 ── 1kΩ ── 2N2222 BASE
                   EMITTER ── GND
                   COLLECTOR ── harvested LED cathode (-)
5V/VIN ── 100Ω ── harvested LED anode (+)
```

Verify BASE/COLLECTOR/EMITTER against the exact transistor's pinout, and identify the harvested LED's polarity before connecting it. Verify the development board's 5V/VIN pin actually supplies the intended 5V when USB-powered. Do not feed this rail into GPIOs or 3V3. The 100Ω resistor is the specified temporary test value; safe LED current is not established without its specifications. Keep all grounds common.

GPIO HIGH drives the transistor on, so retain `IR_SEND_INVERTED=false`; no driver-specific firmware change is required. Recommended: a **100nF ceramic capacitor across the IR receiver's VCC and GND**, close to its power pins.

## Notes

- The current test AC is an AUX DC inverter. Its original remote is needed to capture genuine commands.
- Verify LED polarity, check emission with a phone camera if possible (an IR-filtered camera may show nothing), and initially test 10–20 cm from the AC receiver. Physical AC response is required to verify transmission and range.
- DHT22 modules vary. This wiring reference does not assume an onboard or external DATA pull-up resistor; confirm the requirement for the specific module if readings fail.
- The buttons use the ESP32's internal pull-up resistors. Each button is active LOW: connect it only between its GPIO and GND; do not connect it to 3.3V.
- On four-leg tactile switches, use terminals that are disconnected when released and connected when pressed; two legs may already be joined internally. Check continuity before wiring.
- Power the development board via its USB connector for power-bank operation. Do not connect USB 5V to the 3V3 rail or a GPIO. Verify the power bank does not shut down automatically at idle.
- The sketch samples buttons with 50 ms debounce and sends once per press. Release a button held during boot before using it. See [test-plan.md](test-plan.md) for verification.
