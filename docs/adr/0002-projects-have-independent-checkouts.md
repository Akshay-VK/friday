---
status: accepted
---

# Projects have independently tracked checkouts

Friday uses its own project identities and associates independently tracked local checkouts rather than identifying projects solely by a first-commit hash or merging clone state. Shared ancestry is ambiguous for forks, shallow histories, rewritten roots, and empty repositories; grouping suggestions therefore require confirmation when uncertain. This costs an extra entity and reconciliation flow but prevents the wrong branch, dirty state, session, or launch path from being shown or opened.

## Consequences

Overrides can apply at project or location scope. Worktrees retain separate working state, move/merge operations preserve authored records, and Resume never substitutes a different checkout silently.
