# Stage 1 Wiring Reference

Use the listed connections for the current ESP32-WROOM-32 30-pin board hardware test. Keep all grounds common.

| Device | Pin | Connect to |
| --- | --- | --- |
| 2N2222A | BASE | GPIO 25 through 1kΩ resistor |
| 2N2222A | EMITTER | GND |
| 2N2222A | COLLECTOR | Both IR LED cathodes (-), after checking combined driver current |
| IR LED 1 | Anode (+) | 5V/VIN through its own series current-limiting resistor R1 |
| IR LED 2 | Anode (+) | 5V/VIN through its own series current-limiting resistor R2 |
| IR receiver | Removed from Panasonic device sketches | GPIO 27 is unused; disconnect SIGNAL, VCC and GND |
| DHT22 | DATA | ESP32 GPIO 32 |
| DHT22 | VCC | ESP32 3.3V |
| DHT22 | GND | ESP32 GND |
| Physical ON/OFF buttons | Removed from prototype | Not connected |

## IR transmitter

The requested two-LED arrangement uses the same GPIO 25 transistor driver. Each LED emits the same ON/OFF waveform; aim one toward each AC's IR sensor. This arrangement assumes both ACs accept the saved Panasonic frames. It does not independently address the two units, and IR LEDs transmit commands rather than supplying electrical power to the ACs.

The existing temporary harvested LED's wavelength and electrical ratings are unconfirmed. The second LED's model/ratings are also not recorded. Use a separate current-limiting resistor for each LED. Do not simply parallel bare LEDs or use one shared resistor. Choose R1/R2 from each LED's forward voltage, rated current and measured supply: approximately R = (Vsupply - Vf - VCE(sat)) / Iled, with adequate resistor power rating.

```text
GPIO 25 ── base resistor ── 2N2222A BASE
                            EMITTER ── GND
                            COLLECTOR ──┬── LED 1 cathode (-)
                                        └── LED 2 cathode (-)
5V/VIN ── R1 ── LED 1 anode (+)
5V/VIN ── R2 ── LED 2 anode (+)
```

The previous base resistor is 1kΩ. Before adding the second branch, verify that the transistor, base drive, supply and resistors support I_LED1 + I_LED2 at the transmitted pulse duty cycle. The existing 1kΩ value is not a verified two-LED design. If the shared driver is inadequate, use correctly rated separate driver stages driven by the same GPIO, after checking total GPIO base/gate loading. Exact replacement resistor values cannot be specified without the component ratings. Test one LED/AC at a time, then both together.

Verify BASE/COLLECTOR/EMITTER against the exact 2N2222A package pinout; pin order varies by manufacturer and package. The flat face alone is not enough to assume the pin order. Identify LED polarity from its datasheet or with diode-test mode. Measure the board's 5V/VIN rail and keep all grounds common. Never connect 5V/VIN to an ESP32 GPIO or 3V3.

GPIO HIGH drives the transistor on, so retain `IR_SEND_INVERTED=false`. The Panasonic device sketches no longer initialize an IR receiver or accept `capture`/`replay` commands. The older AUX capture sketch remains available separately if new captures are needed.

## Notes

- The active numbered sketches send the recorded Panasonic raw frames. Compatibility and physical response must be checked independently on both ACs. Earlier AUX capture records remain in the repository.
- Verify LED polarity and the actual series resistor before powering. The harvested LED's wavelength and ratings are unknown. Phone cameras vary in IR sensitivity, so camera visibility is not a definitive emission test. Initially test 10–20 cm from the AC receiver; physical AC response is required to verify transmission and range.
- DHT22 modules vary. This wiring reference does not assume an onboard or external DATA pull-up resistor; confirm the requirement for the specific module if readings fail.
- Power the development board via its USB connector for power-bank operation. Do not connect USB 5V to the 3V3 rail or a GPIO. Verify the power bank does not shut down automatically at idle.
- The current sketch controls the AC through Serial, daily schedules, or authenticated website commands. See [live setup](live-setup.md) for Wi-Fi provisioning.

