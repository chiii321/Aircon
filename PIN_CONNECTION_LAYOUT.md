# ESP32 Prototype Pin Connection Layout

## Board
ESP32-WROOM-32, 30-pin development board

## Connections

| Component | Pin | ESP32 |
|---|---|---|
| 2N2222 | BASE through 1kΩ | GPIO 25 |
| 2N2222 | EMITTER | GND |
| 2N2222 | COLLECTOR | Harvested LED cathode (-) |
| Harvested IR LED | Anode (+) through 100Ω | 5V/VIN (verify board rail) |
| IR Receiver (KY-022 / VS1838B style) | S / SIGNAL | GPIO 27 |
| IR Receiver | + / VCC | 3.3V |
| IR Receiver | - / GND | GND |
| DHT22 3-pin module | DATA / OUT | GPIO 32 |
| DHT22 3-pin module | VCC | 3.3V |
| DHT22 3-pin module | GND | GND |
| Physical ON/OFF buttons | Removed | GPIO 33 and 26 unused |

## Simple Layout

```text
ESP32-WROOM-32
30-pin Dev Board

3V3  -----------------------------------+--> DHT22 VCC
                                       +--> IR Receiver VCC

GND  -----------------------------------+--> DHT22 GND
                                       +--> IR Receiver GND
                                       +--> 2N2222 EMITTER

GPIO 32 ------------------------------------> DHT22 DATA

GPIO 27 <------------------------------------ IR Receiver SIGNAL

GPIO 25 ---- 1kΩ ---- 2N2222 BASE
                     COLLECTOR ---- harvested IR LED cathode (-)
5V/VIN ----- 100Ω ------------------ harvested IR LED anode (+)

GPIO 33, GPIO 26 --- unused (buttons removed)
```

## Notes

- The current sketch no longer reads physical buttons. See [docs/live-setup.md](docs/live-setup.md) for Wi-Fi and website setup.

- Start the DHT22 and IR receiver at 3.3V.
- Current emitter: temporary harvested IR LED from previous transmitter module. The module board is not used; LED wavelength, current rating, and polarity are unconfirmed. A bare 5mm 940 nm LED is planned, not yet available.
- Verify LED polarity, exact 2N2222 pinout and board 5V/VIN rail before powering. The 100Ω test value does not establish a safe current for an unknown LED. Keep all grounds common and `IR_SEND_INVERTED=false`.
- Recommended: 100nF ceramic capacitor across IR receiver VCC/GND close to the receiver.
- Start 10–20 cm from the AC receiver. A phone camera may help detect IR emission, but actual AC response is required to verify transmission.
- Keep the IR transmitter pointed toward the AC's IR receiver.
- Keep the IR receiver positioned so the AUX remote can be aimed directly at it during capture.
