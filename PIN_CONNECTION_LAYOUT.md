# ESP32 Prototype Pin Connection Layout

> Quick reference. [docs/wiring.md](docs/wiring.md) is the maintained wiring guide; check it first if the two ever disagree.

## Board
ESP32-WROOM-32, 38-pin USB-C development board

## Connections

| Component | Pin | ESP32 |
|---|---|---|
| 2N2222A | BASE through 1kΩ | GPIO 25 |
| 2N2222A | BASE through 10kΩ pull-down | GND |
| 2N2222A | EMITTER | GND |
| 2N2222A | COLLECTOR | IR LED 1 and IR LED 2 cathodes (−) |
| IR LED 1 | Anode (+) through its own 100Ω | 5V/VIN |
| IR LED 2 | Anode (+) through its own 100Ω | 5V/VIN |
| DHT22 | DATA | GPIO 32 |
| DHT22 | VCC | 3.3V |
| DHT22 | GND | GND |
| MT3608 boost converter | OUT+ (5.00 V) / OUT− | 5V/VIN / GND |
| IR receiver, ON/OFF buttons | Removed | GPIO 26, 27, 33 unused |

## Simple Layout

```text
ESP32-WROOM-32
38-pin USB-C Dev Board

3V3  ---------------------------------------> DHT22 VCC

GND  -----------------------------------+--> DHT22 GND
                                       +--> 2N2222A EMITTER
                                       +--> 10kΩ base pull-down
                                       +--> MT3608 OUT-

5V/VIN <------------------------------------ MT3608 OUT+ (5.00 V)
5V/VIN ----- 100Ω ------------------------> IR LED 1 anode (+)
5V/VIN ----- 100Ω ------------------------> IR LED 2 anode (+)

GPIO 32 ------------------------------------> DHT22 DATA

GPIO 25 ---- 1kΩ ---- 2N2222A BASE (10kΩ to GND)
                     COLLECTOR <---- IR LED 1 and IR LED 2 cathodes (-)

GPIO 26, GPIO 27, GPIO 33 --- unused
```

## Notes

- Set the MT3608 output to 5.00 V before connecting it to the ESP32.
- Verify each LED's polarity and the exact 2N2222A pinout before powering. Keep all grounds common and `IR_SEND_INVERTED=false`.
- Check that the transistor and supply can handle both LED currents together.
- A bare 4-pin DHT22 also needs a 10kΩ pull-up from DATA to 3.3V; a 3-pin module doesn't.
- Aim one IR LED at each AC's IR sensor. Start 10–20 cm away; only the AC's physical response verifies transmission.
