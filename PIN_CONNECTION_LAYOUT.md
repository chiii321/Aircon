# ESP32 Prototype Pin Connection Layout

## Board
ESP32-WROOM-32, 30-pin development board

## Connections

| Component | Pin | ESP32 |
|---|---|---|
| IR Transmitter | DAT | GPIO 25 |
| IR Transmitter | VCC | 3.3V initially |
| IR Transmitter | GND | GND |
| IR Receiver (KY-022 / VS1838B style) | S / SIGNAL | GPIO 27 |
| IR Receiver | + / VCC | 3.3V |
| IR Receiver | - / GND | GND |
| DHT22 3-pin module | DATA / OUT | GPIO 32 |
| DHT22 3-pin module | VCC | 3.3V |
| DHT22 3-pin module | GND | GND |

## Simple Layout

```text
ESP32-WROOM-32
30-pin Dev Board

3V3  -----------------------------------+--> DHT22 VCC
                                       +--> IR Receiver VCC
                                       +--> IR Transmitter VCC (initial test)

GND  -----------------------------------+--> DHT22 GND
                                       +--> IR Receiver GND
                                       +--> IR Transmitter GND

GPIO 32 ------------------------------------> DHT22 DATA

GPIO 27 <------------------------------------ IR Receiver SIGNAL

GPIO 25 ------------------------------------> IR Transmitter DAT
```

## Notes

- Start the DHT22 and IR receiver at 3.3V.
- Start the pictured IR transmitter at 3.3V for safe prototype testing.
- Do not use VIN for these modules by default until the module's electrical requirements are confirmed.
- If the IR transmitter range is weak, use a proper transistor/MOSFET IR LED driver rather than overloading an ESP32 GPIO.
- Keep the IR transmitter pointed toward the AC's IR receiver.
- Keep the IR receiver positioned so the AUX remote can be aimed directly at it during capture.
