# Friday UX and Material 3 Expressive specification

Status: approved direction with proposed implementation tokens. This is a behavior and visual specification, not evidence of a finished component system. Requirement IDs refer to the [PRD](PRD.md).

## 1. Visual thesis

Friday should feel like a personal place to regain context, not a metrics dashboard. The memorable element is **Continue**: a generous tonal surface that makes the next deliberate action obvious. Other surfaces recede. Projects are work you recognize, not identical KPI tiles.

Material 3 Expressive is the required design language on laptop/desktop web: meaningful shape hierarchy, tonal color roles, selective emphasized typography, adaptive panes, and motion that explains interaction. This is not permission to copy a phone screen into a browser or apply a large radius to every element.

### Web implementation constraint

Official Material guidance does not provide a complete Expressive web implementation; the official Material Web project is in maintenance mode. Select accessible web primitives only after the component spike. A third-party library's Material branding does not establish Expressive fidelity. Use a small Friday-owned token/component layer and document deviations. Do not create a generic design-system framework or a full spring-animation engine to ship the first screen.

## 2. Token proposal

These are **proposed seed values**, not individually approved contrast combinations. Generate light/dark Material tonal roles, then test every foreground/background and focus-state pairing. Status roles are separate from decorative theme choices.

| Seed/reference | Proposed hex | Role |
| --- | --- | --- |
| Harbor blue | `#295E91` | Primary seed; deliberate navigation and primary actions |
| Estuary teal | `#276A63` | Secondary seed; supportive context and selected groupings |
| Cloud blue | `#F4F7FC` | Light neutral reference, not a universal surface fill |
| Deep harbor | `#14212B` | Dark neutral reference, not text placed on arbitrary dark surfaces |
| Slate | `#566270` | Neutral reference for subdued information |
| Signal red | `#BA1A1A` | Error seed; derive accessible error/on-error roles |

- Consume semantic roles: `primary/onPrimary`, `primaryContainer/onPrimaryContainer`, `secondaryContainer`, `surface`, `surfaceContainerLowest/Low/High/Highest`, `onSurface`, `onSurfaceVariant`, `outlineVariant`, `error`, and state-layer roles.
- Light/dark/system selection persists immediately. Custom seed changes regenerate coherent roles, not isolated CSS accent values.
- Up, warning, failure, unknown, paused, stale, and running each have text/icon treatments. Never encode meaning only as green/red or theme hue.
- Selected, hovered, focused, pressed, and disabled states remain distinct. Disabled actions explain prerequisites when discovery is useful.
- Elevation communicates overlays and layering. Avoid a repeated gray shadow around every card; prefer tonal separation.

### Typography

Bundle Roboto Flex locally after license/format verification; use system sans-serif while it loads, without remote requests. Bundle only required Material Symbols assets or a subset. Paths and command previews may use a locally available or bundled monospace font; metadata does not need to be monospace by default.

| Role | Proposed size/line height | Use |
| --- | --- | --- |
| Display small | 36/44 px | Optional Continue project title when space permits |
| Headline medium | 28/36 px | View title; reduce gracefully with long names |
| Title large | 22/28 px | Panel or drawer heading |
| Title medium | 16/24 px, medium weight | Project names and section titles |
| Body large | 16/24 px | Primary reading and explanatory text |
| Body medium | 14/20 px | Tables, descriptions, supporting facts |
| Label large | 14/20 px, medium weight | Actions and selected chips |
| Label medium | 12/16 px | Short metadata, never the only place to read a critical error |

Use selective emphasized weight/width for the active destination, current project, or selected action; not every heading. No decorative all-caps labels. Body reading width is normally 60–80 characters. Preserve names; truncate only with an accessible full-name reveal. Error/confirmation text wraps rather than truncating.

### Shape, spacing, density

- Base spacing: 4 px; common spacing 8/12/16/24/32 px. Use alignment and whitespace before adding borders.
- Proposed shape mapping: small controls 8–12 px; content groups 16–20 px; Continue 28–32 px; pills only for appropriate chips and primary expressive controls. These are web mappings, not a claim that every official shape token is implemented.
- Comfortable rows: approximately 52–56 px; compact rows: approximately 40–44 px. Keep usable hit regions and adequate text line height; do not shrink every control with the data row.
- Preferred common touch/click target is 44–48 px; meet WCAG minimums and spacing in denser tables with explicit audit coverage.
- Chips communicate bounded state/filter choices; do not turn every fact into a chip.

### Motion

Use restrained standard motion for utilitarian flows, with expressive response around deliberate expansion, selection, and Continue. Motion must reveal where a drawer came from or confirm a change, not make the dashboard perpetually active. Start with reviewed web transitions; add spring behavior only where implementation and accessibility justify it.

Proposed fallback durations: 120–160 ms for state changes, 180–240 ms for panes, no mandatory entrance cascade. With reduced motion, remove spatial movement/morphs and retain immediate state changes or a short opacity transition. No looping attention animation, animated busy dots across every row, or rearranging cards while the user is targeting them.

## 3. Adaptive shell

The product is laptop-first, with a usable narrow-window fallback, not a separate phone dashboard. Decisions use available CSS viewport space and content needs rather than device detection. Test at 1280×720, 1440×900, and 1920×1080, plus narrow/zoomed layouts for accessibility.

| Available width, proposed | Navigation | Content/panes |
| --- | --- | --- |
| ≥1440 px | Expanded expressive rail, about 216–240 px | Main content plus optional 320–360 px detail/evidence pane |
| 1100–1439 px | Collapsed rail, about 80–96 px; expansion preference | Main content; detail drawer instead of permanent right pane |
| 760–1099 px | Collapsed rail or explicit navigation overlay | One main pane; cards reflow; toolbars wrap |
| <760 px or large zoom | Compact destination control/navigation overlay with full labels | Single-pane routes; dialogs become near-full-width; tables offer row summaries or contained scrolling |

Breakpoints are proposed and should move if actual content demands it. Do not retain an unusably thin third pane merely to honor a number. Collapsed rail items have accessible names and tooltips; navigation is never dependent on hover. Preserve selected route, filters, and focus when changing layout.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Friday             Search / Ctrl+K          Away (2)    Recent opens │
├──────────────┬───────────────────────────────────────┬────────────────┤
│ Home         │ Attention, only when actionable       │ Optional       │
│ Projects     │                                       │ context/evidence│
│ Sessions     │ Continue                              │ pane            │
│ Files        │ Penrose · selected checkout           │                │
│ Docs         │ [Resume] [Choose target]               │                │
│ Tasks        │                                       │                │
│ Custom views │ Since you left                        │                │
│              │ Pinned projects / Sites / Today       │                │
│ Settings     │ Scratchpad / personal panels           │                │
│ Scan status  │                                       │                │
└──────────────┴───────────────────────────────────────┴────────────────┘
```

At 720 px height, keep primary navigation and Continue reachable without scrolling through decorative chrome. Avoid sticky layers consuming the entire viewport. Header search is a button/combobox entry point into the shared palette, not a separate divergent search implementation.

## 4. Navigation and keyboard contract

- Rail destinations: Home, Projects, Sessions, Files, Docs, Tasks, pinned custom views, Settings; show unavailable future features honestly during incremental releases rather than dead buttons.
- Include a skip-to-content link, landmark structure, page title, route announcements, and a clear current destination.
- `g h/p/s/f/d/t` sequences navigate only outside editable controls, with a timeout and discoverable help. Proposed sequence window: 1 second.
- `Ctrl+K` opens the palette; `Escape` closes the topmost overlay and restores its invoking focus. Do not globally suppress Escape in editors or swallow browser shortcuts unnecessarily.
- `c` opens capture outside editable controls. `t` converts selected scratchpad text only within the documented note context. No Windows-global shortcut initially.
- On a focused project card, Enter invokes the labelled default Open action; `L` is a documented equivalent. Nested controls stop duplicate activation.
- Enter in palette invokes the displayed default; Shift+Enter invokes the displayed secondary action, never a hidden Run.
- Every command is discoverable in the action palette; purely local mechanics such as cursor movement are not separate business actions.
- Drag/drop and resizing have Move left/right/up/down, size selection, and reorder alternatives with announcements.

## 5. Screen specifications

### 5.1 Onboarding

Three primary steps remain: roots, tools, and review. The initial R0/R1 review shows discovered candidates and intended permissions; R4 enriches it with a draft annotated folder map. It is never a promise that a full scan has finished.

1. **Choose sources:** zero selected by default; local read permission scope and data-home location visible. Browse uses a Windows-native folder picker bridge verified in D0. Manual path entry is a supported fallback.
2. **Choose tools:** VS Code; Windows Terminal; selected WSL distro and optional user. Show resolved executable and folder mapping. A Test button explicitly launches a disposable/non-mutating target; it is never triggered on text change.
3. **Review:** enabled roots, excluded folders, no network integrations until separately enabled, and preview candidates. Confirm saves configuration and starts collection; Cancel leaves no source permission enabled.

If a scan is large, continue into the shell with progress and cached discoveries. Root accessibility, empty root, permission denied, invalid path, unsupported tool, and picker cancellation each have distinct copy and next steps.

### 5.2 Home / Now

Order is Attention → Continue → Since you left → pinned projects → Sites → Today → global scratchpad → custom panels. User layouts can customize lower sections but cannot hide a pending safety decision inside an unrelated view.

**Attention:** show active, actionable conditions: confirmed site failure, meaningful waiting status, approval request, failed backup, or scan error. Deduplicate repeated failures. Acknowledge removes visual emphasis, not the underlying failure. Old idle sessions appear only if the user enables an idle-age rule.

**Continue:** project name, selected checkout path/branch, dirty summary, latest relevant session, and next task when known. Resume is one explicit action; the menu exposes editor, terminal, session, repo, site, and docs individually. If the last checkout is offline, replace the primary action with Choose checkout; do not open another clone automatically. Before R2, session slots are omitted, not shown as broken.

**Since you left:** acknowledge the visit after successful presentation, not simply when the server boots. Group by project and show five items before expansion. Separate observed changes from gaps. Missing last-visit data produces a useful recent activity list with an honest label.

**Sites:** concise labelled status/latency; click opens an approved browser target, explicit history action opens check history. Provide a keyboard-visible alternative to right-click. **Today:** ten rows including overdue; Show all opens Tasks. **Scratchpad:** save state always available without showing a spinner over existing text.

### 5.3 Projects index

Toolbar: view grid/list/tree, group collection/stack/activity/none, sort last touched/name/dirty first, filters Active/Dirty/Unpushed/Has site/Has session, and search. Archive exclusion is visible and reversible. Store view preferences in Friday.

```text
Projects                           [Grid List Tree] [Group] [Sort]
[Active] [Dirty] [Unpushed] [Has site] [Has session]   [Filter…]

Web / Personal
┌────────────────────────────────────────────────────────────────┐
│ Penrose                     2 checkouts          Active · 3d    │
│ Interactive geometry experiments                               │
│ React  TypeScript  Vite       main · 4 changed · 2 ahead        │
│ Site: Up   Sessions: 3        [Open workspace ▾] [More]         │
└────────────────────────────────────────────────────────────────┘
```

Show up to three stack tags with accessible overflow. The Git row reflects the selected checkout and says so when alternatives exist. Unknown ahead/behind is `Unknown`, not `0`. The card body opens detail; its explicit Open button launches. Avoid click handlers on a whole card that compete with nested buttons.

List mode favors comparison across name, selected checkout, activity, dirty/ahead, site, and session count. Tree mode represents collections/project/subproject relationships, not an unrestricted filesystem explorer. Virtualization, if needed, preserves keyboard navigation and row semantics.

### 5.4 Project detail

Header: effective name, folder subtitle when different, copyable path, checkout selector, branch/state, Open split action, and More. Breadcrumb identifies collection/project/subproject without implying that all share one checkout.

Tabs: Overview, Activity, Docs, Sessions, Files, Tasks & notes. Omit unavailable release features or label them as planned in preview builds without misleading empty states.

- **Overview:** summary facts, stack evidence, site selection, recent activity, components/subprojects, availability.
- **Activity:** commits and Friday events, source filters, observation gaps, approximate/statistical limitations.
- **Docs/Sessions:** scoped by the active project and selected subpath, with an explicit all-checkouts option where meaningful.
- **Files:** tracked-file skeleton to depth three, lazy expansion within permission boundaries; not a source editor.
- **Tasks & notes:** linked tasks and project scratchpad; writes go to Friday only.
- **Why this?:** selected fact, effective value, override, supporting/conflicting evidence, confidence category, last success, detector limitation, and Reset override. On wide screens use a side pane; otherwise a drawer.

Fix actions: rename, set kind/stack, group, promote/demote, choose primary site/docs folder, hide, archive, pin, add note. Hide affects presentation; archive affects default inclusion; neither deletes source data. Merging/grouping previews identity effects; branch and dirty states remain separate.

### 5.5 Launch and Run

Use **Open workspace** or a target-specific label rather than ambiguous “Go.” A profile preview lists ordered Open targets and their resolved destinations. Browser/repo/docs/session targets are opt-in; default is editor + WSL terminal. Partial success shows per-target outcomes and offers retry only for failed Open targets after another deliberate action.

Run appears in a distinct section with a write warning. Discovery alone shows **Configure Run**, not a pre-authorized execution button. First approval shows:

```text
Run “dev” for Penrose?
Checkout: D:\Dev\penrose
Command:  npm
Arguments: run dev
Environment: inherited + approved references (values hidden)
This command may create or modify files in this checkout.
[ ] Remember approval for this unchanged configuration
[Cancel]                                             [Run]
```

During execution, show state, start time, output link, and Stop. Output is plain escaped text, bounded, and redacted where feasible; no terminal control-code execution or clickable arbitrary escape sequences. Duplicate detection warns with the existing run and offers View run/Cancel/Run another. Stop is explicit and reports whether termination is confirmed; never claim success based solely on sending a signal.

An uncertain interrupted run uses **Outcome unknown** with timestamp and inspection guidance. The primary action is Review, not automatic Retry.

### 5.6 Sessions

Table grouped by project: title, checkout/directory, observed state, last activity, optional recorded todo summary. Filters Today/Running/Needs attention are capability-aware. Idle threshold is optional; lack of running evidence is not proof of an idle or blocked session.

Unassigned includes unmatched/deleted-path sessions and an Assign action. Assignment stays in Friday. Service unavailable keeps cached rows and their age, plus reconnect/start instructions appropriate to the detected version. Never show missing todos as completed. Resume either opens a validated existing session or offers a copyable reviewed command; it never silently makes a new session.

### 5.7 Tasks, notes, and Review

Capture input shows syntax examples without requiring syntax. Parse project/date tokens only after user acceptance, preserving literal text when ambiguous. Save handles duplicate Enter presses idempotently. Escape retains unsaved text for the current interaction or explicitly offers discard; it does not silently save incomplete commands.

Today includes overdue, Upcoming future-dated, Someday undated, Done completed. Due dates are calendar dates; completion timestamps are instants. Reopening a task preserves original text/project/date. Selection-to-task creates the task and leaves note text unchanged unless the user explicitly chooses removal.

Scratchpads show Saving/Saved/Save failed and retain dirty content on error. Concurrent tabs use revision conflict handling, not last-write-wins data loss. Weekly Review states the date range and observed coverage, and links back to projects/tasks/sessions.

### 5.8 Files and Docs

Folder cards show your note, count scope, cached size, newest-file age, availability, and Open. Inline note editing has Save/Cancel and accessible saved status. Inbox counts are defined per configured folder, not inferred as “unread.” Unmapped suggestions appear only inside approved roots.

Docs list: title, project/source, path, modified time, pinned/recent indicators, and availability. Search/filter state stays visible. Preview shows sanitized Markdown; remote images are blocked with an explicit opt-in Open link subject to network policy. External documents use Open and retain the external-application write disclosure. Missing source keeps pin metadata while showing Unavailable; removing the source explains content purge and annotation options.

### 5.9 Panels and layout editor

Add panel gallery exposes only implemented templates. Flow: choose template → grant/read approved location → configure generated form → explicit preview collection → add to view. Preview does not run arbitrary commands or grant unrelated network permission. Target: add a supported panel within two minutes in a guided usability test.

Edit mode is clearly entered/exited. Panel controls include move, size small/medium/large, duplicate, remove, and settings. Undo removal restores configuration without recovering deleted source files because none were deleted. Invalid config disables that panel and offers edit/copy details. Trusted custom code installation has an unmistakable capability warning, not a pretend permissions sandbox.

Photography shows latest supported shoot preview, monthly capture counts, and incoming count; approximate capture times and unsupported RAW previews are labelled. Quanta groups mirror documents by configured course mapping and marks new items since last acknowledged visit without pretending to read the upstream service.

### 5.10 Away inbox and Telegram

Inbox categories: read/capture results, execution requests, observed incidents, scan findings. Distinguish **Received while offline**, **Discovered after reconnect**, and **Observed earlier**. Run all safe processes only reads/captures; it never authorizes Open/Run and does not pretend to execute incident cards.

Phone responses identify project and checkout, avoid sending full private paths/contents unless needed for confirmation, and expose ambiguous resolution choices. First-time Run preview offers Run/Cancel; queued requests use Run now/Skip with an expiry timestamp. Phone and laptop can act on the same request, but only the first valid authorization wins. Expired or already-used buttons return a clear outcome; acknowledge callback queries without treating acknowledgment as execution success.

Boot summary is one bounded message with completed/failed/waiting/unknown counts. No guaranteed queued acknowledgment while off. Keep token and sender ID out of screenshots/diagnostic exports by default.

## 6. Unified state contract

| State | Presentation | Next action and constraints |
| --- | --- | --- |
| First uncached load | Skeleton for structural layout, progress label | Configure source or wait; no invented placeholder values |
| Cached refresh | Existing content plus last-success age | Refresh remains nonblocking; no spinner covering known data |
| Empty configured source | Plain explanation of the query/scope | Change filters or inspect source |
| No configured source | One-sentence purpose | Add root/site/integration |
| Partial | Known fields, unavailable/unknown labels, per-layer error | Inspect evidence or retry failed layer |
| Error | Source, failed operation, time, copyable redacted details | Retry or settings; preserve cached result |
| Offline location | Retained card with unavailable path | Reconnect or explicitly choose another checkout |
| Stale | Explicit last-success age; muted supplementary styling | Refresh; never depend on tint alone |
| Monitoring paused | Gap boundary and pause reason | Resume monitoring; no synthetic outage history |
| Approval pending | Exact target and expiry | Confirm on phone or laptop, or cancel |
| Outcome unknown | Execution uncertainty and last known event | Inspect; no automatic retry |
| Backup failure | Persistent actionable attention item | Retry/check location; never label data protected |

## 7. Accessibility and review checklist

- Audit WCAG 2.2 AA, text/non-text contrast, focus appearance, keyboard order, landmarks, labels, dialogs, and error association.
- At 200% zoom preserve usable actions; at narrow reflow widths avoid whole-page horizontal scrolling except genuinely two-dimensional data regions.
- Announce results/save failures without narrating every SSE update. Coalesce live-region messages to avoid screen-reader overload.
- Pause auto-reordering while a row/menu is focused; preserve selected item through live refresh.
- Dialogs trap focus appropriately, have names, return focus, and expose Cancel before destructive/side-effecting action.
- Every color status has a label/icon; every hover-only explanation has focus/click access.
- Test long project names, Unicode, long Windows paths, empty descriptions, offline roots, many chips, and timestamp localization.
- Review actual screenshots at all target sizes and both themes; compare to M3 Expressive references and the Friday thesis, not only component snapshots.
- No stock metrics hero, decorative charts without provenance, repeated card shadows, externally fetched fonts, or unsupported claims of official component fidelity.
