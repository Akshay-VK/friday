---
status: accepted
---

# Separate observation from authorized effects

Friday's collectors may read approved sources but never modify them; all Friday-authored state lives outside those sources. Open and Run are separate, explicitly authorized effect paths because a useful control room must launch applications and work commands without pretending those applications are read-only. This rejects both project-local configuration injection and a misleading promise that every downstream application cannot write.

## Consequences

- UI panels read the store rather than scanning sources.
- Command discovery is not execution permission; no collector or refresh path executes work commands.
- Read-only behavior includes Git metadata and helper processes, not merely tracked-file cleanliness.
- Unknown external outcomes are not automatically replayed after crashes.
