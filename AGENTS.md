# Friday

- This repository is currently spec-only: start with `docs/plan/README.md` for the approved expanded plan. `docs/Friday a read-only control room for your laptop.md` is preserved as the original input, not a description of implemented software. There are no manifests, scripts, tests, or established developer commands yet.
- For feature scope, safety, architecture, and release gates, read the relevant sections of `docs/plan/PRD.md`, `docs/plan/TECHNICAL-DESIGN.md`, and `docs/plan/DELIVERY-PLAN.md`. `docs/plan/REQUIREMENTS-TRACEABILITY.md` records deliberate revisions to the original. Treat proposed paths, APIs, and performance targets as plans to verify, not existing code or measured behavior.
- Core contract: Friday may read external projects but stores its own state outside them; it must not create or modify files inside scanned projects. Distinguish Open (launch a program) from Run (execute a configured command that may write artifacts); Run requires a human action or confirmation.
- Planned data flow: collectors read sources and populate SQLite; UI panels read the store rather than scanning sources. Derived project facts carry provenance and confidence; uncertain facts remain unknown and user corrections live in Friday's own overrides.
- Planned host boundary: the server runs on Windows to access drives and native launch targets; OpenCode sessions run in WSL. Verify session-server visibility and Windows/WSL path mapping before relying on either integration (§3, §9 stage 2).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `Akshay-VK/friday`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Model policy

Free models only (`opencode/deepseek-v4.1-flash-free`). Do not launch a paid model for any agent, subagent, or merger, even if an earlier session authorized one; that needs a new explicit owner instruction. Check spend with `opencode stats --cost`. If a free model is unavailable, stop and report rather than silently switching to a paid one.
