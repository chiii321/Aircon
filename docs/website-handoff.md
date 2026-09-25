# Website handoff

This is the starting point for a new session building the air-conditioning control website. Read [README.md](../README.md) for the current hardware status and [CODEX_HANDOFF_AC_IOT.md](../CODEX_HANDOFF_AC_IOT.md) for the broader product requirements. Some older handoff milestones are stale; the README and dated capture records reflect the latest recorded hardware work.

## Goal and intended flow

Build a responsive dashboard that can eventually control one ESP32 and later multiple ESP32s, with one device per AC. The requested features are manual ON/OFF, schedules, temperature and humidity, AC state, next action, and online status. Temperature automation and energy monitoring are later phases.

```text
Website on Cloudflare Pages (free *.pages.dev address)
    -> Supabase Auth + database/realtime
    -> ESP32 over outbound Wi-Fi connection
    -> IR transmitter -> AC
```

The ESP32 must execute schedules locally using a correct clock and cached schedule data. The website should save desired state and schedules; it must not need to stay open for a scheduled command. Manual override behavior needs an explicit rule before implementation.

## Current state (2026-09-25)

- `web/index.html` is a placeholder, not a functional dashboard.
- `database/schema.sql` is comments describing possible tables. No schema migration or table deployment is recorded in this repository.
- `supabase/config.toml` exists locally and the Supabase CLI is linked to project `jvdudsbtcjojbgtanbzo` (Aircon Project). The CLI listed the project as healthy.
- The local Git repository points to `https://github.com/chiii321/Aircon.git`. GitHub authentication and Cloudflare Wrangler authentication were verified in this session. Cloudflare Pages had no project listed at that time.
- Supabase publishable and secret keys in the root `.env` were compared with the project's active keys and matched. The `.env` is Git ignored. Its project URL has not been added; use `https://jvdudsbtcjojbgtanbzo.supabase.co`.
- The maintained firmware is `firmware/stage1_hardware_test/stage1_hardware_test.ino`. The README records AUX ON/OFF captures, but physical ON/OFF replay and stable device operation remain unverified. Cloud connectivity, command polling/realtime, local scheduling, and per-device authentication are not implemented.
- `supabase/`, `setup-supabase-env.ps1`, and a firmware debug log were untracked at handoff. Inspect Git status before committing; never commit the debug log or any credentials.

## Secrets and access

- The website may use the Supabase project URL and `sb_publishable_...` key. Protect device and user data with Supabase Auth and row level security before enabling real control.
- Never bundle `sb_secret_...` or a service-role key into browser code, ESP32 firmware, a public repository, or Cloudflare Pages client assets. Keep privileged operations in a protected backend with authorization checks if one is needed.
- Do not treat the publishable key as user authentication. Decide who is allowed to control each device and how each ESP32 authenticates before accepting remote commands.
- PowerShell blocks the npm `wrangler.ps1` shim on this machine; use `wrangler.cmd`. `wrangler.cmd whoami` checks Cloudflare login. `supabase projects list` checks Supabase CLI access.

## Suggested next-session sequence

1. Inspect the existing website placeholder, README, hardware test plan, and Git status. Keep the first website change small and reviewable.
2. Build the dashboard UI and a clear connection/status state. If backend tables and firmware are still absent, label controls as a preview rather than claiming the AC responded.
3. Define the device, schedule, command, acknowledgement, telemetry, and access-control model before applying a database migration. Include row level security for every exposed table.
4. Integrate the website with Supabase using only the publishable key and user authentication. Verify the actual data and authorization behavior.
5. Add device cloud synchronization and local schedule execution in firmware, then verify physical AUX ON/OFF response before presenting remote control as operational.
6. When ready to publish, connect the GitHub repository to Cloudflare Pages for a stable free `*.pages.dev` address. A `trycloudflare.com` Quick Tunnel is only a temporary preview of a local server.

Completion check for the first website task: the page runs locally, accurately distinguishes simulated from confirmed device state, contains no secret key, and leaves the current firmware and database state clear to the next session.
