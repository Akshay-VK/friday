---
status: accepted
---

# Telegram is an equal-authority action surface

The authenticated owner's Telegram commands use the same typed action registry and authorization policy as laptop interactions; no laptop-only confirmation is required. A laptop-only gate would defeat the requested remote-control workflow, so first approval and renewed approval may both happen on the phone. Delayed Open/Run requests still need a fresh, bound, single-use approval because delivery after downtime is not proof of current intent.

## Consequences

Every invocation needs explicit human intent, even with remembered unchanged-command approval. Sender validation, private-chat scope, expiring callbacks, configuration binding, durable idempotency, and phone/laptop race handling are security requirements; arbitrary shell text is not supported.
