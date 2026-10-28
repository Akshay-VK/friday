---
status: accepted
---

# Custom panel code is trusted, not sandboxed

Config-only panels use constrained built-in collectors, but custom TypeScript collectors and React views are explicitly trusted code. An in-process read-only wrapper and a worker timeout do not prevent arbitrary code from importing filesystem/network APIs, so Friday will not advertise them as a hostile-code sandbox. This keeps the personal extension system practical while deferring the much larger isolation and distribution problem.

## Consequences

Custom code requires explicit trust disclosure, must be disableable during recovery, and is outside the same-user-malware threat guarantee. Arbitrary scheduled command-output panels are excluded because they bypass the deliberate Run boundary.
