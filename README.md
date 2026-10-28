# Friday · foundation shell (issue #2)

This slice starts a Windows-hosted, loopback-only local browser shell. It has no scan roots, credentials, external integrations, Open/Run commands, or startup work commands.

## Run

Use Node 24+ and npm on **Windows**. From a Windows terminal in this checkout:

```powershell
npm ci
npm approve-scripts better-sqlite3  # if npm blocks native install scripts
npm rebuild better-sqlite3           # only if install scripts were blocked
npm run build
npm start
```

Open the `FRIDAY_READY` URL. The server binds `127.0.0.1` only; Ctrl+C shuts it down. `npm run dev` builds then starts the same production host, not a network-facing Vite dev server. By default the data home is `%APPDATA%\Friday` on Windows. Set `FRIDAY_DATA_HOME` to an **absolute Friday-owned location** for an isolated trial and `FRIDAY_PORT=0` to select an ephemeral port. Avoid selecting an observed/source project directory. A second instance on the same home refuses to start. This slice does not implement a source picker, automatic browser open, startup registration or an installer.

## Verify

```powershell
npm run typecheck
npm test
npm run test:browser
```

The tests create isolated temporary data homes and launch only the test host and an installed Chromium browser. `test:browser` **fails**, rather than reporting a green skipped suite, if no launchable browser exists; point `FRIDAY_BROWSER_EXECUTABLE` at an existing browser. In WSL, use Linux-native dependencies installed separately from Windows-native ones. If a cached Chromium lacks system libraries, `FRIDAY_BROWSER_LIBS` can point to an existing library directory. Do not share `node_modules` across operating systems.

## Current state and backup inventory

The only authored value is the appearance preference (`preferences` table, `key=theme`) in `friday.sqlite` under the Friday data home. The FTS5 action index is rebuildable from registered actions; `friday.lock` and SQLite WAL/SHM files are operational, not authored state. A future backup must include a **consistent SQLite snapshot of the preferences table** (not a raw copy of a live WAL file). This slice does not yet expose a backup/restore UI or claim scheduled backups. Keep a safe copy of the data home after stopping Friday if manually moving state; do not treat that as verified restore coverage.

The design translates Material 3 Expressive roles/typography/shape to Friday-owned CSS and native web controls. Official Material Web is in maintenance mode and does not ship a complete Expressive web component set; no official Expressive component fidelity is claimed. Roboto Flex is bundled locally under the SIL OFL 1.1; the small SVG icon set was drawn for Friday and uses no external asset provider. Light/dark/system roles, keyboard focus, palette, and reduced-motion behavior are browser-tested.
