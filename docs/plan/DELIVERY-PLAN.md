# Friday dependency-ordered delivery plan

Status: work specification only. No commands below are established repository scripts. Choose tooling during D0, then record actual developer commands when they exist. This plan does not create issues or authorize running work in external projects.

## 1. Execution rules

1. Deliver a narrow vertical slice per work package, with fixture-based evidence before real-source use.
2. Treat safety, backup, and graceful degradation as prerequisites, not final polish.
3. Use real local sources only after explicit root/integration approval; do not treat this document as that permission.
4. Every package ends with a demo, repeatable checks, known limitations, and a stop condition. A demo alone is insufficient proof.
5. No silent scope additions: if a dependency would introduce a deferred feature, propose a narrower solution.
6. Stop at a failed verification gate. Write findings and alternatives before committing the product to an unverified assumption.
7. Do not estimate calendar dates until D0 establishes the host/runtime and implementation capacity. S/M/L are relative complexity, not promised durations.

## 2. Dependency graph

```text
D0 verification and architecture fixtures
 └─ D1.0 foundation + accessible expressive primitives + state/backup
     ├─ D1.1 discovery/identity ─ D1.2 Projects/evidence/overrides
     ├─ D1.3 native Open profiles (after host/path spike)
     └─ D1.4 approved site checks + Home events
                     └────────────── R1 gate
                                     │
                              D2 OpenCode / R2
                                     │
                       D3 tasks/search/Run / R3
                                     │
                      D4 folder map/documents / R4
                                     │
                    D5 configurable panels/proofs / R5
                                     │
                         D6 Telegram/Away / R6
                                     │
                         D7 hardening/release / R7
```

The graph is the default build order, not a claim that every later feature technically depends on every earlier one. Telegram could follow R3 after the action engine stabilizes, but reordering releases requires an explicit decision. Avoid parallel feature work that bypasses shared identity/action contracts.

## 3. D0 — bounded verification spikes (M)

Output small evidence notes under an implementation research location, with versions, steps, observations, and failure boundaries. Do not turn prototypes into production architecture automatically.

| Package/gate | Experiment | Required output and stop condition |
| --- | --- | --- |
| D0-A / VG-01 | Windows Node + Hono + better-sqlite3/FTS5, native build/install, worker ownership, Vite serving and SSE | Compatibility matrix and minimum runtime; show parameterized FTS query, responsive HTTP under DB work, consistent backup; stop if packaging/native support is unresolved |
| D0-B / VG-02 | Read-only Git/filesystem fixture across status, log, refs, worktrees, helper configurations, empty/shallow repos | Before/after manifests plus write-attempt instrumentation; prove optional index writes disabled; unsafe helpers denied; no credential/network prompts |
| D0-C / VG-03 | Native folder picker/manual entry, VS Code, Windows Terminal, selected WSL distro, Windows/WSL path mapping | Round-trip paths with spaces/Unicode/metacharacters; Open without prompt execution; no public server binding or guessed distro |
| D0-D / VG-03 | Ownership of a harmless long-lived test process and WSL child; explicit stop and host crash | Design for verified process-tree identity/stop, PID reuse defense, and unknown outcomes; no kill-by-port shortcut |
| D0-E / VG-04 | M3 Expressive shell/Continue/rail/dialog/table using candidate web primitives | Source/support matrix; screenshots in light/dark and laptop sizes; keyboard and reduced-motion demo; library selection rationale |
| D0-F | Localhost attack fixture | Cross-origin POST, invalid Host, null Origin, malicious Markdown/link attempts rejected; document threat model |

**Exit:** choose only the dependencies needed for D1; record actual commands and supported versions. Environment values not yet known remain configuration. Do not scan the user's drive to make a spike look realistic.

## 4. D1.0 — foundation and R0 (M)

### Build sequence

1. Establish minimal server/UI packages, TypeScript/build configuration, and a runnable Windows development path.
2. Add data-home validation, single-instance ownership, schema migrations, and settings repository.
3. Add source grants and a local security boundary before exposing launch/mutation routes.
4. Implement cache-query envelope and SSE invalidation/resnapshot behavior.
5. Implement M3 semantic tokens, fonts/icons, adaptive shell, focus model, dialogs, and status/error components.
6. Add a minimal panel registry and typed action registry with one harmless test action.
7. Add onboarding roots/tools/review without pretending discovery or future features are complete.
8. Add consistent authored-state backup, validation, failure attention, and restore fixture before real user data.

**Demo:** configure a fixture root and tool settings, use Ctrl+K, restart, observe retained configuration, create/validate/restore a backup.

**Tests:** T01–T05, T18, T20 below. Include failed migration, failed disk write, second host instance, hostile Origin, and loss of SSE replay window.

**R0 exit:** settings survive restart; cached UI loads independently of collector availability; restore preserves authored values; no source writes. Stop at the minimal panel contract; no gallery, custom code loader, or layout engine.

## 5. D1.1–D1.4 — project control room and R1 (L)

### D1.1 Discovery, provenance, and identity

- Add bounded root traversal and candidate discovery with skip/permission/placeholder handling.
- Implement L0/L1 first, then read-only L2 Git and L3–L5 deterministic enrichment.
- Establish detector interface, schema validation, generations, health, cancellation, and partial commits.
- Implement stable IDs and separate checkouts; common-dir worktree association; explicit ambiguous grouping/move flow.
- Implement workspace-format fixtures and component/subproject/collection rules.
- Add watchers only after explicit refresh works correctly; include overflow and startup reconciliation.

**Acceptance:** a fixture inventory produces the expected entity graph and provenance without external writes. A dirty clone and clean clone never share checkout facts. A modified tracked file updates despite unchanged HEAD/index mtime. Unsupported dynamic workspace logic remains unknown.

### D1.2 Projects UI, evidence, and corrections

- Grid/list/tree, filtering/sorting/grouping, effective fact projection, selected-checkout state.
- Project detail and Why this? pane/drawer with override reset.
- Rename/kind/stack/group/promotion/hide/archive/pin/site/docs corrections stored only in Friday.
- Preserve errors/age and show partial data rather than clearing cards.

**Acceptance:** every visible derived primary fact can disclose source/age; overrides persist through rescan/restart and reset exposes current evidence. Merge/group preview does not discard conflicting authored records.

### D1.3 Native Open

- Implement typed native targets and global/per-project profiles.
- Default profile is editor + selected WSL terminal; other targets are opt-in.
- Choose checkout before resolution, report per-target outcomes, explicit test actions, and recent opens.
- Run discovery may be displayed as configuration suggestions only; no Run engine in R1.

**Acceptance:** paths with spaces/Unicode/metacharacters arrive intact at the intended application; offline checkout asks for a new selection; partial profile failure reports exact failed target; no shell injection or accidental duplicate launch from nested controls.

### D1.4 Sites, events, and useful Home

- Separate local URL candidates from granted targets and verified primary selection.
- Implement HEAD/bounded fallback, redirect permission checks, HTTP/TLS details, history/gaps, backoff.
- Emit meaningful deduplicated events; introduce Continue, Attention, Since you left, pins, and Sites.
- Show unimplemented Tasks/Notes sections only as omitted capabilities, not fake empty user data.

**Acceptance:** approved mock site failure changes state within configured threshold; an unapproved redirect is not contacted; laptop sleep is a gap; 401/403 is reachable with a note; old idle data does not create generic alarms.

### R1 release gate

Tests T01–T08, T13, T18, T20 pass for the release scope. On explicitly approved real roots, sample names/stack classifications are inspectable and correctable, no silent destructive cleanup occurs, editor/terminal launch works, and cached Home is useful without waiting for collection. Performance baselines are recorded with fixture/hardware details; no unsupported target claim.

**Stop:** no OpenCode mutation, Run supervisor UI, Telegram bot, template marketplace, or arbitrary shell collector.

## 6. D2 — sessions and R2 (M)

### Verify before implementation (VG-05)

Record installed WSL version/channel, actual service scope, service identity and authenticated endpoint, local schema/CLI, session pagination, location routing, observed active-session coverage, and capability limits. Use user-approved connection settings, not credential scraping. Verify Windows localhost reachability under the actual WSL/network configuration; do not expose OpenCode publicly to solve a local connection issue.

### Build

1. Add adapter interface and version-specific capability map with mock responses.
2. Add paginated snapshot ingestion and live-event refresh/resnapshot where supported.
3. Map canonical directories to project/checkouts/subpaths with boundary-aware longest match.
4. Implement Sessions table, filters, Unassigned assignments, cached unreachable state, and project counts.
5. Add validated Resume launch without prompt or auto-approval; fail closed for missing IDs.
6. Add optional todo summary only when supported and proportionate to data collection.

**Demo:** observe sessions from actual intended TUI instances, assign an unmatched session, restart Friday, disconnect upstream, and reopen an existing session without sending input.

**R2 exit:** T09 passes with fixtures and the approved real environment; every fetched session is matched or explicitly Unassigned; unknown status/todos are not zero/idle. API changes degrade capabilities without breaking Projects.

**Stop:** no prompt sending, session creation/deletion, upstream permission decisions, or requirement that all activity be globally visible when the source cannot provide that fact.

## 7. D3 — capture, local search, and owned Runs / R3 (L)

The original Stage 3 was M; tracked execution adds real complexity, so this package is split internally rather than hidden as a small button.

### D3-A Tasks, notes, search (M)

- Minimal task model, Today/Upcoming/Someday/Done and overdue behavior.
- In-app capture, project resolution, idempotent submit, global/project notes with revision saves.
- Palette recents/prefixes/typed actions and FTS over permitted projects/tasks/notes/sessions.
- Weekly Review based on stored observed events and completed-task timestamps.
- Add all newly authored records to backup/restore before release.

**Acceptance:** capture works on every route without firing while typing; duplicate Enter does not create duplicates; concurrent note edits preserve both drafts via conflict handling; Review never invents time worked.

### D3-B Action engine and process supervision (M–L)

- Adopt discovered scripts into explicit command definitions.
- Implement resolved preview/config digest, remembered approval, idempotency, invalidation/revocation.
- Implement durable action states and uncertain-crash recovery.
- Implement verified Windows/WSL process ownership, bounded redacted logs, duplicate warnings, Stop/escalation, and explicit shutdown behavior.
- Surface per-run history and command errors without exposing secrets.

**Acceptance:** every new invocation requires a click; remembered approval cannot survive a command/directory/environment-config change; cross-tab execution races dispatch once; host crash after launch becomes unknown rather than retry; unrelated process is never killed.

**R3 exit:** T10–T12, T18, T20 pass, plus earlier gates. Demonstrate a harmless fixture command writing only to its explicitly authorized test checkout; collector tests still prove no writes. If process ownership spike failed, do not ship a misleading Stop feature or enable phone Run later.

## 8. D4 — folder map and document discovery / R4 (M)

### Build

1. Revisioned folder-map records plus validated atomic `folders.yaml` import/export and conflict handling.
2. Cached bounded stats, inbox flags, map notes/search, approved unmapped suggestions.
3. Approved document sources and title/heading/path indexing, optional body opt-in, exclusions, FTS joins.
4. Sanitized Markdown preview, external Open, pins/recents linked to stable source locators.
5. Immediate source revocation, job cancellation, cache/index purge, and authored annotation choices.
6. Enrich onboarding review with a draft folder map.

**Demo:** annotate a folder, find it by note keyword, locate a Markdown heading from two sources, preview without remote fetches, disconnect/remove a source, restore annotations.

**R4 exit:** T13–T15, T18 pass; malicious Markdown and secret fixtures do not leak content or execute/fetch; cloud placeholders remain unhydrated. Compare filesystem manifests covering contents and metadata writes; spot-checking clean Git status alone is insufficient.

**Stop:** no file moves, source edits, PDF parser pipeline, automatic media download, or whole-drive indexing.

## 9. D5 — configurable views and panel proofs / R5 (L)

### Build

- Evolve the existing panel boundary from built-ins, not a separate plugin architecture.
- Implement schemas/generated settings, per-panel health/cache/cancellation, and config revisioning.
- Implement gallery/preview/size/move/duplicate/remove/named views with keyboard alternatives.
- Add templates on demonstrated reuse; exclude shell output. Record why each template exists.
- Photography: verify formats, EXIF ambiguity, safe preview tooling, shoot grouping, heatmap, incoming count.
- Quanta: inspect an explicitly approved mirror; group by configured course folders and last-visit markers.
- Trusted custom collector/view loading only with explicit disclosure; no claim of hostile-code isolation.

**VG-06/VG-07:** direct Quanta store and unsupported RAW/HEIC support are investigated separately, not guessed. Reading an upstream SQLite store may require safe read-only snapshot behavior; if no supported approach exists, keep the mirror-only integration.

**R5 exit:** T16–T18 pass; add a supported config panel in under two minutes during a timed walkthrough; malformed/slow panel leaves others usable; layout survives restart/restore; thumbnail generation never writes beside originals. A bad trusted-code extension can be disabled at startup; threat model remains honest.

**Stop:** no marketplace, untrusted JS sandbox, universal theme builder, or photo organizer.

## 10. D6 — equal-authority Telegram and Away / R6 (M–L)

### Build order

1. Optional dedicated bot credential reference, numeric owner/private-chat validation, one poller and no webhook.
2. Durable acceptance/cursor/dedup/outbox protocol with crash-injection tests before external actions.
3. Read/capture verbs with freshness, typed project resolution, and bounded replies.
4. Same action registry as browser; online Open and approved Run from explicit owner commands.
5. Bound first-approval previews, single-use callbacks, expiry, config-change invalidation, phone/laptop races.
6. Downtime/freshness detection and fresh approval of queued Open/Run on either device.
7. Away categories, safe bulk processing, boot summary, notification preference and redaction.

**Demo:** send a task while Friday is off; start and observe one capture. Send a Run while off; approve from phone after startup, with no laptop action. Replay the callback, change the command, and crash at the dispatch boundary; none may cause a second automatic execution.

**R6 exit:** T19–T21 pass. Unauthorized senders are ignored. Tokens never enter UI/logs/backups. At-most-24-hour retention and off-state silence are stated in onboarding. Exactly-once capture is transactionally demonstrated; arbitrary external effects and reply delivery are not advertised as exactly once.

**Stop:** no arbitrary shell, always-on cloud relay, phone dashboard exposure, or fallback to laptop-only approval.

## 11. D7 — integrated hardening and personal release / R7 (M)

- Finish installation, sign-in opt-in, updates/migrations, explicit shutdown, uninstall/data-retention choice, diagnostic export.
- Run all prior gate suites, restore onto a clean data home, test lost credentials and historical Telegram state.
- Measure performance on agreed local and opt-in WSL fixtures; document cold/warm differences and limitations.
- Audit accessibility manually and automatically in both themes/densities and target viewports.
- Stress watcher overflow, event gaps, offline roots, huge trees, long paths, permission failures, partial integration outages, and storage pressure.
- Review every persistent authored field against backup inclusion and every derived asset against source-revocation purge.
- Conduct a realistic start-day → resume → capture → phone request → shutdown → restore walkthrough.

**R7 exit:** all regression suites pass; no known source-write, unauthorized execution, lost-authored-data, secret-leak, or unsafe-replay defect remains. Lesser limitations are visible in release notes with workaround. Record measured targets honestly and obtain an explicit trade-off decision for misses.

## 12. Acceptance scenario catalog

These are test specifications, not executable tests yet. Use isolated fixture sources, a separate Friday data home, mock network/OpenCode/Telegram endpoints, controllable clock, process stubs, and deliberate crash injection. Do not use real credentials in fixtures.

| Test | Scenario and required assertion | Primary coverage |
| --- | --- | --- |
| T01 | Enumerate source tree including `.git`, ignored/untracked entries; instrument writes; run all collectors; no create/edit/delete/optional index refresh | SAFE-01, SAFE-02, PROJ-01 |
| T02 | Path traversal, prefix collision, changed junction, symlink cycle, UNC boundary, case-sensitive WSL path, data-home overlap | SAFE-06, PROJ-03, ACT-08 |
| T03 | Disable permission while a job is running; late result rejected; cached sensitive content removed from queries | SAFE-07, DOC-04 |
| T04 | Restart/single-instance contention, migration failure, corrupt snapshot, low disk space; last good authored state preserved | OPS-04, OPS-05, OPS-07 |
| T05 | SSE disconnect/replay-window loss and slow collector; resnapshot preserves focused row/unsaved note and cached first paint | QUAL-01, QUAL-06 |
| T06 | Empty/bare/shallow/multi-root/forked repos, worktrees/submodules/nesting, all workspace formats; expected entities, no silent fork merge | PROJ-02–PROJ-05, PROJ-10 |
| T07 | Override/reset/rescan, conflicting evidence, capped stats, tracked edit with unchanged HEAD/index; freshness/evidence correct | PROJ-06–PROJ-12 |
| T08 | Native target quoting, wrong/offline checkout, partial profile failure, duplicate activation, unsafe URI scheme | ACT-02–ACT-04, ACT-08 |
| T09 | Session pagination, service identity collision, longest prefix, unreachable/missing session, unsupported todos, no prompt flags | SESS-01–SESS-06 |
| T10 | Capture syntax/ambiguity, overdue/calendar date, duplicate submit, note revision conflict, selected-text task creation, review coverage | TASK-01–TASK-04, FEED-03 |
| T11 | Approval digest change/revocation/expiry, source script changed behind unchanged `npm run` arguments, unauthorized call, double click, cross-surface race; only current explicit intent dispatches | SAFE-03, SAFE-04, ACT-01, ACT-05, ACT-06 |
| T12 | Crash before/after spawn, PID reuse, WSL process tree, duplicate run, log overflow, graceful/forced Stop; no unrelated kill/replay | SAFE-12, ACT-07 |
| T13 | HEAD unsupported, redirect to denied host, 401/403, TLS expiry/error, timeout, local outage, sleep gap; truthful site states | SITE-01–SITE-06, FEED-01, FEED-02 |
| T14 | Secret files, binaries, huge/invalid encoding, body opt-in, malicious Markdown/HTML/links/remote images; no hidden fetch/leak | SAFE-08, DOC-01, DOC-02 |
| T15 | Map external-edit conflict, counts scope/caps, unmapped-root boundary, pin after reindex, source removal/restore | FILE-01–FILE-03, DOC-03, DOC-04 |
| T16 | Slow/error/malformed panel, schema upgrade, repeated settings change, stale result, invalid YAML, disable trusted code at startup | PANEL-01–PANEL-03, SAFE-11 |
| T17 | Keyboard move/resize/remove/undo, named-view restore, EXIF timezone/missing preview, Quanta visit markers | PANEL-04–PANEL-07 |
| T18 | Backup every authored entity and file; restore on clean home with no secrets; pre-restore failure aborts; caches rebuild; restored confirmations/Run approvals cannot revive execution authority | OPS-03–OPS-06 |
| T19 | Duplicate/out-of-order Telegram update, crash before/after commit/offset/reply; capture once, no lost accepted record, possible duplicate reply disclosed | TEL-01, TEL-02, TEL-06, TEL-07 |
| T20 | Malicious Origin/Host/CSRF, leaked-error/token scan, browser storage inspection, callback forgery/replay, public listener check | SAFE-09, SAFE-10, OPS-03, TEL-05 |
| T21 | Online phone Open/Run parity; queued request renewed on phone; expiry/config change; phone+laptop race; interrupted execution unknown | TEL-03, TEL-04, SAFE-12 |
| T22 | Target laptop sizes, narrow/zoom, themes/densities, keyboard/screen reader, reduced motion, long names, focus under live updates | QUAL-05, UX specification |
| T23 | Cold/warm scans, cache-first navigation, FTS search, palette, cancellation under load; report measured p50/p95 and fixture limits | QUAL-01–QUAL-04, QUAL-06 |
| T24 | Startup off/on, close tab, sleep/wake, shutdown with owned run, upgrade/uninstall choice; no project modifications | OPS-01, OPS-02, OPS-07 |

## 13. Risk register and decision triggers

| Risk | Early signal | Response / decision trigger |
| --- | --- | --- |
| Unsafe collector side effect | Fixture write attempt or external helper execution | Block release; disable detector until no-write behavior is proven |
| M3 web gap grows scope | Large custom component surface before useful R1 | Build only current screens; choose accessible primitives; defer ornamental motion |
| Identity misgrouping | Forks/old clones unexpectedly share context | Require confirmation and reversible associations; keep per-checkout data |
| OpenCode schema mismatch | Required endpoint/status capability absent | Adapt/version-gate; show unknown; never invent a universal endpoint |
| Native process uncertainty | Stop cannot distinguish owned child/PID reuse | Block Run until safe or explicitly narrow supported execution mode |
| Watcher/scan load | UI stalls, event overflow, large roots dominate | Lower concurrency, cap work, reconcile incrementally, expose approximation |
| Secret leakage | Token/path/body in export/log/phone reply | Block affected feature; rotate actual exposed credential if applicable |
| Backup false confidence | Missing config or untested restore | Add authored-state inventory; make restore a gate, not a checkbox |
| Telegram delayed execution | Old request treated as current intent | Require renewed expiring approval on either authorized surface |
| Plugin trust confusion | Wrapper described as hostile-code sandbox | Correct contract; explicit trust; do not load arbitrary extensions |
| Scope creep | Template/automation work precedes a usable project view | Return to R1 stop condition; record deferred ideas separately |

## 14. Handoff checklist per work package

- Requirement IDs and changed interfaces identified.
- Fixture/data permissions explicit; no accidental real-root access.
- Actual commands and versions recorded once tooling exists.
- Tests include failure/restart and previous-stage regressions.
- Screens include loading/empty/partial/error/offline/stale states.
- Authored-state backup/purge implications reviewed.
- Performance statements distinguish measurements from targets.
- Demo and known limitations recorded; no extra feature work after the exit gate passes.
