# Friday product requirements

Status: approved product direction; implementation pending. See [interpretation rules](README.md#interpretation-rules).

## 1. Product thesis

Friday reduces the cost of returning to work spread across folders, Git repositories, OpenCode sessions, websites, documents, and small personal tasks. It answers three questions: **What needs me? Where was I? How do I open it?** It observes the structure already present rather than demanding new files or conventions in every project.

The primary user is the owner of one Windows laptop who develops in both Windows-accessible folders and WSL, maintains personal sites, and also manages coursework, photos, and reference documents. The initial product is not multi-user or remotely browsable. Telegram is a separate authenticated command surface, not a public dashboard.

### Success outcomes

- Return to the intended checkout and session without searching terminals and folders.
- Understand what changed without confusing an observation with an inference.
- Correct a wrong project classification once, without modifying that project.
- Capture a task locally or from a phone and find it after restart.
- Observe source failures honestly without losing useful cached context.
- Trust that background observation does not modify projects or execute work.

### Non-goals

No autonomous agent, semantic code reviewer, productivity scoring, universal IDE, source editor, Git management UI, package installation, dependency update execution, file organizer, cloud sync service, public API gateway, or indefinitely durable Telegram relay. No automatic pull/fetch, build, test, install, deploy, or prompt submission. Optional future LLM summaries, MCP exposure, phone dashboard access, and desktop-shell packaging are deferred, not hidden dependencies.

## 2. Release boundaries

| Release | User-visible outcome | Deliberately absent |
| --- | --- | --- |
| R0: foundation preview | Configure roots/tools; restart retains settings; accessible expressive shell; test backup/restore | Claims of full discovery or live integrations |
| R1: project control room | Discover and correct projects; choose checkout; open editor/terminal; monitor approved sites | OpenCode execution, Run management, Telegram, general plugin marketplace |
| R2: session continuity | Find, associate, and safely reopen real OpenCode sessions | Prompting, permission approval, universal live activity inference |
| R3: capture and execution | Tasks/notes/search plus deliberate configured Runs with tracked ownership | Scheduled jobs or commands inferred and executed without approval |
| R4: personal information map | Annotated folders and document search/preview | Arbitrary external file editing or organization |
| R5: configurable views | Template gallery, layouts, Photography, Quanta mirror | Untrusted code sandbox or unsupported format promises |
| R6: phone control | Authenticated Telegram reads/captures/actions and catch-up inbox | Always-on replies while laptop is off; requests older than Telegram retention |
| R7: hardened personal release | Tested restoration, accessibility, performance, installer/update behavior | Expansion into deferred product categories |

Run delivery is explicitly placed in R3: the original did not give it a complete process-management work package. R1 profiles contain Open only. Basic events and a stable panel/action boundary start early; later releases enrich them.

## 3. Approved safety and ownership requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| SAFE-01 | Collectors create, edit, and delete nothing in scanned sources, including Git metadata | Instrumented fixture tests plus before/after content checks |
| SAFE-02 | All Friday-authored state stays in its own data home; reject a data home inside an observed source | Configuration validation and filesystem tests |
| SAFE-03 | Read, Open, Run, and Capture remain distinct action classes | UI/palette/Telegram policy tests |
| SAFE-04 | A Run needs explicit human action on every invocation; background refresh never runs work commands | Scheduler and authorization integration tests |
| SAFE-05 | Open discloses that the external application may write; it does not promise application-level read-only behavior | Onboarding and action copy review |
| SAFE-06 | Observe only approved roots; constrain links/junctions and avoid placeholder hydration | Adversarial path and cloud-placeholder fixtures |
| SAFE-07 | Contact only approved destinations; permission does not expand through discovered links or redirects | Network adapter deny/redirect tests |
| SAFE-08 | No telemetry, LLM calls, cloud indexing, or externally fetched UI assets | Network audit and bundled asset inspection |
| SAFE-09 | Native execution accepts typed targets and structured arguments, not arbitrary Telegram shell text | Injection fixtures and action allowlist tests |
| SAFE-10 | Loopback binding, Host/Origin validation, CSRF protection, and secret redaction protect local operations | Browser-origin attack and API authorization tests |
| SAFE-11 | Custom collector/view code is explicitly trusted and cannot be advertised as sandboxed | Installation disclosure and extension tests |
| SAFE-12 | Never blindly retry an external action whose completion is unknown | Crash-recovery state-machine tests |

## 4. Primary journeys

### J1. First use

1. Start Friday intentionally; browser opens a loopback URL.
2. Explain observation versus Open/Run, data location, and network opt-ins in plain language.
3. Choose one or more scan roots; none are pre-granted. Preview discovered candidates using approved local reads.
4. Confirm candidates or exclusions; save configuration independently of scan completion.
5. Configure VS Code and Windows Terminal/WSL. Tests are explicit Open actions, not background checks that launch programs.
6. Offer an annotated folder-map draft when folder mapping is introduced; it never writes beside source folders.
7. Arrive at Home with cached/partial content and visible collector progress.

Failure paths: inaccessible root can be kept disabled or removed; disconnected root remains configured; launch-tool failure gives an actionable fix; cancelling onboarding never grants permissions or starts applications.

### J2. Start the day

Home opens from cache. Attention lists observed failures and pending decisions; Continue offers the last-used available checkout. Since you left compares against the last acknowledged visit, not a presumed midnight boundary. Group events by project and collapse after five items. Unknown periods stay explicitly unobserved.

One click on Continue opens the configured Open profile. No development command, agent turn, or previously pending Run is resumed as a side effect. A missing checkout presents alternatives and requires selection.

### J3. Discover and correct a project

Select a card, inspect its primary facts, and open Why this? for provenance. Rename, kind, stack, grouping, pin, hide/archive, site selection, and component promotion are Friday-owned overrides. Rescanning preserves them while updating the original evidence. Resetting an override reveals current derived data rather than restoring an old copied fact.

When two checkouts appear related, Friday proposes grouping with paths and evidence. A shared root commit alone cannot silently join them. Branch, dirty count, unpushed state, availability, and launch context remain per checkout.

### J4. Reopen an OpenCode session

Search title/context, inspect project and directory, select Resume. Verify that the session exists on the selected service, resolve its checkout, and launch the TUI with its session ID without a prompt. If the service is unavailable, keep cached results with age and offer reconnect or copyable instructions. A stale or missing ID fails closed; it must not create a new session under the guise of resuming.

### J5. Capture and review

Inside Friday, `c` opens capture except when typing. Enter saves to Friday; `@project` resolves a unique project and `!` marks today. Ambiguous names require selection. Today includes overdue work and shows ten rows before Show all. Notes autosave with visible saved/error status. A weekly Review reports observed activity without translating sessions or commits into hours or productivity scores.

### J6. Run deliberately

Choose a configured command on a specific checkout. Show command, arguments, working directory, and write warning. If no unchanged approval exists, confirm or cancel. Track the process and offer logs and Stop. A remembered approval removes the preview step, not the need for a new click or explicit phone command. Changes to command, environment bindings, directory, or configuration invalidate approval.

### J7. Use the phone as an equal control surface

While online, `/launch friday` executes the known Open action for the resolved checkout. `/run friday dev` resolves a configured command; if approval is needed, send a bound Run/Cancel preview on Telegram. An unchanged approved action can run directly from that explicit command. A read returns a snapshot with freshness; capture commits and acknowledges Friday-owned state.

After downtime, reads and captures drain safely; Launch/Run requests wait for a fresh Run now/Skip decision on phone or laptop. Confirmation expires after ten minutes. No laptop-only approval is required. Telegram cannot reply while Friday is off, and updates may disappear after at most 24 hours.

### J8. Restore after loss

Choose a backup, inspect date/schema/content counts and exclusions, validate it, create a pre-restore backup, confirm replacement, then restore atomically. Secrets are reconnected separately. Rebuild observations without recreating duplicate user records. Any inability to preserve the current state stops replacement and explains recovery options.

## 5. Functional requirements

### Projects, facts, and discovery

| ID | Requirement |
| --- | --- |
| PROJ-01 | Discover only enabled roots using L0–L5 detectors; keep layer-specific freshness and errors |
| PROJ-02 | Recognize manifest/workspace/signature formats listed in the original through a tested detector matrix |
| PROJ-03 | Separate Project, Repository, Checkout, Subproject, Component, and Collection relationships |
| PROJ-04 | Assign Friday-owned stable identities; offer evidence-based move/group reconciliation |
| PROJ-05 | Keep unavailable cards; absence never deletes user-authored records |
| PROJ-06 | Facts include source, observation time, detector version, confidence category, and limitations |
| PROJ-07 | Unknown remains unknown; incomplete results cannot erase valid user corrections |
| PROJ-08 | Grid/list/tree views support group, sort, filter, archive visibility, and selected checkout |
| PROJ-09 | Why this? shows the effective value, original evidence, override, age, and reset action |
| PROJ-10 | Detect submodules, worktrees, nested repos, empty/bare repos, detached HEAD, and merge/rebase state |
| PROJ-11 | Bound large scans; label partial statistics approximate with the reason |
| PROJ-12 | Expose overrides for naming, kind, grouping, promotion/demotion, hide/archive/pin, site/docs selection, notes, and session assignment |

Status thresholds retain the original Active ≤14 days, Warm ≤60 days, Cold >60 days as proposed defaults. Define touched evidence explicitly: prefer observed relevant working-tree changes and commit activity; folder mtime is a low-confidence fallback, not equivalent to work. An old checkout does not establish that the entire project is neglected.

### Actions and sessions

| ID | Requirement |
| --- | --- |
| ACT-01 | One typed action registry powers buttons, palette, and approved Telegram verbs |
| ACT-02 | Open profiles are ordered targets; show per-target results and partial failures |
| ACT-03 | Choose checkout before acting; never silently substitute a different clone or offline path |
| ACT-04 | Editor/terminal/browser settings have explicit Test actions and per-project overrides |
| ACT-05 | Command discovery never grants execution permission; enabling a command is a separate user decision |
| ACT-06 | Run approvals bind exact resolved configuration; every invocation has an audit record and actor/surface |
| ACT-07 | Track only Friday-owned processes, bounded logs, duplicate warnings, and explicit stop requests |
| ACT-08 | Native quoting handles spaces, Unicode, shell metacharacters, distro identity, and Windows/WSL paths |
| SESS-01 | Use an adapter gated by installed version/schema and selected WSL service identity |
| SESS-02 | Paginate all sessions; display matched and Unassigned results without dropping cached records on transient failure |
| SESS-03 | Match canonical paths by longest boundary-aware prefix and correct distro/host identity |
| SESS-04 | Distinguish running, observed not-running, unreachable, and unknown; age alone does not mean waiting |
| SESS-05 | Todo information is capability-dependent; unavailable is not zero |
| SESS-06 | Resume validates the session and never sends input, approves permissions, or starts an agent turn |

### Sites and activity

| ID | Requirement |
| --- | --- |
| SITE-01 | Distinguish discovered URL candidates, approved monitoring targets, and verified primary site |
| SITE-02 | Support Up/Down/Degraded/Unknown/Monitoring paused with text and observation timestamps |
| SITE-03 | Record response code/latency, permitted redirect results, TLS validity/expiry, and bounded check history |
| SITE-04 | Treat 401/403 as reachable with an access note; TLS failures and timeouts remain diagnostically distinct |
| SITE-05 | A control-host request requires explicit approval; inconclusive connectivity yields Unknown, not a fabricated site outage |
| SITE-06 | Manual recheck respects network permissions and concurrency limits |
| FEED-01 | Emit deduplicated meaningful changes, not an event for every scan or repeated failure |
| FEED-02 | Track last acknowledged visit and observation gaps; never invent incidents during sleep |
| FEED-03 | Weekly Review summarizes observed project changes, completed tasks, and recorded sessions |

### Tasks, files, documents, and panels

| ID | Requirement |
| --- | --- |
| TASK-01 | Task fields: text, optional project, optional due date, completion state; internal IDs/timestamps are bookkeeping |
| TASK-02 | Today includes overdue; Upcoming is future-dated; Someday has no date; Done is reversible |
| TASK-03 | Global and per-project Markdown scratchpads autosave; selected text can create a task |
| TASK-04 | Global capture is in-app only; no initial Windows-wide hotkey |
| FIND-01 | Palette supports recents, project/session/doc/task prefixes, typed actions, and secondary action hints |
| FIND-02 | Never execute an action merely because it matches a query; Enter invokes the displayed resolved action |
| FILE-01 | Folder map stores annotations, inbox flags, and approved roots in Friday's data home |
| FILE-02 | Folder cards show cached counts, approximate size where appropriate, newest age, availability, and Open |
| FILE-03 | Suggest unmapped locations only inside approved mapping roots; never scan all drives for suggestions |
| DOC-01 | Search titles/headings/paths across approved project docs, vaults, and mirrors; body indexing opt-in per source |
| DOC-02 | Markdown preview is sanitized and offline by default; PDFs/other documents open externally |
| DOC-03 | Store pins/recents separately from rebuildable document index entries |
| DOC-04 | Source removal purges indexed content and derived assets while offering explicit treatment of authored annotations |
| PANEL-01 | Built-in panels use the shared minimal collector/presentation/config boundary from the first release |
| PANEL-02 | Templates are added for demonstrated reuse, with validation, preview, and generated settings |
| PANEL-03 | Panel failure/timeout preserves last result and does not break unrelated panels |
| PANEL-04 | Layout editing supports move/resize/duplicate/remove and keyboard equivalents; named views persist |
| PANEL-05 | Photography groups by capture-time evidence and reads previews without changing originals |
| PANEL-06 | Quanta first reads an approved mirror; direct-store integration needs a separate compatibility decision |
| PANEL-07 | No scheduled arbitrary shell-command template; custom code requires explicit trust disclosure |

### Telegram, operations, and recovery

| ID | Requirement |
| --- | --- |
| TEL-01 | Separate optional bot, long polling, numeric user allowlist, private-chat restriction, no free-text shell |
| TEL-02 | Persist update acceptance before advancing offset; deduplicate capture transactionally |
| TEL-03 | Phone and laptop use identical action resolution/authorization rules |
| TEL-04 | Offline Launch/Run requests need renewed approval on either surface; ten-minute single-use confirmation |
| TEL-05 | Unauthorized senders receive no reply; authentication/configuration errors are visible locally without leaking tokens |
| TEL-06 | Boot summary distinguishes captures completed, reads answered, execution requests waiting, failures, and unknown outcomes |
| TEL-07 | Explain at-most-24-hour retention and inability to reply while off; reply text minimizes private data |
| OPS-01 | Sign-in startup is opt-in; closing a browser tab leaves the server running |
| OPS-02 | Expose start/reconnect/shutdown guidance and monitoring state; sleep creates an observation gap |
| OPS-03 | Secrets live in an OS credential store, never browser storage, application logs, or normal backups |
| OPS-04 | Back up all user-authored state daily, after missed days at startup, and before migrations; retain 7 daily + 4 weekly |
| OPS-05 | Restore validates compatibility, previews replacement, preserves pre-restore state, and is tested |
| OPS-06 | Retention and storage use are visible; cache cleanup cannot delete user-authored state |
| OPS-07 | Install/update/uninstall preserve user choice and never alter scanned projects |

## 6. Quality requirements and measurement

| ID | Target/contract | Measurement |
| --- | --- | --- |
| QUAL-01 | Useful cached content within 1 second | Browser navigation start → usable cached primary content; report p50/p95 |
| QUAL-02 | 50-repository scan within 10 seconds on an agreed local fixture | Report cold discovery versus warm refresh, hardware, roots, repo sizes, and exclusions separately |
| QUAL-03 | Palette local results within 100 ms | Input dispatch → rendered useful results; proposed fixture: 50 projects, 2,000 sessions, 10,000 document records |
| QUAL-04 | Document heading search within 1 second | End-to-end query over agreed index fixture; distinguish body-search mode |
| QUAL-05 | WCAG 2.2 AA target | Automated checks plus manual keyboard, zoom/reflow, screen-reader, focus, and contrast audits |
| QUAL-06 | Responsive and no blocked first paint from collectors | Delayed/error collector tests with cached UI and process responsiveness checks |
| QUAL-07 | Source-write violations are release blockers | Read-only fixture instrumentation; include hidden/untracked/ignored files and Git metadata |
| QUAL-08 | Local action endpoints resist cross-origin invocation | Host/Origin/CSRF attack tests; no GET-triggered side effects |

No latency claim passes by deleting difficult sources from the fixture without documenting the limitation. If targets fail, ship only with an explicit scope or target revision, not a misleading success statement.

## 7. Release acceptance and open decisions

Each release must pass its [delivery gate](DELIVERY-PLAN.md), preserve earlier requirements, document migrations and recovery, and disclose unsupported capabilities. All meaningful failure/empty/partial/offline states need an actionable next step.

Remaining environment values are onboarding choices: roots, WSL distro/user, sites, vault/mirror/photo paths, bot identity, and credential references. Remaining engineering choices include web primitive library, watcher, installer mechanism, exact native folder-picker bridge, and process supervisor details. Resolve them through bounded spikes; do not reopen settled product choices by silently dropping functionality.
