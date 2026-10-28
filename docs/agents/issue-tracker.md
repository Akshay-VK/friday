# Issue tracker: GitHub

Issues and specs live in https://github.com/Akshay-VK/friday.
Use the GitHub CLI. In this WSL environment, invoke `gh.exe`; use
`gh` where available. Commands below use `gh`.

## Conventions

- Before creating issues, verify the target with
  `gh repo view --json nameWithOwner`. It must be `Akshay-VK/friday`.
- Create: `gh issue create --title "..." --body "..."`.
  For multiline bodies, use `--body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Apply label and state filters as needed.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post an explanatory comment first, then `gh issue close <number>`.
- Prefer native sub-issues and blocking dependencies when supported.
  Check CLI capabilities before using version-dependent flags.
  Otherwise, add `Part of #<parent>` and `Blocked by: #<n>` to child bodies
  and link children from the parent's task list.
  Work is unblocked only when all blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

- "Publish to the issue tracker" means create a GitHub issue.
- "Fetch the relevant ticket" means read the GitHub issue.
- For wayfinder, use one `wayfinder:map` issue with linked child issues.
  Children use `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
  Create these labels only when needed.
- Wayfinder frontier: first open child in map order with no open blockers
  and no assignee. Claim with `gh issue edit <n> --add-assignee @me`.
- Resolve a child by commenting with the answer, closing it, and appending
  a summary and link to the map's Decisions-so-far.
