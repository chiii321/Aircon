# Website handoff

Read this before editing the website. For deployment steps and the current verification status, see [live-setup.md](live-setup.md). For hardware status, see the [README](../README.md). The broader product requirements are in [CODEX_HANDOFF_AC_IOT.md](../CODEX_HANDOFF_AC_IOT.md), though some of its milestones are now out of date.

## Architecture

```text
Static website (web/, deployed on Vercel)
    -> Supabase Auth + Postgres (row level security)
    -> device-sync Edge Function
    -> ESP32 polls over outbound HTTPS
    -> IR transmitter -> AC
```

The ESP32 runs schedules locally, using its NTP clock and a cached copy of its schedule windows. The website only saves desired state and schedules. It never needs to stay open for a scheduled command to run.

## Where things live

| Area | Location |
| --- | --- |
| Pages | `web/index.html`, `web/login.html`, `web/register.html`, `web/dashboard.html` |
| Sign-in and sign-up | `web/auth.js` |
| Dashboard | `web/app.js` |
| Database schema and access rules | `supabase/migrations/` |
| Device API | `supabase/functions/device-sync/index.ts` |
| Firmware | `firmware/stage1_hardware_test/` |

## Secrets and access

- The browser code and firmware contain only the Supabase project URL and the `sb_publishable_...` key. Both are public by design. Row level security and Supabase Auth protect the data, not the key.
- Never put an `sb_secret_...` key, a service-role key, a Wi-Fi password, or a device token in browser code, firmware, docs, or anything else that gets committed. Keep local secrets in Git-ignored files such as `.env` and `firmware/stage1_hardware_test/device_credentials.h`.
- Privileged work runs in the `device-sync` Edge Function, which reads the service-role key from its server environment.
- Each ESP32 authenticates with its own random token. The database stores only the token's SHA-256 hash.
- Owner and admin email addresses live only in the hosted database's private `allowed_owners` table. Keep them out of migrations and docs.

## Before you commit

1. Run `git status` and check that no `.env`, credentials header, debug log, or local helper script is staged.
2. Keep website changes small and reviewable.
3. Label anything the hardware hasn't confirmed as unverified. An IR-send acknowledgement doesn't prove the AC changed state.

Completion check for a website task: the page runs locally, clearly separates reported device data from unverified state, contains no secret key, and leaves the firmware and database state clear for the next person.
