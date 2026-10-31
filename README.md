# Friday · local shell, recovery and bounded scan-root grants (issues #2–4)

This slice starts a Windows-hosted, loopback-only local browser shell. It has explicit scan-root grants but no project collectors, credentials, external integrations, Open/Run commands, or startup work commands.

## Run

Use Node 24+ and npm on **Windows**. From a Windows terminal in this checkout:

```powershell
npm ci
npm approve-scripts better-sqlite3  # if npm blocks native install scripts
npm rebuild better-sqlite3           # only if install scripts were blocked
npm run build
npm start
```

Open the `FRIDAY_READY` URL. The server binds `127.0.0.1` only; Ctrl+C shuts it down. `npm run dev` builds then starts the same production host, not a network-facing Vite dev server. By default the data home is `%APPDATA%\Friday` on Windows. Set `FRIDAY_DATA_HOME` to an **absolute Friday-owned location** for an isolated trial and `FRIDAY_PORT=0` to select an ephemeral port. Avoid selecting an observed/source project directory. A second instance on the same home refuses to start. This slice has an unverified native folder-picker bridge with a manual-entry fallback, but no automatic browser open, startup registration or installer.

## Scan-root support (#4 revised scope)

| Host/path | Status |
| --- | --- |
| Ordinary physical Windows local-drive folder, manually entered, distinct from Friday's data home | Supported for bounded one-level metadata preview and exact grant after explicit approval; no subsequent project collection yet. Build the reviewed Windows helper with `npm run build:native:windows` using an existing compiler before trying preview; missing helper refuses preview. |
| Windows folder picker | Implemented, **not interactively verified**; manual entry works independently. Selection alone never grants access. |
| Cloud-provider/placeholder, UNC/network share, WSL path, junction/reparse root or ancestor, aliases/ambiguous paths | Unsupported; refuse rather than follow or guess. No provider folder or private root is authorized for testing by this documentation. |
| Linux development fixture | Test-only local preview; not evidence of a Windows cloud or WSL boundary. |

The owner-approved #4 subset does **not** waive source purity or claim full T01/T02/VG-02/VG-03. Linux fixture write-attempt tracing and native Windows local-root fixture/negative tests passed; genuine provider nonhydration, real picker selection/cancel and exhaustive native Windows attempted-write tracing are **unverified**, tracked in #57 and blocking final hardened #55, not this ordinary-local-root #4 subset. A stored grant's `ready` health means the folder exists, **not** that its file identity was rechecked. Future collectors must revalidate identity, host, containment and no-follow rules before any read; an enabled grant is not blanket trust. No scan writes to observed projects, cloud access, Open or Run are authorized by granting a root.

## Verify

```powershell
npm run typecheck
npm test
npm run test:browser
```

The tests create isolated temporary data homes and launch only the test host and an installed Chromium browser. `test:browser` **fails**, rather than reporting a green skipped suite, if no launchable browser exists; point `FRIDAY_BROWSER_EXECUTABLE` at an existing browser. In WSL, use Linux-native dependencies installed separately from Windows-native ones. If a cached Chromium lacks system libraries, `FRIDAY_BROWSER_LIBS` can point to an existing library directory. Do not share `node_modules` across operating systems.

## Authored-state backup and recovery

The authored state is the appearance preference (`preferences` table, `key=theme`) and the scan-root configuration (`sources` table: root and native path, host, exclusions, enabled status, health) in `friday.sqlite` under the Friday data home. No identities, authored files or credential references exist yet. The FTS5 action index is rebuildable; `friday.lock` and SQLite WAL/SHM files are operational. `src/server/store/backups.ts` owns the explicit authored inventory; future authored fields/tables/files must extend both export and import, validation and restoration tests before use. Backups contain the `preferences` and `sources` tables in an isolated SQLite file plus JSON manifest (app/schema/format version, UTC timestamp, row/file counts, SHA-256). No live database file, WAL, index or secret is copied.

Use **Authored-state backups** in the browser to save, preview and explicitly replace. Preview describes the current and incoming appearance; confirmation expires after five minutes and any preference or scan-root change invalidates it. Restored scan roots are always recreated disabled with health `disabled`, so restore never re-enables a grant; preview and approve each root again before any read. Friday verifies the snapshot and must publish a separate pre-restore backup before applying one atomic database transaction. To move to a clean Friday-owned home, copy a published backup directory under `backups/` while Friday is stopped, start Friday with that isolated home, and preview/restore using the browser. Do not copy a `.pending` directory or overwrite a live database. The pre-restore and pre-migration copies are not pruned automatically; manage old protected copies deliberately. Known older stores are backed up before migration; newer unknown schemas refuse startup rather than downgrade. A failed migration can be recovered by fixing storage/permissions and restarting, or by installing a compatible Friday version and restoring a validated snapshot. Never hand-edit the SQLite database to force a schema downgrade.

While active Friday checks for a successful daily copy at startup and each minute; it catches up once after downtime and retains seven daily dates and four distinct weekly copies. A failed backup remains visible in the backup panel with a free-space/permissions next step; an incomplete `.pending` directory is never listed or restored. Backups share the data home and **do not protect against device loss**: copy verified backups to independently protected storage using your own backup procedure. Windows file sync and rename do not guarantee directory persistence through power loss; keep additional off-device copies. No automatic cloud transfer is performed.

The design translates Material 3 Expressive roles/typography/shape to Friday-owned CSS and native web controls. Official Material Web is in maintenance mode and does not ship a complete Expressive web component set; no official Expressive component fidelity is claimed. Roboto Flex is bundled locally under the SIL OFL 1.1; the small SVG icon set was drawn for Friday and uses no external asset provider. Light/dark/system roles, keyboard focus, palette, and reduced-motion behavior are browser-tested.
