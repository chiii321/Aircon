# Session handoff: Push schedule updates to GitHub

- Updated: 2026-10-06T00:00:00+08:00
- Status: in progress
- Workspace / branch / commit: C:\Users\Gwen\Desktop\aircon / codex/inuvair-vercel-release; commit pending.

## Objective and constraints
User authorized pushing current website/schedule updates to GitHub. Preserve unrelated local files and exclude credentials/logs.

## Completed work and changed files
Selected web/app.js, style.css, device-status.js; device-sync handler; required sleep/power migrations; base and numbered firmware sketches with example credentials, certificate and sleep headers; .gitignore credential exclusions.

## Decisions and rationale
Include supporting firmware and status dependencies so repository matches deployed features. Do not stage actual device_credentials.h, debug logs, local provisioning scripts, unrelated documentation or assets.

## Verification and results
Reviewed selected file list and checked source for secret-key/token patterns; no matches in selected code. Website syntax previously passed. Firmware upload and physical AC operation remain unverified.

## Remaining work and blockers
Commit and push; confirm remote branch SHA. Other local work remains unstaged.

## Next step
Push codex/inuvair-vercel-release and record resulting SHA.
