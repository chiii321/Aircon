# AUX remote captures (2026-09-23)

Captured with the original remote and labeled by the physical button pressed:

| Action | Decoder result | Firmware behavior |
| --- | --- | --- |
| ON | COOLIX `0xB21F48`, 24 bits | Send this native COOLIX code |
| OFF | UNKNOWN, displayed code `0x0FBE8123`, 100 bits | Replay the complete captured raw timing array |

The OFF capture reported `rawData[199]`; all 199 timings are stored as `kAuxOffRaw` in the maintained Stage 1 sketch. The displayed UNKNOWN code is informational and is not used for transmission. Both labels follow the user's physical ON/OFF remote presses.

DHT22 after the captures: 32.3 °C, 69.0% RH. AC mode, set temperature, fan setting, and remote model were not included in the capture report. Raw replay uses the firmware's configured 38 kHz carrier; the receiver cannot measure carrier frequency. Physical replay through the ESP32 transmitter and AC response still require testing.
