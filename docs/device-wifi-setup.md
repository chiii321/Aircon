# Update Wi-Fi for all eleven devices

Firmware reads WIFI_SSID and WIFI_PASSWORD from each board's local device_credentials.h. It uses Wi-Fi station mode only; there is no setup hotspot or phone setup page.

1. Double-click `devices/set-wifi.cmd`, or run from the repository root:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File devices\set-wifi.ps1
   ```

2. Enter the 2.4 GHz Wi-Fi SSID and password. Both prompts are visible. Spaces are preserved; special characters are escaped for C++ strings. A blank password is for an open network.
3. The script updates WIFI_SSID and WIFI_PASSWORD in all eleven local headers, preserving their unique DEVICE_TOKEN values. These credential files are Git-ignored.
4. Recompile and upload each matching sketch, from `devices/01/01.ino` through `devices/11/11.ino`, to apply the changes to the actual boards. Editing files alone does not update a running ESP32.
5. Open Serial Monitor at 115200 baud, send `status`, and verify the ID, Wi-Fi connection, and website sync. Existing deep-sleep behavior may limit the online window.

The experimental saved-network/hotspot code was reverted at the user's request. If that experimental version was uploaded, uploading this station-only version removes hotspot operation. Its old aircon-wifi Preferences entries, if present, are ignored; erasing flash is not required.
