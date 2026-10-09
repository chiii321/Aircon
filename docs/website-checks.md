# Website UI checks

The website uses static HTML, CSS, and browser JavaScript. There is no build step.
`web/base.css` owns shared colors, typography, controls, focus states, and system
theme tokens. `theme.js` defaults to light and persists an explicit light/dark
choice across pages. `auth.css` and `style.css` contain page-specific layouts. Preserve the
INUVAIR logo, wordmark, routes, and account permissions when editing the UI.

The September 26 refinement integrates the collaborator's invitation and schedule
hold workflow through commit `9a465fe`. Public pages offer sign-in only; registration
links come from the administrator. Those links prefill an email and are not secure
invitation tokens: email confirmation, administrator approval, and device assignment
still apply. Backend-enforced invite-only signup is not implemented by this UI.

The centered welcome screen replaces decorative labels and generic copy with
direct account instructions and room readings. Overview shows only devices
returned for the signed-in account. Missing readings remain unavailable; an IR
acknowledgement still does not establish the physical AC state.

## Run locally

Playwright and axe are dev dependencies in `tests/package.json`, kept out of the
deployed `web/` folder and the repository root so Vercel builds are unaffected.
From the repository root:

```powershell
npm --prefix tests install
npm --prefix tests run browsers
npm --prefix tests test
```

`browsers` downloads Playwright's Chromium and WebKit once per machine. The browser
tests start their own local server for `web/`, so no separate server is needed.
Set `CHROME_PATH` to test with an installed browser instead, `TEST_WEBKIT=1` to run
`captured-tests-web.cjs` in WebKit, and `CAPTURE_SCREENSHOTS=1` to save its
screenshots under `outputs/`.

`npm test` runs the device status and Wi-Fi unit checks plus three browser tests:

- `captured-tests-web.cjs`: captured remote buttons and exact command payloads,
  role and offline gating, the device page climate card layout at 390px and 1440px,
  44px touch targets, WCAG A/AA axe checks in light and dark, and scroll
  preservation across the 8-second refresh.
- `sleep-web.cjs`: sleeping, idle and offline states, estimated AC state, queued and
  failed commands, and timer saving.
- `live-device-refresh.cjs`: live readings and acknowledgements arriving without
  losing a timer value being edited.

Each test intercepts the Supabase client import, supplies synthetic accounts and
device reports, and blocks other external network requests. It does not sign in,
send email, change assignments, or command real hardware. Screenshots show test
data, not measurements from the actual installation.

`web-smoke.cjs` and `schedule-import.cjs` predate several dashboard changes (the
appearance button, invitation email flow, profile loading and automatic room
mapping) and currently fail against the live UI. They are not part of `npm test`
until they are updated. The harness is a UI regression check, not a database/RLS
or firmware test.

To look at the site in a browser, serve `web/` with any static server, for example
`python -m http.server 8765 --bind 127.0.0.1 --directory web`. Ordinary browser
access uses the live authentication service. Do not send real device commands
just to check styling.

Manual checks: keyboard navigation, narrow-table scrolling, phone time pickers,
long room/account names, and real account access. Confirm physical AC response
separately on the installed device.

## Design references

The design-taste and Ponytail skills guided consistent typography, native form
controls, and reduced CSS duplication. User feedback subsequently restored a softer
gentle blue palette with a small yellow underline to echo the logo, rounded surfaces, and short entrance
and button-hover motion. Reduced-motion preferences disable those effects. Appllama references
included Receipt Scanner (1550270774/oth_l6ri4) for grouped destinations and GOWOD
(1227834875/oth_9aqwo) for readable metric hierarchy in dark mode. These are pattern
references; no third-party artwork is bundled. Mobbin research was attempted but
the account returned a paid-plan requirement.
