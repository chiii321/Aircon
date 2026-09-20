# AUX remote COOLIX captures (reported 2026-09-20)

The user captured these with the original remote and labeled each from the button pressed. Both decoded as 24-bit `COOLIX` frames. A fresh capture over COM4 confirmed each code again on 2026-09-20:

| Remote action | Decoded code | Raw timings |
| --- | --- | --- |
| ON | `0xB21F38` | 199 entries reported in Serial output |
| OFF | `0xB27BE0` | 199 entries reported in Serial output |

The original output showed DHT22 at 31.4 °C and 74.7% RH after the ON capture. The fresh captures showed about 31.3 °C and 74.5% RH. Each COOLIX frame had 199 raw timing entries; the source output was shared in the project conversation, but the CLI terminal wrapped the live array output, so raw timing arrays are not copied into this record. The decoded codes above are confirmed twice.

The earlier 13-byte `ELECTRA_AC` records remain in this directory; the cause of the protocol difference is not yet established. These COOLIX codes have not been tested as commands from the ESP32, so they have not replaced the firmware's ON/OFF states.
