# Friday: approved product and implementation plan

Status: approved direction; software not implemented. Prepared 2026-10-28.

This document set expands [the original build spec](../Friday%20a%20read-only%20control%20room%20for%20your%20laptop.md). The original remains historical input, not proof of an implemented capability. The user approved the decisions recorded here after four interview rounds and a consolidated review.

## Read in this order

1. [PRD](PRD.md): purpose, scope, workflows, numbered product requirements.
2. [UX specification](UX-SPEC.md): Material 3 Expressive desktop web design and interaction contracts.
3. [Technical design](TECHNICAL-DESIGN.md): ownership, data model, actions, permissions, and integration boundaries.
4. [Delivery plan](DELIVERY-PLAN.md): spikes, work packages, dependencies, acceptance scenarios, and release gates.
5. [Requirements traceability](REQUIREMENTS-TRACEABILITY.md): disposition of the original spec and interview decisions.
6. [Glossary](../../GLOSSARY.md) and [ADRs](../adr/): canonical language and durable architectural decisions.

## Interpretation rules

- **Approved**: explicitly agreed product behavior or boundary; changing it requires a recorded product decision.
- **Planned**: an implementation design, not existing code or an API promised by a dependency.
- **Proposed default**: a concrete starting value for implementation and testing, adjustable without changing the product boundary. These values were not individually approved in the interview.
- **Verification gate**: an unresolved technical fact that must be established before depending on it. A gate may change an implementation, not silently remove an approved capability.
- **Deferred**: intentionally absent from the relevant release. Do not build it as a convenient prerequisite.
- **Target**: a performance or quality goal, not a measurement.

When the original and these documents conflict, use the explicit revision in the traceability table. Do not resolve an undocumented conflict by guessing; record the decision. Keep requirement IDs stable as text changes.

## Approved agreement at a glance

| Concern | Agreement |
| --- | --- |
| Product | Single-user, personal, Windows-hosted local-browser control room |
| Observation | No modification of scanned sources; no per-project Friday files |
| Architecture | Collectors → store → UI; cache-first and deterministic |
| Visual system | Material 3 Expressive adapted intentionally to desktop web |
| First useful release | Onboarding, Projects, evidence, overrides, safe Open, basic Sites, expressive shell |
| Next increment | Version-aware OpenCode session integration, verified against the installed WSL service |
| Identity | Stable Friday project IDs; separate checkout state; ambiguous grouping requires consent |
| Launch | VS Code + Windows Terminal with a configurable WSL distro by default |
| Resume | Open context; never submit a prompt or automatically resume execution |
| Run | Explicit human action; remembered approval is bound to unchanged command and checkout |
| Telegram | Equal action authority to laptop; queued execution requests require fresh approval on either surface |
| Plugins | Constrained built-in config templates; custom code is trusted, not sandboxed |
| Privacy | Explicit roots and network permissions; no telemetry, LLM calls, or cloud indexing |
| Recovery | All user-authored state backed up; cache rebuildable; interrupted side effects not blindly retried |

## Documents versus implementation

No package manager, component library, watcher, testing framework, installer, or migration tool is established by this documentation work. Node, TypeScript, Hono, React, Vite, SQLite/better-sqlite3, FTS5, Git CLI, and SSE remain the planned baseline from the original spec, subject to compatibility spikes. Avoid introducing extra infrastructure without a demonstrated need.

No GitHub issues, application code, external project scans, credentials, Telegram bot, or running services are created by this plan. Publishing implementation tickets is a separate action.

## Verification register

| Gate | Must establish | Owner work package |
| --- | --- | --- |
| VG-01 | Windows Node runtime, SQLite native module, FTS5, worker and packaging compatibility | D0 |
| VG-02 | Read-only Git invocation and filesystem behavior under representative configuration | D0 |
| VG-03 | Windows↔WSL path mapping, native launch quoting, folder picker, and process ownership | D0 |
| VG-04 | M3 Expressive component gaps, accessible web primitives, and font licensing/bundling | D0 |
| VG-05 | Actual OpenCode version, service scope, schema, authentication, and reachable WSL endpoint | D2 |
| VG-06 | Quanta mirror location and supported file types; direct store access only if necessary | D5 |
| VG-07 | Safe preview support for photo formats and cloud placeholders without hydration | D5 |
| VG-08 | Telegram delivery, deduplication, approval replay resistance, and crash boundaries | D6 |

## Source confidence and research notes

Research is a planning input, not a compatibility test. Official Material pages were checked through indexed extracts because direct retrieval did not expose their JavaScript-rendered text; their statements must be revisited at implementation time. Official repository maintenance statements and the Telegram/Git references were available directly. OpenCode research used current V2 official docs/schema/source; the installed local version was not inspected. No credentials were read and no service was started.

| Topic | Primary references | Planning consequence |
| --- | --- | --- |
| Material web support | [Material web guidance](https://m3.material.io/develop/web), [material-web repository](https://github.com/material-components/material-web) | Do not claim an official Expressive web component implementation; official web repository is in maintenance mode |
| Expressive design | [Typography](https://m3.material.io/styles/typography/type-scale-tokens), [shape](https://m3.material.io/styles/shape), [motion](https://m3.material.io/styles/motion/overview/how-it-works), [adaptive layout](https://m3.material.io/foundations/layout/layout-overview/adaptive-design), [navigation rail](https://m3.material.io/components/navigation-rail/guidelines) | Translate official design rules into tested web components; do not equate mobile examples with desktop layout |
| Git status writes | [git-status background refresh](https://git-scm.com/docs/git-status#_background_refresh), [Git optional locks](https://git-scm.com/docs/git) | Disable optional index writes and validate broader no-write behavior |
| Git identity limits | [rev-list](https://git-scm.com/docs/git-rev-list), [shallow history](https://git-scm.com/docs/shallow), [rebase](https://git-scm.com/docs/git-rebase) | Root hashes are relationship evidence, not immutable identities |
| Telegram | [Bot API](https://core.telegram.org/bots/api), [getUpdates](https://core.telegram.org/bots/api#getupdates), [callback queries](https://core.telegram.org/bots/api#callbackquery) | At most 24-hour pending retention; durable acceptance before advancing offset; no exactly-once external execution claim |
| OpenCode V2 | [CLI](https://opencode.ai/v2/docs/cli), [OpenAPI](https://opencode.ai/v2/openapi.json), [client guide](https://opencode.ai/v2/docs/build/client), [troubleshooting](https://opencode.ai/v2/docs/troubleshooting) | Experimental/version-aware adapter; distinguish persisted sessions from process-owned activity |
| WSL networking | [Microsoft networking guidance](https://learn.microsoft.com/en-us/windows/wsl/networking) | Verify localhost reachability, firewall behavior, and collisions; do not default to public binding |

## Change management

For a product change, update the PRD requirement, affected UX/technical sections, acceptance tests, and traceability row together. Update ADRs only when the rationale changes; supersede rather than erase historical decisions. Keep setup instructions in `docs/agents/` authoritative for tracker operations. A change to this plan does not authorize running commands against scanned projects.
