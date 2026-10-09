# Session handoff: Automatic bookings in Daily AC timers

- Updated: 2026-10-06T00:00:00+08:00
- Status: completed
- Workspace / branch / commit: local checkout / codex/inuvair-vercel-release / 6ca6bcf; edits uncommitted.

## Objective and constraints
Show today's Excel bookings as automatic ON/OFF timers, replacing the separate Daily schedule table. Preserve manual timers and weekday-specific weekly control; do not duplicate bookings into repeating daily database rows.

## Completed work and changed files
web/app.js: device panel titled Daily AC timers; automatic rows show ON, OFF, source and Upcoming/Ongoing. Manual timers have their own subsection. Existing end-time filtering and one-second refresh preserved.

## Decisions and rationale
UI reflects weekly_schedules firmware control without making Monday bookings repeat every day. No backend or firmware changes in this task. Firmware upload remains required from previous session.

## Verification and results
Node module syntax check and targeted git diff whitespace check passed. No browser interaction or hardware test performed. Production deployment READY: https://control-31wnpcig9-inuvair.vercel.app, aliased https://inuvair.tech. Live app.js confirms automatic timer markup and removal of Daily schedule heading.

## Remaining work and blockers
Firmware hardware upload remains pending from previous task; physical AC behavior unverified.

## Next step
Connect each ESP32 and upload matching updated firmware before expecting automatic AC control.

