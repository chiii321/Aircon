# AUX DC Inverter — OFF

| Field | Value |
| --- | --- |
| AC brand/model | AUX DC inverter; exact model not recorded |
| Command | OFF |
| Power state | OFF |
| Temperature | Not recorded during capture |
| Mode | Not recorded during capture |
| Fan setting | Not recorded during capture |
| Swing setting | Not recorded during capture |
| Decoded protocol | ELECTRA_AC |
| Date captured | 2026-09-18 |
| Replay verified | No — pending physical test |

## State data

User confirmation (2026-09-19): the OFF label comes from actual AUX behavior observed during capture. Preserve these exact bytes and this label; do not reverse based on an inferred protocol bit. Replay with the temporary harvested-LED transistor circuit remains pending.

```cpp
uint8_t AUX_OFF_STATE[13] = {
  0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20,
  0x00, 0x00, 0x20, 0x00, 0x05, 0xB0
};
```
