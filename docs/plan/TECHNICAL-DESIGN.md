# Friday technical design

Status: planned architecture, not implemented interfaces. Approved product contracts are in the [PRD](PRD.md); numerical tuning values here are proposed defaults unless explicitly approved.

## 1. System boundary and ownership

```text
Windows files / approved WSL roots / Git / approved URLs / WSL OpenCode
             │ local reads or explicitly approved network reads
             ▼
      bounded collector scheduler ─── worker execution
             │ validated observations, no direct UI access
             ▼
      store service ─── SQLite + FTS5 ─── backup service
             │                         Friday data home only
       query API + SSE invalidations
             ▼
      React browser UI (loopback, same origin)

Browser or authorized Telegram actor
             ▼
      typed action registry → resolution → policy → durable action record
                                           │
                                           ├─ Capture: Friday transaction
                                           ├─ Open: native launch adapter
                                           └─ Run: supervised configured process
```

Planned baseline: Windows Node/TypeScript host, Hono HTTP service, better-sqlite3/FTS5, Vite/React/TypeScript UI, Git CLI, watcher abstraction, SSE. Confirm runtime/native module compatibility before scaffolding around it. Do not add a broker, cloud service, ORM framework, or distributed scheduler without a demonstrated need.

### Module responsibilities

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Source permission service | Approved roots/destinations, canonicalization, containment checks | UI layouts or command execution |
| Collector scheduler | Debounce, priorities, concurrency, cancellation, source health | User-authored correction logic |
| Detectors | Bounded reads → facts with evidence | Direct database/UI writes or native launches |
| Store service | Transactions, effective facts, queries, retention, migrations | Source scanning |
| Action service | Typed registry, resolution, approvals, audit/idempotency | Guessing shell text or collector refresh work |
| Native host adapter | Windows/WSL path translation, picker, executable launch, owned process lifecycle | Project classification or authorization decisions |
| OpenCode adapter | Version/capability detection and read-only observation | Prompt submission or permission approval |
| Telegram adapter | Polling, sender validation, parsing, reply/callback handling | A separate execution policy |
| UI | Rendering, input, accessible state, cache updates | Filesystem walks, secrets, database access |

Use a single logical SQLite writer. Workers return serializable validated results to the store owner rather than independently contending for writes. Synchronous SQLite work must not stall HTTP/SSE; verify a dedicated store worker or another bounded arrangement in VG-01. WAL is planned for concurrent reads, with bounded queries and explicit checkpoint/backup behavior.

## 2. Data home and storage classes

Initial data home remains `%APPDATA%\Friday`; inspect actual Windows expansion, permissions, free space, and path overlap. A data-home path equal to, beneath, or conflicting with a selected source is rejected or requires a safe relocation before observing that source. Never leave state beside photos/docs/projects for convenience.

```text
%APPDATA%\Friday\
  friday.sqlite
  backups\                 versioned snapshots/manifests
  cache\thumbnails\        rebuildable, size bounded
  cache\previews\          rebuildable, sanitized
  logs\                    rotated and redacted
  panels\                  Friday-owned panel configs/trusted code
  folders.yaml             user-facing folder-map representation
```

Locations are proposed, not an existing directory contract. DB journaling, temp files, process logs, downloaded assets, thumbnail-tool scratch files, and native helper outputs must also stay in the data home or explicitly approved Friday-owned temporary storage, never source working directories. Native commands that inherently write belong to Run, not collectors.

### Ownership classes

- **Authored:** overrides, tasks, notes, collections, scan roots/permissions, assignments, profiles/commands, approvals/preferences, pins/recents, folder map, panel/view definitions, layouts, visit markers, trusted extension source/config. Back up and version the relevant records.
- **Derived:** facts, document search content, session snapshots, thumbnails, folder stats, site observations, event projections. Rebuildable; removal must not erase linked authored records. Some history cannot be reconstructed after eviction, so retention is disclosed.
- **Operational:** accepted updates, command/action states, polling cursor, run ownership metadata, migration state. Durable for recovery; restoration must not replay execution or acknowledge old requests as new.
- **Secret:** credential references in settings; actual values in Windows credential storage. Excluded from normal backups, logs, SSE, error responses, and browser state. The original `.env` fallback is deferred; do not quietly downgrade secret storage.

## 3. Planned relational model

IDs are generated Friday identities, not file paths or Git hashes. Foreign keys enforce authored references. Store timestamps as UTC instants; task due dates are local calendar dates with explicit local interpretation. Keep source timezone/capture ambiguity separately where relevant.

| Entity/table | Key relationships and fields | Ownership |
| --- | --- | --- |
| `projects` | id, kind, optional parent_project_id, created_at, archived/hidden/pinned preferences | Identity/authored; derived naming in facts |
| `repositories` | id; relationship to projects through explicit links; known remotes/history hints | Mixed, separated by fields |
| `checkouts` | id, repository_id, host/distro identity, canonical/native paths, git common-dir hint, availability | Identity/path reconciliation; state derived |
| `project_locations` | project_id, checkout_id or folder location, relative subpath, selected/default flag | Authored association + discovery |
| `collections`, `collection_members` | stable groups and ordered project membership | Authored or accepted suggestions |
| `facts` | subject type/id, key, JSON value, detector/version, source reference, confidence, observed_at, last_success_at, generation | Derived |
| `overrides` | subject type/id, key, JSON value, revision, created/updated_at | Authored |
| `sources`, `source_permissions` | approved roots/hosts, integration type, canonical boundary, enabled/config version | Authored |
| `scan_runs`, `source_health` | source, detector, start/end, partial/cancelled/errors, coverage and limits | Derived/operational |
| `sites`, `site_targets` | project links, chosen primary, URL candidate evidence, monitoring grant | Authored + derived candidates |
| `checks`, `observation_gaps` | target, attempt time, outcome, HTTP/TLS/latency detail, gap boundaries | Derived history |
| `session_snapshots` | service identity + session id, directory, title, timestamps, observed state/capabilities | Derived |
| `session_assignments` | service identity + session id/path association to project/location | Authored |
| `documents`, `docs_fts` | stable source-relative locator, title/headings/optional body, source permission, modified/indexed time | Derived; FTS5 projection |
| `document_preferences` | source-relative locator, pin, recent-open marker | Authored; not keyed only to ephemeral FTS row |
| `tasks` | id, text, optional project_id, optional due_date, completed_at, revision | Authored |
| `notes` | id, global/project scope, Markdown, revision, updated_at | Authored |
| `folder_map_entries` | stable id, approved root-relative path, label/note/inbox flag/order | Authored |
| `events`, `visit_markers` | meaningful change/dedup key; per-view acknowledged visit boundary | History + authored visit markers |
| `panel_definitions`, `panel_instances`, `views`, `layouts` | version/schema, settings, source grants, placement, size, revision | Authored |
| `panel_cache` | instance/source/config version, result schema version, timestamps/health | Derived |
| `launch_profiles`, `command_definitions` | project/location binding, ordered targets or executable/args/env refs, config version | Authored |
| `action_approvals`, `action_requests` | actor/surface, resolved snapshot digest, expiry, state, consumed_at | Operational/authored policy |
| `action_attempts`, `owned_runs` | idempotency key, start/finish/uncertain state, process identity, exit/stop details | Operational |
| `telegram_updates`, `telegram_cursor`, `reply_outbox` | bot identity + update_id unique; acceptance/result; durable outbound work | Operational |
| `settings`, `backup_manifests`, `schema_migrations` | revisioned settings, backup metadata, migration checksums | Authored/operational |

Keep inferred values out of authored fields wherever possible; this prevents a rescan overwriting a correction. Index canonical location lookup, project membership, fact subject/key, event date/project, session service/id/path, command state, and check target/time. FTS result queries join permitted source records before display, so a removed permission cannot leak stale search rows.

### Effective fact resolution

1. Read the most recent valid committed detector generation for the subject/key.
2. Retain conflicting candidates and rank by explicit source rules, not arbitrary arrival order.
3. Apply an authored override if present, displaying both the override and original evidence.
4. Return value, evidence, confidence category, last successful observation, availability, and limitations.
5. If no evidence exists, return unknown. An empty string, zero, and unknown remain different values.

Proposed confidence vocabulary: **direct** (explicit manifest/config), **supported** (deterministic combination), **heuristic** (README extraction/signature), **unknown**. Do not present fake probability percentages. Source precedence is field-specific: e.g. description manifest → first meaningful README paragraph, site override → approved verified candidates ranked by provenance. HTTP success does not prove that a README URL is the correct project site.

## 4. Identity and path reconciliation

### Stable identity algorithm

Discovery assigns a new location candidate, then checks known canonical paths and explicit associations. Git common-dir relationships can identify worktrees of the same local repository, but each worktree remains a checkout. Remote URLs, reachable roots, manifest names, and history similarity provide grouping evidence, not a universally unique key. Empty, shallow, multi-root, forked, rewritten, and remote-less repositories all remain valid records.

Moving a known checkout offers reconciliation with its old location and linked authored records. New clones can be grouped after confirmation; divergent forks must not merge merely because history is shared. Moving a non-Git folder offers an explicit merge/reassign flow. Keep an audit record and reversible association change; never discard conflicting notes/overrides during merge.

Project and checkout relationships must not force separate clones to share a branch, dirty count, last session, or availability. Project summaries either identify the selected checkout or show an explicitly aggregated count. Resume records the exact last-used location.

### Path representation and mapper

Retain display path, native canonical path, source-relative path, and host/distro identity. A Windows `D:\Dev\app` and WSL `/mnt/d/Dev/app` may refer to the same underlying files; a WSL-native `/home/user/app` is a different location even when names match. Never canonicalize WSL-native case-sensitive paths using Windows case folding.

Mapping is explicit and boundary-aware: `/mnt/d/dev/app2` is not inside `/mnt/d/dev/app`. Normalize separators, drive casing where appropriate, trailing separators, and `.`/`..`, then resolve real containment with Windows junction/symlink/reparse-point behavior. Prefix string checks alone are insufficient. Revalidate just before sensitive reads/launches; account for links changing after discovery. No traversal outside approved roots, no recursive link cycles, no implicit access to network shares.

WSL mappings include distro/user identity and a verified `wsl.exe`/terminal invocation. UNC access to WSL-native roots remains opt-in and labelled potentially slower. Do not guess a distro from an unrelated current terminal.

## 5. Collection and freshness

### Scheduling

Proposed priorities: explicit user refresh/opened project → changed source debounce → normal periodic collection → background reconciliation. Start with two concurrent project jobs, one expensive filesystem-stat job, four bounded HTTP checks; tune from measurements. Per-job cancellation and timeout are mandatory. Root disable/removal invalidates queued jobs immediately.

Proposed watcher debounce: 500 ms per project, coalescing bursts into one job. Watchers are hints, not a correctness guarantee: reconcile on startup, after sleep, after watcher overflow, and once daily while running. A “nightly” schedule missed while off runs later rather than implying the laptop wakes itself.

Commit detector results in a short transaction only after schema validation. Attach source/config/generation IDs; reject results from superseded permissions/configuration. A timed-out L5 computation must not erase valid L1/L2 facts. Partial generations preserve last success and mark the failed layer.

### Detector matrix and constraints

| Layer | Planned behavior | Critical constraint |
| --- | --- | --- |
| L0 | Bounded metadata, extension mix, existence, approximate size | No placeholder hydration; no unbounded recursive counts |
| L1 | Parse package/Cargo/Python/Go/Java/Gradle/CMake/PlatformIO/Godot/signature files | Parse data only; never execute build scripts/config modules |
| L2 | Status, refs, recent log, remotes, submodules/worktrees | Disable optional Git writes; no fetch/pull/hooks/maintenance/network |
| L3 | Parse deploy fingerprints and candidate URLs | Reading candidate URL never grants network access |
| L4 | Titles, first meaningful README paragraph, changelog/license/docs inventory | Size/encoding limits; no executable Markdown; secret exclusions |
| L5 | Tracked structure, test signatures, TODO/FIXME counts | Bounded `ls-files`/`grep`, not an unlimited content crawl |
| L6 | Read session observations through verified service adapter | No prompt, permission, or session mutation endpoints |
| L7 | Optional future dependency/CI observations | No package-manager execution disguised as health; approved APIs or local metadata only |

Initial format support must have fixture-backed parsers for the original matrix; unsupported dynamic workspace expressions show unknown with a manual override. Shell evaluation is not a parser. Non-Git walking uses explicit skip patterns, depth/time limits, and binary/size exclusions. Workspace globs are expanded only inside approved boundaries. Multi-manifest components remain collapsed unless configured or promoted; detector ambiguity should produce a review suggestion, not extra cards by default.

### Git read-only boundary

Use structured executable/argument arrays, `--no-optional-locks` or `GIT_OPTIONAL_LOCKS=0`, bounded output, non-interactive settings, and a reviewed allowlist of Git subcommands/options. Default `git status` may refresh/write the index, so it is not acceptable unmodified. Examine configuration-driven fsmonitor/helpers and optional maintenance in the spike; disable unsupported helpers or decline collection with a clear explanation. Do not claim that the optional-lock switch is a universal sandbox.

No Git command runs hooks, external diff/textconv, credential prompts, fetch, or network discovery as part of collection. Verify actual behavior on supported versions/configurations; tests must include `.git`, ignored/untracked files, lock creation attempts, and configured helper cases, not just `git status` cleanliness afterward. A source configuration that cannot be observed safely remains unsupported until addressed.

### Cache invalidation

The original HEAD/manifest/index cache key is insufficient: editing an existing tracked working file need not change HEAD or index mtime. Include watcher generations and targeted working-tree refresh; reconcile after missed events. Ref changes, `.git` indirection/common-dir changes, packed refs, manifest/docs edits, root/config changes, and source availability invalidate the relevant layers. Avoid hashing whole trees merely to prove a cache hit.

Proposed caps: 10 seconds for normal per-project background collection, bounded 90-day activity window, and explicit approximate statistics on capped jobs. Large repos can raise limits deliberately. Always expose actual coverage and reason, not a falsely precise total.

## 6. Friday API and live updates

All routes below are **proposed Friday interfaces**, not existing OpenCode endpoints. Use schema validation at boundaries and stable error codes with redacted context. GETs never launch or mutate. Capability/permission checks occur server-side, regardless of UI state.

| Proposed endpoint | Purpose |
| --- | --- |
| `GET /api/bootstrap` | Settings safe for UI, capabilities, source health, initial cached Home data |
| `GET /api/projects?...` | Paginated/filterable effective project/checkouts summary |
| `GET /api/projects/:id` | Detail, selected checkout context, available actions |
| `GET /api/facts?...` | Provenance and override explanation |
| `PUT /api/overrides/:subject/:key` | Revision-checked authored correction |
| `POST /api/sources/preview` | Explicit bounded local preview under temporary granted scope; not persistent enablement |
| `POST /api/sources` | Persist approved root/destination configuration |
| `POST /api/refresh` | Queue permitted read work; return job ID |
| `GET /api/search?...` | Local permitted FTS/query results and typed action suggestions |
| `POST /api/actions/resolve` | Validate typed action, exact target, policy, and preview digest |
| `POST /api/actions/execute` | Consume valid authorization/idempotency key and record attempt |
| `POST /api/runs/:id/stop` | Explicit stop request for a verified Friday-owned run |
| `POST /api/tasks`, `PATCH /api/tasks/:id` | Idempotent capture/revision-checked changes |
| `PUT /api/notes/:id` | Optimistic revision save; conflict preserves user text |
| `POST /api/backups/restore-preview` | Validate manifest and preview authored replacement |
| `POST /api/backups/restore` | Confirmed restore transaction with pre-restore protection |
| `GET /api/events` | SSE committed-change notifications and source-health updates |

Response envelopes distinguish success, partial data, unknown fields, stale age, and operational failure. Proposed error codes include `SOURCE_OFFLINE`, `SOURCE_DENIED`, `UNSUPPORTED_CAPABILITY`, `APPROVAL_EXPIRED`, `CONFIG_CHANGED`, `REVISION_CONFLICT`, `ACTION_OUTCOME_UNKNOWN`, and `RATE_LIMITED`. Do not expose raw tokens/command environment values in stack traces.

SSE sends compact invalidations with monotonic event cursor and entity revisions after commit, not raw source files or secrets. Maintain a bounded replay window; reconnect with cursor, and require resnapshot if the cursor is too old or service restarts. Heartbeats detect stale connections. Client queries the store API for authoritative state. Update lists without losing focused row/filter selection or replacing unsaved note drafts.

### Local browser security

Bind explicitly to loopback, not `0.0.0.0`. Restrict Host to the actual local endpoints to mitigate rebinding; validate Origin on state-changing requests, use session-bound CSRF tokens, strict content types, and no permissive CORS. SameSite cookies/HttpOnly session handling and a restrictive CSP are planned; verify all launch/mutation routes reject cross-site requests. Reject null/unexpected origins rather than assuming localhost means trusted. Bootstrap/UI session cannot expose arbitrary execution endpoints without these protections.

The initial threat model includes malicious websites, malicious file contents, hostile paths/URLs, unauthorized Telegram users, and accidental repeats. It does not claim to defend against malware already executing as the same OS user or malicious trusted extensions.

## 7. Unified action lifecycle

An action definition has ID/version, class, typed argument schema, resolver, preview renderer, policy, executor, and audit result schema. A target inferred from source files is never sufficient authorization. Discovered command definitions must be explicitly adopted into Friday configuration.

```text
received → validated → resolved
                         ├─ read/capture → accepted → completed/failed
                         ├─ open / approved run + fresh human intent → authorized
                         └─ needs approval / offline request → awaiting_confirmation
awaiting_confirmation → authorized | cancelled | expired | invalidated
authorized → dispatching → running/opened → completed | failed
dispatching/running + ambiguous crash → outcome_unknown
```

Maintain durable transitions and unique idempotency keys. Two UI tabs or phone+laptop confirmations race through a compare-and-set transition: only one can authorize/dispatch. Expired, cancelled, consumed, or changed-config tokens never execute. Do not automatically reset `dispatching` to `received` after restart.

### Approval binding

Approval includes actor identity, action definition version, command executable/args, canonical checkout/distro identity, working directory, approved environment-reference/config versions, target resources, and digest. For an adopted package script, Make target, or Cargo alias, include the observed source definition/fingerprint: unchanged `npm run dev` arguments do not mean the underlying script is unchanged. Capture the resolved snapshot when previewing; recompute immediately before execution. Any meaningful mismatch invalidates remembered approval. Do not rely on a display string or a project name alone. Approval authorizes a configured invocation, not a guarantee that all transitively executed project code is immutable or safe; the Run write warning remains.

Remembered Run approval is revocable and local to exact configuration; it never authorizes scheduled/background execution. Explicit `/run` from the authenticated phone is fresh intent under the same rules as a click. Offline-delivered Open/Run always requires a new, single-use ten-minute approval. The authorization timestamp is Friday's observed interaction, not an assumption that Telegram's old message is still desired.

### Native execution and process ownership

Prefer direct executable launch with argument arrays and no shell. Package scripts/Make/Cargo commands are known execution adapters, not arbitrary string concatenation. Resolve executables from approved configuration and disclose environment inheritance. Never interpret a source path as executable shell code. Browser/file opens permit known schemes and explicit targets; block `javascript:`, unexpected protocols, and executable links masquerading as documents.

Open profiles report target results individually. Opening an external app is intentionally not a claim that the app cannot write. Session launch contains no `--prompt`, auto-approval, or run-mode flags.

Run supervision requires verified Windows/WSL process-tree ownership, start identity to avoid PID reuse, bounded log storage, duplicate detection, stop escalation, and crash handling. A Windows PID does not automatically identify the WSL child tree. D0 must validate a safe ownership mechanism; later Run work cannot ship with an unreliable kill-by-port implementation. Default intent: stop owned work gracefully on explicit Friday shutdown with a warning; browser-tab closure never stops it. Exact supervisor mechanics and interrupted-server behavior are a gate, not a guarantee of reattachment.

Proposed log limit: 10 MiB per run with 100 MiB total rolling budget; avoid raw environment dumps, redact known secrets, and explain that arbitrary program output can contain sensitive information. Do not upload logs. Stop is itself an authenticated action; audit whether termination was requested, verified, timed out, or uncertain.

## 8. OpenCode adapter contract

Research indicates current V2 normally uses a shared per-user background service, while standalone/explicit services have different scope. Persisted history visibility is not proof that another process owns current execution. The installed environment was not probed; do not hardcode V2, a port, or a global service assumption.

VG-05 must establish installed version/channel, service identity, reachable Windows→WSL endpoint, authenticated read-only access, schema, pagination, and observed TUI session coverage. No probe may auto-start an agent or scrape credentials. User-approved credential handoff goes through Friday secret storage. Windows-local discovery is not assumed to discover WSL registrations.

### Version-specific research leads, not universal endpoints

| Current V2 lead | Meaning/limitation |
| --- | --- |
| `GET /api/info` | Version/process/location info; no assumed universal `healthy` boolean |
| `GET /api/session` | Paginated `{data,cursor}`; directory/project/subpath filters must match installed schema |
| `GET /api/session/active` | Running drains owned by that service process, not all laptop activity |
| `GET /api/event` | Live events without replay; resnapshot after reconnect |
| Location routing | `location[directory]` query / directory header differs from session-list directory filter |
| Todos | No dedicated current V2 todo endpoint confirmed; recorded tool history may supply optional capability |
| Resume | Current lead: `opencode --server URL --session ID`, optional directory, no prompt; validate installed CLI |

Authentication research found HTTP Basic/password or paired token-as-password behavior in current middleware; do not infer Bearer support or no-auth from an incomplete schema. No observer-only credential scope is documented; Friday enforces a GET/read allowlist and never exposes the upstream credential to the browser or Telegram. Avoid collecting whole message histories merely for a count; optional todos can remain unavailable when privacy/capability cost is inappropriate.

Use the longest canonical location prefix with separator boundary and host/distro context. Sessions in deleted/unapproved paths can appear cached as Unassigned, but assignment does not grant filesystem access. Paginate until completion with cancellation and bounded incremental work. On failure retain previous records and mark service age; do not mark all sessions deleted or idle.

Resume checks existence against the selected service immediately before launch because a missing ID may create a new session on first input in some versions. If missing/unverifiable, show error or explicitly reviewed command rather than claiming success. API changes disable only affected capabilities.

## 9. Sites and approved networking

URL candidates are local facts; monitoring is a separate explicit permission. Canonicalize scheme/host/port, reject embedded credentials, and preserve path/query only as needed. Redirects are bounded and followed only within granted destinations. A redirect to another host pauses verification pending permission instead of silently broadening access. Review DNS/private-address behavior without breaking intentionally approved localhost services; no arbitrary URL proxy endpoint is exposed to the UI/Telegram.

Proposed defaults: every 5 minutes, 10-second timeout, maximum 5 approved redirects, 2 consecutive failures before Down, TLS expiry warning at 14 days. Immediate manual check can expose a failure without claiming a sustained incident. HEAD is preferred; if unsupported, use a bounded GET only to the same approved destination, without downloading a large body. Do not use a public control host unless separately approved.

Classify reachability, HTTP response semantics, TLS error, and local connectivity confidence separately. 401/403 mean reachable with access restriction, not fully functional. Partial API/deploy metadata can add evidence but never overwrite approved primary targets silently. Exponential backoff and Retry-After handling apply to providers. No deploy, workflow trigger, or dependency update call belongs to collection.

On sleep/stop/restart record gaps from the last successful observation to resumed checking. Do not reconstruct missing incidents. Proposed derived retention: 30 days detailed checks, 90 days activity/events, 7 days run logs subject to size budget; expose and allow changes. Retention removal does not rewrite historical uncertainty as uptime.

## 10. Search, documents, folders, and panels

FTS5 indexes permitted titles/headings/paths and optional bodies; parameterize queries, escape unsupported query syntax, bound result counts, and return type/context/default action. Prefix parsing (`p`, `s`, `d`, `t`, `>`) is separate from FTS grammar. Actions are typed suggestions, never executed during query evaluation. Exclude `.env*`, key/certificate material, credential stores, dependency/build paths, binaries, and cloud placeholders; maintain a reviewed exclusion policy and source-specific overrides that cannot bypass secrets indiscriminately.

Markdown parsing sanitizes raw HTML and unsafe links; remote images/assets are not fetched during preview. Large/invalid-encoding files get metadata-only entries with limitations. Source removal revokes access immediately, cancels work, purges index/cache/thumbnail content, and offers preserve/export/delete choices for authored annotations. Retained historical backups may still contain explicitly opted-in body content if such content entered operational exports; avoid backing up derived bodies by default and disclose any retained user material.

Folder map has one authoritative revisioned DB representation; `folders.yaml` is the user-facing synchronized representation in Friday's home, not a second independent writer. Import/export writes atomically, includes schema/revision, validates paths against permissions, and surfaces external YAML edit conflicts rather than overwriting notes. Native watcher stats do not silently mark every folder “read.”

### Panel contract, deliberately small

```ts
// Illustrative planned contract; not existing exported types.
type PanelResult<T> = {
  data: T;
  observedAt: string;
  lastSuccessAt: string | null;
  coverage: "complete" | "partial";
  warnings: { code: string; message: string }[];
};
// Collector input: validated config, scoped built-in read adapters,
// cancellation signal, and source/config generation.
// Collector output: validated serializable PanelResult, committed by store owner.
// UI input: stored result + generated settings + registered actions.
```

Start with only the built-in project presentation boundary. Add configuration schemas and templates as real needs arrive: file list for Quanta/docs, gallery for photography, Markdown for notes, URL status for sites, approved JSON URL/counter where two real panels justify reuse. Do not implement all templates because the gallery needs filler. No generic command-output collector.

Built-in adapters enforce permitted reads and approved HTTP destinations. Worker timeout/cancellation, size limits, schema validation, and per-panel health isolate accidental failure, not malicious arbitrary code. Trusted `source.ts` or `Panel.tsx` can bypass in-process wrappers; disclose this and do not install it automatically. Custom views must not obtain secrets through frontend configuration.

Photo metadata distinguishes capture time with offset, local-only EXIF time, and filesystem fallback. Proposed shoot grouping uses a four-hour gap between consecutive known capture times within the configured source, not a claim of a real event boundary. Unsupported/ambiguous timestamps and RAW previews remain labelled. Preview tooling must avoid original writes and cloud hydration; unsupported formats show metadata/fallback. Quanta first groups mirror files by configured first-level course folders; last-visit badges remain Friday-owned.

## 11. Telegram durability and authorization

Use a dedicated optional bot, one poller per bot identity, no webhook, explicit private-chat restriction, and the configured numeric sender ID. Ignore unauthorized updates silently while keeping bounded security diagnostics without message contents/tokens. Chat ID alone is not sender authorization. Rotate/revoke credentials via settings; old approvals bind bot/actor identity and become invalid when identity changes.

### Poll/accept protocol

1. Fetch updates using the last durable cursor; validate sender, chat, update type, payload size, and verb.
2. In a transaction, insert `(bot_identity, update_id)` if absent; persist normalized request and its class. Unauthorized updates can be durably skipped so they do not block the stream.
3. For Capture, atomically write the task/note and mark its accepted effect; repeated delivery finds the same result.
4. Persist an outbound reply entry and cursor only after durable acceptance of all preceding handled updates.
5. Next `getUpdates` with a greater offset acknowledges receipt. Execution completion is a separate state.
6. Dispatch accepted read/reply work; process Open/Run only after current policy authorization.

Do not assume update IDs are forever contiguous; Telegram may choose a new sequence after long inactivity. Avoid negative offsets that discard work. A reply sent immediately before a crash may be duplicated on retry because Telegram delivery is not transactionally coupled to SQLite; include stable request references and do not call that exactly-once messaging.

### Freshness and confirmation

Requests arriving from a previous server-off interval, or with uncertain freshness, require renewed authorization for Open/Run. Persist last-online/boot boundaries and compare original message time conservatively; clock skew or ambiguity falls back to confirmation. Authenticated direct commands while online are fresh human intent, but still need approval if the exact action configuration is not approved.

Callbacks contain a short opaque request token, not shell text or secrets; store token binding, sender, chat, action digest, expiry, and consumed state. Validate all on every callback; 1–64 byte callback payload limit is a design constraint. Acknowledge the callback promptly; authorization/dispatch completion is reported separately. Phone/laptop race on the same durable transition. Expiry is ten minutes from preview; a renewed preview re-resolves current configuration.

Read responses use cached data with timestamps; commands that resolve multiple projects/checkouts ask for selection rather than picking silently. Limit response size and frequency. No phone verb accepts arbitrary command text; `/run project configured-name` is an allowlisted registry lookup. Boot summary discloses waiting requests and unknown outcomes; it cannot recover updates Telegram no longer retains.

## 12. Backup, migration, restore, and lifecycle

Back up a consistent authored-state snapshot plus required identity/configuration files and manifest, using SQLite backup/transaction mechanisms rather than copying a live main file without WAL consideration. Include schema version, app version, timestamp, record/file counts, checksums, and required external credential references without values. Trusted extension source is authored content; arbitrary extension build caches are not.

Use a temporary Friday-owned destination, flush/validate, then atomically publish the completed backup. A failed backup cannot overwrite the previous good one. Catch up once after missed daily scheduling and before schema migrations; keep 7 daily + 4 weekly snapshots. Backups on the same disk are convenience recovery, not protection from device loss; export to a user-selected destination is explicit and never writes into an observed source accidentally.

Restore first validates manifest/checksums/schema, previews replacement, and makes a pre-restore backup. Pause collectors/actions/polling, reject concurrent mutations, restore authored data atomically, rebuild derived stores, then reconnect sources/secrets deliberately. Invalidate pending confirmation tokens and require renewed approval of restored Run definitions; restoring policy records must not revive stale execution authority. Never restore an in-flight execution as runnable. Retain current operational Telegram cursor/dedup state where compatible; if lost or restoring onto a new machine, reconnect in an explicit recovery mode that discards/asks about historical execution requests rather than replaying them. Test this boundary before claiming safe recovery.

Migrations have ordered IDs/checksums, transaction where supported, pre-migration backup, and clear failure recovery. No automatic destructive downgrade. Newer incompatible backups are rejected with guidance. An unsuccessful migration leaves original authored state recoverable and the app in a safe read-only/recovery screen.

Sign-in startup is opt-in, loopback readiness precedes browser opening, and only one host instance owns a data home. Closing tabs leaves the service active. Sleep pauses work; wake triggers bounded reconciliation, not a stampede. Explicit shutdown stops accepting new actions, records gaps, handles owned runs according to verified supervision policy, commits operational state, and closes the database cleanly.

Installation checks native prerequisites and access without changing projects. Updates preserve state, back up before migration, and show failures. Uninstall removes binaries/startup registration; deleting authored state requires a separate explicit choice. Logs rotate; diagnostic export previews redactions. No background updater or crash upload contacts an unapproved host.
