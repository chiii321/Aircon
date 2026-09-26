# Live controller setup

Website: https://inuvair.vercel.app/ (alias: https://aircon-bay.vercel.app/)

The Vercel production project serves the `web/` directory. The GitHub repository has the site source and `vercel.json`; the current Vercel production version was deployed directly from `web/`. The earlier Cloudflare Pages deployment remains at https://aircon-control-gwen.pages.dev/ and may lag behind.

The current firmware ID is `01`. The database has slots `01` through `11`; only `01` has a provisioned credential. A slot is **online** only after its ESP32 reports a heartbeat within the past 30 seconds. Do not mistake a queued command or an IR-send acknowledgement for a verified physical AC state.

## Before uploading ESP32 01

1. Remove the prototype's physical ON/OFF buttons. The sketch no longer reads GPIO 33 or 26. Keep DHT22, IR receiver, and IR transmitter wiring as documented in [wiring.md](wiring.md).
2. Open the local, Git-ignored `firmware/stage1_hardware_test/device_credentials.h`. If it is absent on a fresh checkout, copy `device_credentials.example.h` and provision a unique token before uploading. On this workspace, replace `YOUR_WIFI_NAME` and `YOUR_WIFI_PASSWORD` with the actual **2.4 GHz** Wi-Fi credentials. Keep the generated `DEVICE_TOKEN` unchanged. Do not share or commit this file.
3. Install ESP32 core 2.0.17 and the library versions listed in [README.md](../README.md), including ArduinoJson 7.4.3. Compile and upload `firmware/stage1_hardware_test/stage1_hardware_test.ino`.
4. Open Serial Monitor at 115200 baud and send `status`. Confirm `Device ID: 01` and `Wi-Fi: connected`. The website should show device 01 online after a successful HTTPS poll. If it remains offline, check Serial for HTTP errors, Wi-Fi association, and clock synchronization.

The sketch polls every five seconds, sends DHT22 readings when available, and acknowledges website commands after attempting IR transmission. An offline ESP32 cannot receive a new manual command; the website disables those buttons. Commands queued just before a disconnect may remain pending until reconnection.

Reliability changes prepared on 2026-09-26 add a 60-second manual-command deadline, atomic acknowledgements, and database schedule validation. They are not yet deployed. Follow the [architecture rollout order](architecture.md#rollout-order) before relying on that behavior in the hosted system.

## Website account

The administrator can create an email-prefilled registration link from Dashboard → Settings → Invite and manage users. The link is a convenience only: it is not expiring, revocable, or proof of authorization. New accounts must confirm their email, then the administrator must approve the account and assign devices. Do not send passwords or Wi-Fi credentials to Codex.

To make registration truly invitation-only, disable public signups in the hosted Supabase Auth settings and replace these convenience links with server-verified, expiring invitation tokens. A static browser page cannot securely create or validate invite tokens. The allowlisted fleet administrator must still sign up using the provisioned owner email on a fresh database.

The project's Auth redirect allowlist could not be inspected from this session. If the confirmation link opens another address after confirming, return to the website URL above and sign in there.

On a fresh database reset, an administrator must insert that address into the private `allowed_owners` table before signup. The address is provisioned in the current hosted database and is intentionally absent from repository migrations.

Each device page has manual ON/OFF controls and daily 24-hour ON/OFF windows in Asia/Manila time. The ESP32 caches synced windows and executes them locally. A manual command takes effect until the next schedule boundary. An offline reboot cannot execute schedules until NTP restores a valid clock. Adjacent, overlapping, and overnight windows are rejected by the website; overnight schedules can be represented as separate daily windows after midnight.

## Adding the other ten controllers

Each new board needs its own firmware ID (`02` through `11`) and unique random device token. Store only the token's SHA-256 hash in `public.device_tokens`, then mark that `public.devices` row provisioned. Never copy device 01's token into another board. The browser uses only the public Supabase key; device tokens stay in ignored local firmware headers.

## Current verification boundary

The database, function, website, and access rules are deployed. No ESP32 heartbeat, DHT22 telemetry, physical AUX ON/OFF response, or local schedule boundary has yet been observed from hardware in this session.
