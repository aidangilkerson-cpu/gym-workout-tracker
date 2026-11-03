---
name: Privacy mutation safety
description: Why intentional privacy regressions require isolated reads and source, not just rollback fixtures.
---

Run deliberate ownership-filter breaks only in an isolated source copy and private database tables/schema. Rollback-only fixture writes are not sufficient isolation for privacy evidence.

**Why:** Removing a filter can read real development records despite rolling back every new write. Changing watched source can also weaken the running Preview without publishing. A setup error must not be mistaken for the intended privacy failure.

**How to apply:** Isolate nested-table reads and ID sequences as well as fixtures; assert the failing run reaches the intended privacy assertion. Restore copied source in `finally`, confirm application source unchanged, and never capture real users' records as evidence.
