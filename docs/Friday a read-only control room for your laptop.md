# Friday: a read-only control room for your laptop

*Build spec, October 2026. Covers the read-only contract, architecture, project understanding without an LLM, the panel system, UX, the Telegram queue and every build stage.*

Friday is a local dashboard that reads your projects, sites, OpenCode sessions, documents and folders, shows them in the structure you already use, and launches anything from one place. It never writes into a project and asks nothing of one: it works out what a project is from the files and git history already there, with no model calls.

## 1. The read-only contract

Friday observes and never edits. Everything it knows comes from reading, and everything it stores lives in its own folder.

- **Never written:** no file created, edited or deleted inside a project, no git hooks, no config dropped into a repo, no hidden folders beside your files.
- **One home for state:** a Friday data folder (`%APPDATA%\\Friday`) holds the SQLite database, caches, thumbnails and your overrides. Caches can be deleted and rebuilt. Only overrides, tasks, notes and layouts are irreplaceable, so those are copied to a backup file daily.
- **Three kinds of action:** *Read* is always allowed. *Open* starts a program (editor, Explorer, terminal, browser). *Run* executes a command you configured, such as a project’s `dev` script, and is labelled because it can write build artifacts.
- **Run needs a human:** a Run action starts only from your click, or from a queued command you confirm.
- **Network:** only to hosts you added (site checks, GitHub, Vercel). Tokens stay in the OS credential store or a `.env` inside Friday’s folder.

The consequence is simple. Whatever Friday cannot infer, you teach it inside Friday, as an *override*, never inside the project.

## 2. What it is for: use cases

The design is judged by whether these moments take one click.

| Moment | You open Friday and… | It shows |
| --- | --- | --- |
| Starting the day | see what changed since yesterday | commits, failed or recovered sites, sessions waiting, queued Telegram commands |
| Switching context | ask “where was I on Penrose?” | last commit, uncommitted files, last OpenCode session, open tasks, last document, one Resume button |
| Launching a workspace | press Launch on a project | editor, WSL terminal, repo and live site, all opened in the right folder |
| Checking sites | glance at the Sites strip | up or down, response time, SSL expiry, last deploy |
| Finding a session | search for a word | sessions across all projects with title, project and last activity |
| Finding a document | search a title or heading | docs from projects, your vault and the Quanta mirror in one list |
| Remembering where things live | open Files | your own folder map with your notes, not a raw tree |
| Spotting neglect | sort Projects by last touched | cold projects, uncommitted work, unpushed commits |
| Capturing a thought | press the capture shortcut | a task or note saved and linked to the current project |
| Being away | send /task or /status on Telegram | commands queued, then run when the server starts |
| Watching an inbox | glance at Files | Downloads count and the newest items |
| Photography | open the Photography panel | latest shoot, this month’s count, the unsorted folder |
| Coursework | open the Quanta panel | new documents since your last visit, grouped by course |
| Weekly review | open the Review view | projects touched, tasks done, sessions run this week |

## 3. Architecture and data

There are three layers and one rule: the UI never scans anything. Collectors read the world, the store holds the results, and panels read the store.

```
 sources (read-only)        collectors (worker threads)      store (SQLite)        panels (UI)
 project folders   ──►  scanner, git, manifests, docs  ──►  facts + provenance ──►  Projects, Home
 OpenCode server    ──►  session poller                ──►  sessions_cache     ──►  Sessions
 URLs and APIs      ──►  site checks                   ──►  checks             ──►  Sites
 any folder         ──►  watchers, EXIF, thumbnails    ──►  panel_cache        ──►  custom panels
 Telegram           ──►  getUpdates                    ──►  commands           ──►  Away inbox
```

- **Server:** Node with Hono in TypeScript, run on Windows so it can see D: and open Explorer and VS Code natively.
- **Storage:** SQLite (better-sqlite3) with FTS5 for search.
- **Watching:** a file-watcher library with debouncing.
- **Git:** the `git` CLI, not a library.
- **UI:** Vite, React and TypeScript, served by the same server on 127.0.0.1 and updated live over Server-Sent Events.
- **Visual system:** decided separately. This document specifies behaviour, layout and states only.

| Table | Holds |
| --- | --- |
| `projects` | identity, root path, kind, parent (for subprojects), fingerprint |
| `facts` | one row per derived fact: project, key, value, source, confidence, seen time |
| `overrides` | your corrections, keyed by project identity |
| `sites`, `checks` | URLs and their check history |
| `sessions_cache` | OpenCode sessions as last polled |
| `docs_index` | FTS5 index of document titles, headings and paths |
| `tasks`, `notes` | your capture data |
| `events` | the activity feed |
| `panels`, `layouts`, `panel_cache` | panel config, positions and collector output |
| `commands` | the Telegram queue |
| `settings` | scan roots, open-with commands, thresholds |

Paths need care. OpenCode runs in WSL, so session directories probably come back as `/mnt/d/...` (my inference, to confirm). A path-mapper setting turns them into `D:\\...`. Repos stored inside WSL are reached through `\\\\wsl$\\<distro>`, which is slower, so each scan root is opt-in.

## 4. Understanding a project without an LLM

The principle is *facts with provenance*. Each detector reads files and returns facts tagged with their source and a confidence. Nothing is guessed silently, and unknown stays unknown.

| Layer | Reads | Facts it yields |
| --- | --- | --- |
| L0 filesystem | folder existence, modified times, counts by extension | size, last change, rough language mix |
| L1 manifests | package.json, Cargo.toml, pyproject.toml, go.mod, pom.xml, Gradle files, CMakeLists.txt, platformio.ini, project.godot, `.ino` files | name, version, description, scripts, dependencies, kind |
| L2 git | `git status --porcelain=v2 --branch`, `git log`, `git remote`, `.gitmodules`, `git worktree list` | branch, uncommitted count, ahead and behind, last commit, 90-day activity, remote owner and repo, submodules |
| L3 deploy fingerprints | `.vercel/project.json`, vercel.json, wrangler.\*, netlify.toml, fly.toml, Dockerfile, `CNAME`, `.github/workflows` | host, deploy target, candidate URLs, CI presence |
| L4 docs | README\*, docs/, CHANGELOG\*, AGENTS.md, CLAUDE.md, design.md, ADR folders, LICENSE | title, one-line description, latest version and date, document list |
| L5 structure | `git ls-files` (tracked files only, so ignored folders cost nothing) | key folders, test presence, TODO and FIXME counts via `git grep` |
| L6 sessions | OpenCode session directories | sessions per project, last activity |
| L7 health (on demand) | dependency and CI status | outdated dependencies, last CI result |

How a card is assembled:

| Field | Primary source | Fallback | If still unknown |
| --- | --- | --- | --- |
| Name | manifest name | folder name | folder name |
| Description | manifest description | first README paragraph | a *Needs a hint* chip |
| Stack tags | dependency lookup table (next to Next.js, tauri, bevy, wgpu, three, fastapi and so on), editable in settings | file-extension mix | extension mix only |
| Status | git: Active (touched within 14 days), Warm (60), Cold (older), thresholds editable | folder modified time | Unknown |
| Live site | override, then package.json `homepage`, then Vercel, Cloudflare or GitHub APIs (with a token), then `CNAME`, then README links near the words live or demo | none | no site LED |
| Docs | README, docs/, root `.md` files | none | empty state |

**Speed.** Use `git ls-files` for the file list, because it already respects .gitignore, and `git status --porcelain=v2 --branch` for branch, dirty count and ahead/behind in one call. Walk the filesystem with a skip list (node\_modules, target, dist, build, .next, .venv, **pycache**) only for folders that have no git.

**Freshness.** The cache key is the repo root, HEAD hash, manifest modified times and index modified time. Watchers invalidate only the project that changed. A full rescan runs nightly, and the project you open is refreshed on the spot.

**Deploy URLs.** Candidates are ranked by source and then verified with a HEAD request. Until one succeeds, the URL is tagged *unverified*.

**What this cannot do.** It cannot write a semantic summary beyond the README and manifest, judge code quality, or decide what to work on next. The compromise is a one-line note you write as an override. Later, an opt-in local model could summarize, cached by commit hash. It stays off by default so Friday is deterministic and free.

## 5. Adapting to project structure: monorepos and collections

Four entities: a **Collection** (a folder of projects), a **Repo** (a git root), a **Project** (a buildable or deployable unit) and a **Subproject** (a project inside a workspace). Rules apply in order:

1. Scan only the roots you list, minus the skip list.
2. A git root is a Repo. Without workspace config it holds one Project at its root.
3. Workspace config defines Subprojects: pnpm-workspace.yaml, package.json `workspaces`, Cargo `[workspace] members`, go.work, uv workspaces, Gradle includes, Maven modules. Turbo, Nx and Lerna layouts are covered through package workspaces.
4. Several manifests in one repo with no workspace config (say `app/` and `api/`) become collapsed *components* of one project, only if each has its own manifest and a different stack. You can promote a component to a project.
5. A non-git folder holding two or more projects, with no manifest of its own, is a Collection.
6. A folder with no manifest takes its kind from signature files (`.ino`, project.godot, platformio.ini, main.tex, notebooks), or stays a plain Folder titled from its README.
7. Submodules show as linked projects. Worktrees show as one project with several worktrees, detected through the shared git directory.
8. Undeclared nested repos show as separate repos tagged *inside X*.

**Identity.** A repo’s fingerprint is its first commit hash. Renaming, moving or cloning a repo does not create a duplicate card, and WSL and Windows clones merge. Non-git folders are identified by path, so moving one breaks its identity, and Friday warns you.

| Situation | Default | Why | Your override |
| --- | --- | --- | --- |
| Ambiguous nesting | don’t split | fewer false cards | promote to project |
| Two stacks in one repo | one project, two stack tags | one place to look | split into components |
| Several candidate URLs | first verified is primary | avoids a wrong LED | choose the primary |
| Huge repo | sample file stats, cap scan time | keeps scans fast | raise the cap |
| Moved non-git folder | treated as new | no stable identity | merge the cards |
| Drive disconnected | keep the card, mark it offline | never delete on absence | none needed |

Overrides live in Friday’s database, keyed by identity: rename, set kind, group, promote, demote, hide, archive, pin, set site URL, set docs folder, add note. Every card has a *Why this?* popover listing the evidence behind each fact.

## 6. Panels: the extension system

A panel is a collector (gets data), a view (draws it) and settings (configure it). There are three ways to add one, from least to most work:

1. **Template, config only.** Pick a template and point it at data: folder gallery, file list, markdown view, URL status, command output, JSON from a URL, counter.
2. **Custom collector.** Write `source.ts`, and the template draws the result.
3. **Custom view.** Add `Panel.tsx` for full control.

The built-in panels (Projects, Sessions, Files, Docs, Tasks) use the same contract. That is what keeps the system open: if the built-ins can be built with it, so can yours.

```
panels/
  photography/
    panel.yaml        required: id, title, template, config, reads
    source.ts         optional: custom collector
    Panel.tsx         optional: custom view
```

**Example: a photography panel with no code.**

```yaml
id: photography
title: Photography
template: folder-gallery
sizes: [medium, large]
config:
  paths: ['D:\\Photos']
  extensions: [jpg, jpeg, png, heic, arw, cr3, nef]
  group_by: shoot            # shoot | month | folder
  shoot_gap_hours: 4
  show: [latest, monthly_heatmap, unsorted_count]
  unsorted_folder: 'D:\\Photos\\_incoming'
refresh: watch               # watch | every 10m | on open
reads: ['D:\\Photos']          # the only paths this panel may read
```

Behind it, a watcher notices new files, the collector reads each file’s EXIF date, camera and lens, and thumbnails are written into Friday’s cache, never beside your originals. Photos taken within four hours of each other form one *shoot*. For RAW files, the collector reads the embedded preview instead of decoding the RAW. The panel shows the latest mosaic, a per-day heatmap and the unsorted count.

**Example: Quanta documents.**

- **Option A, config only (recommended):** use the `file-list` template on the folder your Quanta sync already fills. Group by first-level folder (the course), sort by modified time, and badge anything newer than your last visit. Friday stores the last-seen marker itself.
- **Option B:** if Quanta Pulse keeps its data in a readable local SQLite or JSON file, a `source.ts` can open it read-only and add announcements and deadlines. I have not seen how Quanta Pulse stores data, so check its app-data folder first.

A collector looks like this:

```ts
export default defineSource({
  id: 'photography',
  watch: (ctx) => ctx.config.paths,
  async collect(ctx) {
    // ctx.fs is read-only and limited to the panel’s `reads` paths
    // also available: ctx.git, ctx.http, ctx.db (own cache), ctx.config
    return { shoots: [], unsorted: 0 }
  },
})
```

Rules that keep panels safe and independent:

- Collectors get a read-only file API limited to the paths in `reads`; there is no write API.
- Each collector has a timeout, and a failure shows an error card without affecting other panels.
- Output is cached, so a panel always opens instantly with its last result and an *updated 2 min ago* stamp.
- The settings screen is generated from the panel’s settings schema, so configuring a panel needs no UI code.
- Config is validated on load, and a bad `panel.yaml` disables only that panel.

**Adding a panel from the UI.** *Add panel* opens a gallery of templates. You pick one, choose a folder with the system folder dialog, see a live preview, and place it. Edit mode lets you drag, resize (small, medium, large), duplicate and delete panels, and group them into *views* such as Home, Focus or Photos.

## 7. UX specification

### Principles

1. **Answer first.** Opening Friday shows useful content from cache within a second (a target, not yet measured). Scans never block the screen.
2. **One click to launch.** Any project, session, site or document is one click from open.
3. **Keyboard first, mouse friendly.** Every action has a shortcut and appears in the command palette.
4. **Show why.** Every derived fact has a *Why this?* popover with its source and age.
5. **Calm by default.** Attention goes to what needs it (a failed site, a waiting session, a queued command). Everything else stays quiet.
6. **No dead ends.** Every empty or error state names one next step.
7. **Teach once.** A correction is one gesture, and it sticks.
8. **Honest about freshness.** Show timestamps and stale marks, never a spinner over old data.

### Navigation

A left rail holds Home, Projects, Sessions, Files, Docs and Tasks, then your pinned custom views, then Settings and the scanner status dot at the bottom. The top bar has a search field that opens the command palette (Ctrl+K), the Away inbox badge and a recent-launches menu. The rail collapses to icons on narrow windows. Two-key shortcuts jump between views: `g h` Home, `g p` Projects, `g s` Sessions, `g f` Files, `g d` Docs, `g t` Tasks.

### Home: the Now view

From top to bottom:

1. **Attention strip**, shown only when something needs you: a failed or slow site, a session idle for a long time, queued Telegram commands, a scan error. Each is a card with one primary action.
2. **Continue card:** your last active project with branch, uncommitted count, last session title and next task. *Resume* opens the project’s default launch profile and its last session. A split menu offers the other targets.
3. **Since you left:** an event feed grouped by project, collapsed after five items.
4. **Pinned projects:** a row of compact cards.
5. **Sites strip:** a status light, name and response time per site. Click opens the site, and right-click shows 24 hours of check history as dots.
6. **Today:** tasks due today, plus a quick-add field.
7. **Scratchpad:** the global note.
8. **Your custom panels**, in your saved layout.

The order rule is attention first, then continuing work, then everything else.

### Projects

- **Toolbar:** view toggle (grid, list, tree), group by (collection, stack, status, none), sort (last touched, name, dirty first), and filter chips (Active, Dirty, Unpushed, Has site, Has session). Archived projects are hidden by default.
- **Card:** name, one-line description, up to three stack chips, a status dot with age (“3d”), git glyphs for dirty and ahead counts, a site light, a session count, a Launch button and an overflow menu.
- **Project page:** a header with name, path (click to copy), branch and the Launch split button. Tabs: Overview (facts, activity sparkline, evidence), Activity (commits and events), Docs, Sessions, Files (tracked-file skeleton to depth three), Tasks and notes. A right rail shows the *Why this?* evidence and the Fix menu: rename, set kind, set site URL, hide, archive, pin.
- **Subprojects:** a repo page lists its subprojects, each with its own stack chips and a Launch target for that subfolder. A breadcrumb reads Repo, then Subproject, and sessions and docs filter by subpath. Collections show as a group header over their child cards.

### Launching

- **Launch profile:** an ordered list of targets built from facts: editor at the root, terminal in WSL at the mapped path, resume the last session, repo URL, verified live URL, docs folder.
- **Triggering:** the primary click runs the default profile. The split menu lists each target. `Enter` on a focused card, or `L`, launches.
- **Open-with settings:** global editor, terminal and browser commands, each with a Test button.
- **Run section:** scripts found read-only in package.json scripts, Makefile targets and Cargo aliases. Each is labelled *Run*, may write files, and asks for confirmation the first time.
- **Failure:** a toast names the command that failed and links to settings. Failures are never silent.

### Sessions

A table grouped by project, with title, status (busy or idle), last activity and todo count. Filter chips: Needs attention (idle longer than a threshold you set), Today and Busy. Row actions are Resume (copies or opens the resume command) and Open project. Sessions whose directory matches no project land in *Unassigned* with an Assign action, stored as an override on the path. If the OpenCode server is unreachable, the panel shows the data age and an error card with start instructions.

### Files

Files shows your folder map, not the raw tree. The map is `folders.yaml` in Friday’s own folder, edited inline by clicking a note. A folder card shows its name, your note, item count, size, newest-file age and an Open button. Inbox folders carry a count, and folders untouched past a threshold get a stale hint. Search covers your notes and folder names, so “where do I put X?” works by keyword. Top-level folders missing from your map appear under *Not in your map*, each with an Add note button.

### Docs

One list across projects, your vault and mirrors, with title (first heading), project, path and modified time. Filters cover project and source. Recently opened and pinned documents sit on top, and a preview pane renders markdown. PDFs and other types open externally. Search is full-text over titles and headings, and optionally bodies, through FTS5.

### Tasks and scratchpad

- **Capture:** `c` anywhere opens a one-line field. `@name` links a project and `!` sets today.
- **Lists:** Today, Upcoming, Someday, Done.
- **Task shape:** text, an optional project and an optional date. Nothing else, on purpose.
- **Scratchpad:** one markdown note per project plus a global one, autosaved. Select text and press `t` to turn it into a task.

### Command palette

Ctrl+K works from anywhere, and the empty state shows recents. Prefixes narrow results: ` p  ` projects, ` s  ` sessions, ` d  ` docs, ` t  ` tasks, `>` actions. Each result shows its type, context and default action on Enter, with a secondary action on Shift+Enter. Actions take typed arguments, for example `> add task fix grid @friday`. Every button in the UI also exists as a palette action.

### Away inbox

Everything that happened while Friday was off: queued Telegram commands, site incidents, scan findings. Each card has *Run* or *Skip*, and a *Run all safe* button executes only read and capture commands.

### States

| State | Behaviour |
| --- | --- |
| Loading | Skeletons built from cached data, with no spinner over old data |
| Empty | One sentence on what appears here and one button, such as Add a scan root |
| Partial | Shows what is known; unknown fields carry a *Needs a hint* chip |
| Error | What failed, when, a retry button and copyable details |
| Offline | A site is marked down only after a control host answers, so your own outage does not turn everything red |
| Stale | A timestamp and a muted tint |
| First run | Three steps: choose scan roots, choose editor and terminal, review a draft folder map built from your top-level folders |

### Configuration surfaces

Settings has six sections: Scan roots, Open-with, Thresholds (active, warm and cold ages, idle session), Panels and views, Telegram, Backup. Layout edit mode works on Home and any view. Each panel’s gear opens a drawer with generated settings. A density toggle switches between compact and comfortable.

### Accessibility and speed targets

Everything is reachable by keyboard, focus is always visible, text meets WCAG AA contrast, reduced motion is respected, and no status relies on colour alone (every light has a label or shape). Speed targets, not yet measured: useful content from cache in under 1 s, a 50-repo scan in under 10 s, palette results in under 100 ms.

### Edge cases to design for

- **Disconnected drive or share:** show *offline*, never remove the card.
- **Detached HEAD, no commits yet, bare repos:** show the state without errors.
- **Two clones of one repo:** merged by fingerprint, with both paths listed.
- **Session for a deleted project:** goes to Unassigned.
- **Site returns 401 or 403:** counts as up, with a note. Redirects are followed.
- **SSL certificate expiring within 14 days:** warning.
- **Very large repos:** capped statistics, labelled approximate.
- **Symlinks and junctions:** never followed outside scan roots.
- **Cloud-synced folders with on-demand files:** read metadata only, never the contents of placeholders.
- **Long Windows paths and permission errors:** skipped and listed in a scan report.
- **Time zones:** store UTC, show local time.
- **Manifest name differs from folder name:** show the manifest name with the folder as subtitle.
- **Repo mid-rebase or merge:** show a state chip.
- **Many tasks:** Today caps at ten with *show all*.

## 8. Telegram as a command queue

Telegram’s own queue does the hard part. Incoming updates are stored on Telegram’s servers until your bot fetches them, for at most 24 hours, and `getUpdates` and webhooks are mutually exclusive ([Bot API](https://core.telegram.org/bots/api)). Friday uses long polling, so it needs no public URL and no tunnel. When the server starts, it drains whatever waited.

- **Exactly once:** an update counts as confirmed when you call `getUpdates` with an offset above its `update_id`. Friday first writes each update into `commands`, keyed by `update_id`, and only then advances the offset. A crash re-delivers instead of losing, and a duplicate cannot be inserted.
- **Three command classes:**

| Class | Examples | Behaviour |
| --- | --- | --- |
| Read | `/status`, `/p friday`, `/sessions` | answered immediately while online, answered on boot if they were queued |
| Capture | `/task fix grid @friday`, `/note idea` | executed automatically on drain, with a confirming reply |
| Launch or Run | `/launch friday`, `/run friday dev` | never auto-run; they land in the Away inbox, or you confirm with an inline button while online |

- **Security:** answer only your own numeric Telegram user id and ignore everyone else silently. Keep the token in the credential store. Accept no free-text shell: verbs are allowlisted and arguments are typed. Use a separate bot from your Quanta alerts bot.
- **Limits:** while the laptop is off, the bot cannot reply, so you get no “queued” acknowledgement. Commands older than 24 hours are lost. On boot, Friday sends one summary (“processed 3 commands, 1 waiting for you”). A small always-on responder could fix the missing acknowledgement later and is out of scope here.

## 9. Build order in detail

Effort is relative: S small, M medium, L large. Every stage ships something you can use, and every built-in panel is built on the panel contract from stage 0, so the extension system is tested from the start.

### Stage 0: Skeleton (S)

- **Goal:** a running shell that remembers things.
- **Build:** server, SQLite with migrations, settings, the live-update channel, the left rail with an empty Home, the panel registry and contract, the command palette scaffold backed by an action registry, first-run onboarding (scan roots, editor, terminal), and the daily backup of the irreplaceable tables.
- **Usable:** start it, add `D:\\Dev` as a scan root, restart without losing settings.
- **Done when:** a restart keeps your config, Ctrl+K opens with one test action, and a backup file appears.
- **Risk:** over-designing the contract. Build only what stage 1 needs.

### Stage 1: Projects and sites (L)

- **Build:** scanner layers L0 to L5, project identity, the structure rules, the Projects view and project page with evidence popovers, overrides and the Fix menu, launch profiles and Open actions, and Sites with HEAD checks, SSL expiry and history.
- **Usable:** one page shows every project with its state and site health, and any of them launches in one click.
- **Done when:** your real `D:\\Dev` renders; most names and stack tags are right and the rest are fixed with overrides in a few clicks; Launch opens the editor and terminal in the right folder; a site going down changes its light within one check interval.
- **Compromise:** heuristics will misfile some projects, which is why overrides ship in this stage and not later.
- **Risk:** WSL paths and speed. Scan from Windows and keep WSL roots opt-in.

### Stage 2: OpenCode sessions (M)

- **Verify first:** whether a standalone `opencode serve` lists sessions created by your TUI instances. If it does not, the adapter must target the right server. The [API reference](https://learnopencode.com/en/5-advanced/09b-remote-api) covers the endpoints.
- **Build:** an adapter (health and version, projects, sessions per directory, status, todos), the path mapper, matching sessions to projects by path prefix, the Sessions view with an Unassigned group, a Resume action, and session counts on project cards.
- **Usable:** see which session belongs to which project and resume it in two keystrokes.
- **Done when:** every session appears matched or in Unassigned, Resume opens a terminal in the right folder with the right session, and an unreachable server shows a clear error card.
- **Risk:** the API changes. All calls go through one adapter with a version check.
- **Security:** run the server on localhost only, and set its password as the [server docs](https://opencode.ai/docs/ja/server) describe (Japanese edition), because it can run agents.

### Stage 3: Tasks, scratchpad and search (M)

- **Build:** tasks, notes, quick capture, Today and Upcoming views, project links, global search over projects, tasks and notes, and the full palette with prefixes and typed actions.
- **Usable:** capture a thought in two keystrokes from anywhere and find anything by name.
- **Done when:** capture works on every screen, palette results feel instant, and tasks survive a restart and appear in the backup.

### Stage 4: Files map and Docs (M)

- **Build:** the `folders.yaml` editor, folder cards (counts, sizes, newest, stale), inbox flags, the unmapped group, a document indexer (READMEs, docs folders, your vault, mirrors), full-text search, markdown preview, recents and pins.
- **Usable:** your folders look like your own system, and any document is two keystrokes away.
- **Done when:** the map matches your real structure after one pass of notes, a heading search answers in about a second, and no file inside your projects or folders has been modified (check `git status` on a few repos and a hash on a few files).
- **Risk:** size scans on big folders. Cache them, scan incrementally and label figures approximate.

### Stage 5: The panel system for everything else (L)

- **Build:** the templates (folder gallery, file list, markdown, URL status, command output, JSON from a URL, counter), the Add panel gallery with live preview, the layout editor and views, generated settings, and the custom collector API with read-only file access and timeouts. Then build Photography and Quanta as proofs.
- **Usable:** add a panel in under two minutes without writing code.
- **Done when:** Photography works with config only, Quanta works with config only or by reading Quanta Pulse’s store, a broken panel does not break the page, and layouts persist.
- **Risk:** template sprawl. Add a template only after two panels need it.

### Stage 6: Away mode (M)

- **Build:** Telegram long polling, the `commands` table and command classes, the Away inbox, Windows toast notifications for attention items, and the boot summary message.
- **Usable:** send `/task` from your phone and find it done when the laptop wakes.
- **Done when:** commands sent while the server was off run once, in order, after start; a crash cannot duplicate them; messages from anyone else are ignored.
- **Risk:** the 24-hour limit. It is documented, not solved.

### Stage 7: Hardening (M)

- **Build:** the edge cases in section 7, a performance pass on large trees, a backup restore test, an accessibility audit and onboarding polish.
- **Later, optional:** opt-in local summaries, and exposing the action registry as an MCP server, which is a thin layer because the registry has existed since stage 0.
- **Done when:** restoring from backup brings back overrides, tasks, notes and layouts, and the edge-case checklist passes.

## 10. Risks and compromises

| Risk | Effect | Mitigation |
| --- | --- | --- |
| A heuristic misreads a project | a wrong card | evidence popover, one-click overrides, unknown stays unknown |
| The OpenCode API changes | the Sessions view breaks | one adapter, a version check, a graceful error card |
| WSL and Windows paths | wrong or slow results | Windows-side scanning, a path mapper, opt-in WSL roots |
| Scan load | a slow laptop | tracked-file listing, watchers, lazy refresh, caps |
| Read-only purity against convenience | Run actions may write artifacts | label Run, confirm the first time, never auto-run |
| Scope creep | it never ships | every stage is usable alone, and the Jarvis layer waits until after stage 7 |
| The Telegram 24-hour limit | lost commands | boot summary, documented limit |
| Local-only server | no phone access | later through Tailscale with added authentication, not in scope |

## 11. Questions only you can answer

- Which folders are your scan roots: only `D:\\Dev`, or others?
- Which editor and terminal should Launch use, and should the terminal open in WSL?
- Where is your folder system written down today? Friday needs a one-line note per top-level folder.
- Does Quanta Pulse keep its data in a readable local file, and where?
- Which sites go in the Sites strip first?
- Should the Telegram bot be new or reuse the existing one? I recommend a new one.

## Sources

I read these as search extracts and did not open the pages in full, so treat their details as leads to confirm. Git behaviour, manifest formats and workspace formats come from general knowledge and were not re-checked in this session.

- [Telegram Bot API](https://core.telegram.org/bots/api): update retention, offset confirmation, getUpdates against webhooks.
- [OpenCode server API reference](https://learnopencode.com/en/5-advanced/09b-remote-api): projects, sessions, status and todo endpoints.
- [OpenCode directory header](https://gist.github.com/remorses/b0389ce431bd96cd6e68124891d2df7f): one server serving many project directories.
- [OpenCode server docs, Japanese edition](https://opencode.ai/docs/ja/server): server password variable.
