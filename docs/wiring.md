# Stage 1 Wiring Reference

Use the listed connections for the current ESP32-WROOM-32 30-pin board hardware test. Keep all grounds common.

| Device | Pin | Connect to |
| --- | --- | --- |
| 2N2222 | BASE | GPIO 25 through 1kΩ resistor |
| 2N2222 | EMITTER | GND |
| 2N2222A | COLLECTOR | Temporary harvested IR LED cathode (-) |
| Temporary harvested IR LED | Anode (+) | ESP32 5V/VIN through its series current-limiting resistor |
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

## IR transmitter

For current testing, use the **temporary harvested IR LED from the previous 3-pin transmitter module**. Its wavelength and electrical ratings are unconfirmed, so do not label it 940 nm or assume a current rating. Keep its existing series resistor; verify the actual resistor value and wiring before power-up. The final transmitter LED is planned to be a bare 5mm 940 nm IR LED. When it is available, choose its series resistor using that LED's datasheet rather than assuming the temporary LED's resistor is suitable.

```text
GPIO 25 ── 1kΩ ── 2N2222A BASE
                    EMITTER ── GND
                    COLLECTOR ── temporary harvested IR LED cathode (-)
5V/VIN ── series resistor ── temporary harvested IR LED anode (+)
```

Verify BASE/COLLECTOR/EMITTER against the exact 2N2222A package pinout; pin order varies by manufacturer and package. The flat face alone is not enough to assume the pin order. Identify LED polarity from its datasheet or with diode-test mode. Measure the board's 5V/VIN rail and keep all grounds common. Never connect 5V/VIN to an ESP32 GPIO or 3V3.

GPIO HIGH drives the transistor on, so retain `IR_SEND_INVERTED=false`. Recommended: a **100nF ceramic capacitor across the IR receiver's VCC and GND**, close to its power pins.

## Notes

- The current test AC is an AUX DC inverter. Its original remote is needed to capture genuine commands.
- Verify LED polarity and the actual series resistor before powering. The harvested LED's wavelength and ratings are unknown. Phone cameras vary in IR sensitivity, so camera visibility is not a definitive emission test. Initially test 10–20 cm from the AC receiver; physical AC response is required to verify transmission and range.
- DHT22 modules vary. This wiring reference does not assume an onboard or external DATA pull-up resistor; confirm the requirement for the specific module if readings fail.
- The buttons use the ESP32's internal pull-up resistors. Each button is active LOW: connect it only between its GPIO and GND; do not connect it to 3.3V.
- On four-leg tactile switches, use terminals that are disconnected when released and connected when pressed; two legs may already be joined internally. Check continuity before wiring.
- Power the development board via its USB connector for power-bank operation. Do not connect USB 5V to the 3V3 rail or a GPIO. Verify the power bank does not shut down automatically at idle.
- The sketch samples buttons with 50 ms debounce and sends once per press. Release a button held during boot before using it. See [test-plan.md](test-plan.md) for verification.
