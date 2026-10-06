# Session handoff: Push schedule updates to GitHub

- Updated: 2026-10-06T00:00:00+08:00
- Status: completed
- Workspace / branch / commit: local checkout / codex/inuvair-vercel-release; 7a8c4fa; completion note updated locally after push.

## Objective and constraints
User authorized pushing current website/schedule updates to GitHub. Preserve unrelated local files and exclude credentials/logs.

## Completed work and changed files
Selected web/app.js, style.css, device-status.js; device-sync handler; required sleep/power migrations; base and numbered firmware sketches with example credentials, certificate and sleep headers; .gitignore credential exclusions.

## Decisions and rationale
Include supporting firmware and status dependencies so repository matches deployed features. Do not stage actual device_credentials.h, debug logs, local provisioning scripts, unrelated documentation or assets.

## Verification and results
Reviewed selected file list and checked source for secret-key/token patterns; no matches in selected code. Website syntax previously passed. Firmware upload and physical AC operation remain unverified.

## Remaining work and blockers
Push succeeded. git ls-remote confirmed 7a8c4fae9026c86b551923aafa0593dd06dfcbf3 on origin/codex/inuvair-vercel-release. Other local work remains unstaged.

## Next step
Firmware upload still required; no further GitHub action pending.


