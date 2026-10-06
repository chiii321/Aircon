# Wiring Reference

Connections for the current hardware: an ESP32-WROOM-32 38-pin USB-C board, a DHT22, and two IR LEDs on one transistor driver. The parts list and the full solar and battery wiring are in the [hardware and power plan](../INUVAIR_HARDWARE_AND_POWER_PLAN.md). Keep all grounds common.

| Device | Pin | Connect to |
| --- | --- | --- |
| 2N2222A | BASE | GPIO 25 through a 1kΩ resistor |
| 2N2222A | BASE | GND through a 10kΩ pull-down |
| 2N2222A | EMITTER | GND |
| 2N2222A | COLLECTOR | IR LED 1 cathode (−) and IR LED 2 cathode (−) |
| IR LED 1 | Anode (+) | ESP32 5V/VIN through its own 100Ω resistor |
| IR LED 2 | Anode (+) | ESP32 5V/VIN through its own 100Ω resistor |
| DHT22 | DATA | ESP32 GPIO 32 |
| DHT22 | VCC | ESP32 3.3V |
| DHT22 | GND | ESP32 GND |
| MT3608 boost converter | OUT+ | ESP32 5V/VIN (set to 5.00 V first) |
| MT3608 boost converter | OUT− | ESP32 GND |

The IR receiver and the physical ON/OFF buttons have been removed. GPIO 26, 27, and 33 are unused.

## IR transmitter

Both LEDs share one driver, so they always send the same command at the same time. Aim one LED at each AC's IR sensor. Both ACs must accept the same command.

```text
GPIO 25 ── 1kΩ ──┬── 2N2222A BASE
                 └── 10kΩ ── GND

2N2222A EMITTER ── GND
2N2222A COLLECTOR ──┬── IR LED 1 cathode (−)
                    └── IR LED 2 cathode (−)

5V/VIN ── 100Ω ── IR LED 1 anode (+)
5V/VIN ── 100Ω ── IR LED 2 anode (+)
```

The 10kΩ pull-down keeps the transistor, and both LEDs, off while the ESP32 boots. GPIO HIGH drives the transistor on, so keep `IR_SEND_INVERTED=false`.

Before powering up:

- Check BASE, COLLECTOR, and EMITTER against your exact 2N2222A's datasheet. Pin order varies by manufacturer and package, so the flat face alone isn't enough to tell.
- Identify each LED's polarity from its datasheet or with a multimeter's diode-test mode.
- Check that the transistor and the 5 V supply can handle both LED currents flowing together.
- Never connect 5V/VIN to an ESP32 GPIO or the 3V3 pin.

## DHT22

Power the DHT22 from 3.3V and read it on GPIO 32. A 3-pin DHT22 module needs nothing extra. A bare 4-pin DHT22 sensor also needs a 10kΩ pull-up from DATA to 3.3V.

## Power

Normal operation runs from the solar and battery chain: 5 V solar panel → CN3065 charger → 1S BMS with four 18650 cells in parallel → MT3608 boost converter → ESP32 5V/VIN. Set the MT3608 output to **5.00 V before connecting it to the ESP32**. The [hardware and power plan](../INUVAIR_HARDWARE_AND_POWER_PLAN.md) has the terminal-by-terminal wiring.

## Testing

- Start 10–20 cm from each AC's IR sensor, then move out to the real mounting distance.
- Phone cameras vary in IR sensitivity, so not seeing a flash doesn't prove an LED is off. Only the AC's physical response verifies transmission.
- See [live setup](live-setup.md) for Wi-Fi provisioning and [IR troubleshooting](ir-troubleshooting.md) if an AC doesn't respond.
