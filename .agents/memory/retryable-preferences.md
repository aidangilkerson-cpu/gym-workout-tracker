---
name: Retryable preference updates
description: Why saved binary preferences use desired-state commands instead of blind toggles.
---

Save the explicitly desired state for a preference rather than asking the
server to blindly flip its current value. Keep the action safely repeatable.

**Why:** A server can commit a change even when its response is lost. Retrying
a toggle would undo that successful change. A failed response therefore means
the change is unconfirmed, not proof that nothing was saved.

**How to apply:** Preserve this behavior for stars and future saved binary
preferences. Show the confirmed state, describe uncertain failures honestly,
and retry the desired state without reversing it.
