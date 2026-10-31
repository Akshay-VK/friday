# Requirements traceability and decision record

This document maps [the original spec](../Friday%20a%20read-only%20control%20room%20for%20your%20laptop.md) and the approved interview to the expanded plan. **Included** preserves intent; **Revised** deliberately changes it; **Deferred** retains it outside the named release; **Rejected** excludes the proposed behavior. These are dispositions of requirements, not implementation status.

References: [PRD](PRD.md), [UX](UX-SPEC.md), [technical design](TECHNICAL-DESIGN.md), [delivery/test catalog](DELIVERY-PLAN.md).

**Implementation decision, 2026-10-30 (#4):** Owner approved closing #4 on verified ordinary local Windows roots via manual entry only; this does not change the original safety requirements or authorize other roots. Real picker select/cancel (VG-03), genuine cloud-placeholder nonhydration (SAFE-06/T02), and exhaustive native Windows attempted-write tracing including Git/hidden/ignored/untracked entries (SAFE-01/T01, VG-02) are **not passed** and move to #57, which blocks final hardened #55, not #4. UNC/share, WSL, cloud, reparse and uncertain paths stay refused until independently verified. Current grants have no durable file identity for future collectors: before consuming a grant they must verify identity, containment, host and no-follow behavior again; `ready` reports existence only. The original included/revised/deferred dispositions below remain the product contract, not a claim of implementation acceptance.

## 1. Original sections 1–3: contract, use cases, architecture

| Original provision | Disposition | Destination / rationale |
| --- | --- | --- |
| §1 Never create/edit/delete in projects, hooks, hidden config | Included | SAFE-01; T01 includes Git metadata and ignored/untracked paths |
| §1 State in `%APPDATA%\Friday` | Included | SAFE-02; data-home boundary and overlap validation |
| §1 Only overrides/tasks/notes/layouts irreplaceable | Revised | OPS-04/OPS-05; all authored configuration/identity/assignments/files are covered |
| §1 Daily backup | Included | Catch-up after downtime, pre-migration snapshot, 7 daily + 4 weekly copies |
| §1 Read/Open/Run distinction | Included | SAFE-03–SAFE-05; Open does not guarantee the launched application's behavior |
| §1 Click or confirmed queued command for Run | Included | ACT-06/TEL-03/TEL-04; phone and laptop are equal authorization surfaces |
| §1 Network only to added hosts | Included | SAFE-07; discovered candidates and redirects do not grant permission |
| §1 Credential store or Friday `.env` | Revised | OPS-03 uses OS credential storage; `.env` fallback deferred rather than silently weakening storage |
| §1 Corrections live only inside Friday | Included | PROJ-12; overrides never alter source |
| §2 Start day / changes since yesterday | Revised | J2/FEED-02 uses last acknowledged visit and observation coverage rather than midnight assumptions |
| §2 Where was I / Resume | Included | J2/J4 and ACT-03; exact checkout preserved |
| §2 Launch editor/terminal/repo/live site | Revised | Default editor + WSL terminal; other targets opt-in to avoid tab/session spam |
| §2 Site health, response time, SSL | Included | SITE-01–SITE-06; basic monitoring in R1 |
| §2 Last deploy | Deferred | Optional provider metadata after approved integration; not required for basic R1 Sites |
| §2 Find sessions across projects | Included | SESS-01–SESS-06, R2 |
| §2 Find docs across projects/vault/Quanta | Included | DOC-01, R4; Quanta mirror proof in R5 |
| §2 Annotated folder system | Included | FILE-01–FILE-03, R4 |
| §2 Cold/dirty/unpushed projects | Included | PROJ-08; per-checkout state, explicit touched evidence |
| §2 Capture anywhere | Revised | TASK-04 means inside Friday; OS-global capture deferred |
| §2 Away tasks/status | Included | TEL requirements, R6; off-state silence and retention explicit |
| §2 Downloads inbox | Included | FILE-02 with configured folder and count scope |
| §2 Photography | Included | PANEL-05, R5; no editing/organizing originals |
| §2 Quanta course docs | Included | PANEL-06, mirror-first |
| §2 Weekly Review | Included | FEED-03/TASK requirements, R3; no inferred hours/productivity score |
| §3 Collectors → SQLite → UI, no UI scanning | Included | Technical boundaries, SAFE-01/SAFE-02, PANEL-01 |
| §3 Windows Node/Hono/TypeScript server | Included | Planned baseline gated by VG-01; not existing infrastructure |
| §3 better-sqlite3/FTS5 | Included | Schema/storage/search design; worker/native compatibility gate |
| §3 Watchers/debounce and Git CLI | Included | Collection scheduling and Git read-only adapter |
| §3 Vite/React/TypeScript + SSE | Included | Planned UI/API; reconnect cursor/resnapshot added |
| §3 Visual system decided separately | Revised | M3 Expressive desktop web is approved, with explicit web implementation gap |
| §3 Initial table list | Revised | Separates repository/checkout/location and authored/derived/operational records |
| §3 Windows/WSL mapping, opt-in UNC roots | Included | VG-03; canonical paths include distro/host identity |

## 2. Original sections 4–5: detectors, structure, identity

| Original provision | Disposition | Destination / rationale |
| --- | --- | --- |
| §4 Facts with source/confidence | Included | PROJ-06/PROJ-09; categorical confidence rather than invented probabilities |
| §4 L0 metadata and extension mix | Included | Bounded/approximate stats; placeholder-safe collection |
| §4 L1 manifest/signature matrix | Included | PROJ-02; format fixtures and data-only parsing |
| §4 L2 status/log/remotes/worktrees/submodules | Revised | Same intent, but optional index writes and unsafe helpers must be prevented |
| §4 L3 deploy fingerprints | Included | Local URL candidates; no automatic monitoring grant |
| §4 L4 README/docs/changelog/license | Included | Bounded parsing and provenance; no semantic summary claim |
| §4 L5 tracked tree/test/TODO/FIXME | Included | Bounded `ls-files`/`grep`; partial counts labelled |
| §4 L6 OpenCode sessions | Included | Version-aware service adapter, R2 |
| §4 L7 outdated dependencies/CI on demand | Deferred | Later read-only metadata/API capability; no package-manager execution in collection |
| §4 Name/description fallback | Included | PROJ-06/PROJ-07 and effective-fact source precedence |
| §4 Stack dependency lookup editable | Included | Detector lookup + correction/settings; extension mix remains weaker evidence |
| §4 Active 14/Warm 60/Cold | Included | Proposed configurable defaults; touched evidence clarified |
| §4 URL ranking and HEAD verification | Revised | Candidate source rank plus approval then bounded verification; success alone does not prove project ownership |
| §4 `git ls-files` respects ignore intent | Included | Used for tracked structure, not claimed as complete untracked inventory |
| §4 Skip-list walking outside Git | Included | Bounded traversal, explicit exclusions, no hydration |
| §4 Cache key HEAD/manifests/index | Revised | Watcher generations/working-tree changes/reconciliation added; original misses tracked edits |
| §4 Nightly/full refresh and opened-project refresh | Revised | Daily reconciliation while running + startup/wake catch-up; no implied wake scheduler |
| §4 Unknown stays unknown, no quality judgment | Included | PROJ-07; product non-goals |
| §4 Future opt-in local model | Deferred | No LLM in current roadmap; separate future decision |
| §5 Collection/Repo/Project/Subproject | Revised | Glossary separates work, history, checkout/location, and component |
| §5 Listed roots minus exclusions | Included | SAFE-06/PROJ-01 |
| §5 Git root → default project | Included | Discovery candidate, with worktree and association reconciliation |
| §5 Workspace formats define subprojects | Included | PROJ-02/PROJ-03; explicit workspace fixture matrix |
| §5 Multi-manifest components/promotion | Included | Collapsed by default; manual promotion; ambiguous dynamic layouts stay unresolved |
| §5 Non-Git collections/signatures/plain folders | Included | Discovery rules and explicit kind overrides |
| §5 Submodules/worktrees/nested repos | Included | PROJ-10; worktrees keep separate working state |
| §5 First-commit fingerprint as identity | Rejected | PROJ-04/ADR-0002; root hash is neither unique nor immutable |
| §5 Merge Windows/WSL clones | Revised | Group related checkouts with confirmation when uncertain; never merge working state |
| §5 Non-Git move treated new/warn | Revised | Preserve path evidence and offer explicit reconciliation/merge without discarding notes |
| §5 Ambiguity prefers fewer cards | Included | Components collapsed; uncertain grouping is a review decision |
| §5 First verified URL primary | Revised | Source ranking, destination approval, and explicit primary choice; no silent wrong-site LED |
| §5 Huge repo sampling/caps | Included | PROJ-11 and coverage reason |
| §5 Disconnected drive retained | Included | PROJ-05; availability separate from freshness |
| §5 Full override/Fix list and Why this? | Included | PROJ-09/PROJ-12, UX Project detail |

## 3. Original section 6: panels

| Original provision | Disposition | Destination / rationale |
| --- | --- | --- |
| Collector/view/settings shared with built-ins | Included | PANEL-01; minimal contract starts in R0/R1 |
| Config template/custom collector/custom view | Included | PANEL-02/PANEL-07; custom code explicitly trusted |
| `panel.yaml`, `source.ts`, `Panel.tsx` | Included | Planned extension representation in Friday data home, not project-injected files |
| Gallery/file list/Markdown/URL/JSON/counter templates | Included | Added only after demonstrated reuse; not all prerequisites for R1 |
| Scheduled command-output template | Rejected | Conflicts with no-background-Run boundary; explicit Run UI provides configured execution |
| Photography config-only proof | Included | PANEL-05; preview-format verification gate |
| Four-hour shoot grouping | Included | Proposed heuristic on consecutive capture times, with ambiguity disclosed |
| RAW embedded preview, cached thumbnails | Revised | Verify format/tool support; metadata fallback rather than guaranteed universal decoding |
| Quanta file-list mirror | Included | PANEL-06, primary integration |
| Quanta local SQLite/JSON custom source | Deferred | VG-06 before direct-store support; no guessed paths/schema |
| Read-only `ctx.fs` restricted to reads | Revised | Enforced for built-in adapters, not claimed as sandbox for arbitrary imports |
| `ctx.git/http/db/config` conveniences | Revised | Scoped built-in adapters; store owner commits results, custom code remains trusted |
| Timeouts/error isolation | Included | PANEL-03; accidental failure isolation, not malicious-code isolation guarantee |
| Cache/age/generated settings/validation | Included | PANEL-02/PANEL-03 |
| Add panel native folder picker/live preview | Included | VG-03 + panel preview under explicit grants |
| Drag/resize/duplicate/delete/views | Included | PANEL-04 plus keyboard alternatives and undo of configuration removal |

## 4. Original section 7: UX and edge cases

| Original provision | Disposition | Destination / rationale |
| --- | --- | --- |
| Answer first, cache under 1 second | Included | QUAL-01 target; p50/p95 measurement, no existing speed claim |
| One-click open and deliberate launch | Included | ACT requirements; first approval/ambiguity can legitimately add a step |
| Keyboard first/every action palette | Included | FIND-01/FIND-02 and UX keyboard contract |
| Evidence/calm/next steps/teach once/freshness | Included | Effective facts and unified UX state contract |
| Rail/top search/Away/recents/status dot | Revised | Expressive adaptive navigation; status has text, not color-only dot |
| Two-key navigation shortcuts | Included | Suppressed in editable contexts; timeout and discoverability |
| Home order and all eight sections | Included | Progressive release capability; missing features omitted honestly |
| Idle session attention | Revised | Explicit waiting evidence preferred; idle-age alert opt-in |
| Since-you-left five-item collapse | Included | FEED-02 and Home behavior |
| Sites right-click history | Revised | Also explicit keyboard-visible history action |
| Project toolbar/card/page/tabs | Included | UX index/detail; checkout selector added |
| Subproject breadcrumbs/scoped docs/sessions | Included | PROJ-03/SESS-03 and project-location relationship |
| Ordered launch profile | Included | Open targets only by default, per-target partial outcomes |
| Enter/L launch | Included | Focus-scoped, no duplicate nested activation |
| Open-with Test buttons | Included | Explicit human Open; never on settings text change |
| Scripts/Make/Cargo Run with first confirmation | Revised | Explicitly adopt command; exact-config remembered approval; tracked process lifecycle in R3 |
| Failure toast linking settings | Included | Also persistent run/error detail where transient toast is insufficient |
| Sessions title/status/todos/filters | Revised | Capability-aware running/unknown; todos unavailable is not zero; no universal idle inference |
| Unassigned and directory assignments | Included | Authored associations; no implicit filesystem permission |
| Files YAML map/notes/counts/inbox/unmapped | Included | Revisioned DB authority + validated atomic YAML representation; approved roots only |
| Docs list/pins/recents/Markdown/PDF external | Included | Sanitization/remote-asset blocking; body opt-in and purge added |
| Minimal task text/project/date | Included | Completion state/internal bookkeeping made explicit |
| Capture @project/!today | Included | Ambiguity selection, in-app scope, editable-context suppression |
| Global/project autosaved scratchpad and t | Included | Revision conflict protection; converting text does not silently delete it |
| Palette prefixes/Enter/Shift+Enter/typed args | Included | Display resolved action; never execute while searching |
| Away Run/Skip and Run all safe | Revised | Apply only to appropriate request class; reads/captures only in bulk; incidents are not executable commands |
| Loading/empty/partial/error/offline/stale/first run | Included | UX unified state table with actionable next step |
| Site down only after control host answers | Revised | Control host requires approval; connectivity ambiguity yields Unknown rather than mandatory third-party probing |
| Settings six sections | Revised | Keep original areas, add explicit Sources/network permissions, Processes/actions, security and lifecycle controls where needed |
| Comfortable/compact density and layout edit | Included | Adaptive/accessibility constraints retained |
| WCAG AA, focus, keyboard, reduced motion | Included | QUAL-05 targets WCAG 2.2 AA with manual checks |
| 50 repos <10s / palette <100ms | Included | QUAL-02/QUAL-03 targets with specified fixtures and separate cold/warm results |
| Drive/share offline retained | Included | PROJ-05/T02 |
| Detached HEAD/no commits/bare/merge/rebase | Included | PROJ-10/T06 |
| Two clones merged | Revised | One project grouping, independent checkouts, no blind identity merge |
| Deleted-project session unassigned | Included | SESS-02/SESS-03/T09 |
| 401/403 up; redirects followed | Revised | Reachable with access note; redirects only within approved destinations |
| SSL expiry 14 days | Included | Proposed configurable warning threshold |
| Huge repo approximate | Included | PROJ-11/T07 |
| Symlinks/junctions bounded | Included | SAFE-06/T02; real containment rather than string prefix |
| Cloud placeholders metadata-only | Included | SAFE-06/T14/T17, no hydration |
| Long paths/permissions scan report | Included | Source health/scan-run records and retry guidance |
| UTC storage/local display | Revised | Instants UTC; task due dates and ambiguous EXIF times retain their different semantics |
| Manifest name + folder subtitle | Included | UX Projects and typography long-name review |
| Today ten/show all | Included | TASK-02/UX Home, overdue included |

## 5. Original sections 8–11: Telegram, stages, risks, questions

| Original provision | Disposition | Destination / rationale |
| --- | --- | --- |
| Long polling/no tunnel/public URL | Included | TEL-01; loopback local dashboard remains private |
| At most 24-hour Telegram retention | Included | TEL-07, VG-08; not a guaranteed full 24-hour durable inbox |
| Persist update then advance offset | Included | TEL-02; bot identity + update id key, durable acceptance protocol |
| Exactly once generally | Revised | Transactional capture dedup only; external effects/replies can be uncertain/duplicated |
| Read answered online or boot | Included | Cached snapshot freshness and bounded boot summary |
| Capture automatically on drain | Included | Transactional task/note effect |
| Launch/Run confirmed online or queued | Revised | Phone equal authority; approved online explicit commands can execute; offline requests require fresh approval on either surface |
| Numeric user allowlist/ignore others | Included | Sender + private-chat validation, not just chat id |
| Credential store/separate bot/no shell | Included | TEL-01/SAFE-09/OPS-03 |
| No queued acknowledgment while off | Included | Honest off-state messaging |
| Boot summary | Included | Completed/failed/waiting/unknown distinctions |
| Always-on responder | Deferred | Out of scope, not secretly provisioned |
| Stage 0 skeleton/panel/action registry | Included | D0/D1.0; security/restore included early |
| Stage 1 projects/sites | Included | D1.1–D1.4/R1; Open only, first useful release |
| Stage 2 standalone server visibility assumption | Revised | VG-05 targets correct installed WSL service; schema and execution ownership verified |
| Stage 3 tasks/notes/search | Included | D3-A, plus explicit Run package D3-B |
| Stage 4 map/docs/read-only spot checks | Revised | D4; instrumented no-write proof beyond sampled Git status |
| Stage 5 panel system and proofs | Included | D5; trusted-code boundary and no command-output collector |
| Stage 6 Telegram/toasts | Included | D6; notification permission and redaction, no execution in a toast body |
| Stage 7 hardening/restoration/accessibility | Revised | D7 integrates checks that begin in D0/R0; not first safety audit |
| Optional local summaries/MCP | Deferred | Separate future scope and permissions decision |
| Tailscale/phone web access | Deferred | Telegram is not permission to expose the HTTP server |
| Heuristic/API/path/load/read-only/scope risks | Included | Delivery risk register with early signals and release-blocking triggers |
| Original scan-root question | Revised | Explicit onboarding choice, no hardcoded/all-drive root |
| Editor/terminal question | Resolved | VS Code + Windows Terminal with configurable WSL distro |
| Folder-system notes question | Resolved | Friday-owned map/annotations; existing source can be imported explicitly |
| Quanta storage question | Verification gate | Mirror path chosen explicitly; direct store not assumed |
| Initial site list question | Configuration | User-selected approved targets, not discovered-link auto-enrollment |
| New versus reused bot | Resolved | Dedicated optional bot |
| Search-extract-only source confidence | Revised | Primary-source register with direct-versus-extract caveat and installed-version gates |

## 6. Interview decision ledger

| Decision | Approved outcome | Where enforced |
| --- | --- | --- |
| Q1 | First useful release smaller than full vision | PRD releases; D1 R1 stop condition |
| Q2 | Observation no-write distinct from external Open/Run writes | SAFE-01–SAFE-05; ADR-0001 |
| Q3 | One project can group independently tracked checkouts | PROJ-03/PROJ-04; ADR-0002 |
| Q4 | Trusted custom code, no sandbox claim/scheduled shell panel | SAFE-11/PANEL-07; ADR-0004 |
| Q5 | Calm expressive laptop workspace; compact mode and themes | UX thesis/tokens/layout |
| Q6 | Windows process + local browser, not desktop shell | PRD scope; technical host boundary |
| Q7 | Approved networking, no telemetry/LLM | SAFE-07/SAFE-08 |
| Q8 | Editor + WSL terminal default; VS Code/Windows Terminal accepted | ACT-02/ACT-04; launch UX |
| Q9 | Resume restores context, never agent execution | SESS-06; J4 |
| Q10 | Zero scan access until explicit roots | SAFE-06; onboarding |
| Q11 | Home prioritizes continuity/actionable attention | FEED-01/FEED-02; Home UX |
| Q12 | Blue–teal M3 roles, bundled Roboto Flex/Symbols | UX token proposal and VG-04 |
| Q13 | Laptop viewports, narrow fallback, keyboard equivalents | QUAL-05; T22 |
| Q14 | In-app capture only; editable suppression | TASK-04; keyboard contract |
| Q15 | Every Run deliberate; exact-config remembered approval optional | SAFE-04/ACT-06; action state machine |
| Q16 | Protect localhost launch/mutation endpoints | SAFE-10; T20 |
| Q17 | All authored state backed up; retention/restore preview | OPS-04/OPS-05; T18 |
| Q18 | Titles/headings/paths default; opt-in bodies; safe preview/purge | DOC-01–DOC-04; T14/T15 |
| Q19, revised by user | Phone is equally authorized; no laptop-only confirmation | TEL-03; ADR-0003 |
| Q20 | Observation gaps and explicit unknown/paused site states | SITE-02/SITE-05; T13 |
| Q21 | Photography read-only, Quanta mirror-first, no arbitrary command collector | PANEL-05–PANEL-07 |
| Q22 | Same approval rules; online explicit approved phone commands execute | TEL-03/ACT-06; T21 |
| Q23 | Delayed execution needs fresh ten-minute approval on either surface | TEL-04; callback state machine |
| Q24 | Track Friday-owned processes, logs, Stop, duplicate warning | ACT-07; VG-03/T12 |
| Q25 | Minimal tasks; weekly observed review, no productivity scoring | TASK-01/FEED-03 |
| Q26 | Sign-in opt-in, browser close leaves server running | OPS-01/OPS-02; T24 |
| Q27 | Linked PRD/UX/technical/delivery/traceability/glossary/ADRs | This document set |

The consolidated agreement and permission to write were subsequently explicitly approved. Numerical implementation tuning values labelled proposed elsewhere were not separately ratified by that approval.

## 7. Requirement-to-delivery coverage

This index ensures new requirements are not lost merely because the original did not name them. Tests are detailed in the delivery catalog; earlier safety/recovery tests recur at every release.

| PRD IDs | Delivery owner | Acceptance scenarios |
| --- | --- | --- |
| SAFE-01, SAFE-02 | D0/D1.0, all collectors | T01, T02, T04 |
| SAFE-03, SAFE-04, SAFE-05 | D1.3/D3-B | T08, T11, T21 |
| SAFE-06, SAFE-07, SAFE-08 | D0/D1.1/D1.4/D4 | T02, T03, T13, T14 |
| SAFE-09, SAFE-10 | D0/D1.0/D3-B/D6 | T11, T20 |
| SAFE-11, SAFE-12 | D3-B/D5/D6 | T12, T16, T21 |
| PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05 | D1.1 | T01, T06 |
| PROJ-06, PROJ-07, PROJ-08, PROJ-09 | D1.1/D1.2 | T07, T22 |
| PROJ-10, PROJ-11, PROJ-12 | D1.1/D1.2 | T06, T07 |
| ACT-01, ACT-02, ACT-03, ACT-04 | D1.0/D1.3/D3-A | T08, T11 |
| ACT-05, ACT-06, ACT-07, ACT-08 | D0/D3-B | T02, T08, T11, T12 |
| SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06 | D2 | T09 |
| SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06 | D1.4 | T03, T13 |
| FEED-01, FEED-02, FEED-03 | D1.4/D3-A | T10, T13 |
| TASK-01, TASK-02, TASK-03, TASK-04 | D3-A | T10, T18, T22 |
| FIND-01, FIND-02 | D1.0/D3-A/D4 | T10, T11, T23 |
| FILE-01, FILE-02, FILE-03 | D4 | T15, T18 |
| DOC-01, DOC-02, DOC-03, DOC-04 | D4 | T03, T14, T15 |
| PANEL-01, PANEL-02, PANEL-03 | D1.0/D5 | T16 |
| PANEL-04, PANEL-05, PANEL-06, PANEL-07 | D5 | T17, T18, T22 |
| TEL-01, TEL-02, TEL-03, TEL-04 | D6 | T19, T20, T21 |
| TEL-05, TEL-06, TEL-07 | D6 | T19, T20, T21 |
| OPS-01, OPS-02, OPS-03 | D0/D1.0/D7 | T18, T20, T24 |
| OPS-04, OPS-05, OPS-06, OPS-07 | D1.0/every release/D7 | T04, T18, T24 |
| QUAL-01, QUAL-02, QUAL-03, QUAL-04 | D1/D3/D4/D7 | T05, T23 |
| QUAL-05, QUAL-06, QUAL-07, QUAL-08 | Every release | T01, T05, T20, T22, T23 |

## 8. Explicitly unresolved, not silently assumed

No actual scan roots, WSL distro/user, site list, vault/mirror/photo location, Telegram identity/token, installed OpenCode version/service, Windows runtime compatibility, component library, installer, native picker bridge, or process supervision mechanism has been verified by creating these documents. These remain configuration or named verification gates in the plan index. None is permission to inspect private data or start services without the appropriate user action.
