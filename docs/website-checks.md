# Website UI checks

The website uses static HTML, CSS, and browser JavaScript. There is no build step.
`web/base.css` owns shared colors, typography, controls, focus states, and system
dark mode. `auth.css` and `style.css` contain page-specific layouts. Preserve the
INUVAIR logo, wordmark, routes, and account permissions when editing the UI.

The September 26 refinement replaces decorative labels and generic copy with
direct account instructions and room readings. Overview shows only devices
returned for the signed-in account. Missing readings remain unavailable; an IR
acknowledgement still does not establish the physical AC state.

## Run locally on E:

From PowerShell, serve the website in one terminal:

```powershell
$env:TEMP = 'E:\Temp'
$env:TMP = 'E:\Temp'
python -m http.server 8765 --bind 127.0.0.1 --directory 'E:\Codex\aircon\web'
```

Open `http://127.0.0.1:8765`. Ordinary browser access uses the existing live
authentication service. Do not send real device commands just to check styling.

In a second terminal, install test tools outside the repo and run the isolated test:

```powershell
$env:TEMP = 'E:\Temp'
$env:TMP = 'E:\Temp'
$env:npm_config_cache = 'E:\Caches\npm'
npm.cmd --prefix 'E:\Codex\aircon-web-check' install --no-audit --no-fund playwright @axe-core/playwright
$env:NODE_PATH = 'E:\Codex\aircon-web-check\node_modules'
# Uses installed Chrome; set CHROME_PATH if yours is elsewhere.
$env:SHOTS_DIR = 'E:\Codex\aircon-web-check'
node 'E:\Codex\aircon\tests\web-smoke.cjs'
```

The test intercepts the Supabase client import, supplies synthetic accounts and
device reports, and blocks other external network requests. It does not sign in,
send email, change assignments, or command real hardware. Screenshots show test
data, not measurements from the actual installation.

Coverage: 44 page/viewport/theme combinations (1440px and 390px, light and dark),
horizontal page overflow, WCAG A/AA axe checks, admin/authorized/pending visibility,
mock command insertion and schedule validation, preservation of unsaved select
edits across polling, network error recovery, and authentication form feedback.
The harness is a UI regression check, not a database/RLS or firmware test.

Manual checks: keyboard navigation, narrow-table scrolling, phone time pickers,
long room/account names, and real account access. Confirm physical AC response
separately on the installed device.

## Design references

The design-taste and Ponytail skills guided restrained typography, a shared blue
palette, native form controls, and reduced CSS duplication. Appllama references
included Receipt Scanner (1550270774/oth_l6ri4) for grouped destinations and GOWOD
(1227834875/oth_9aqwo) for readable metric hierarchy in dark mode. These are pattern
references; no third-party artwork is bundled. Mobbin research was attempted but
the account returned a paid-plan requirement.
