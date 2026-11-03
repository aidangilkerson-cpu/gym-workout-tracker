---
name: Browser test environment
description: Avoid confusing development browser verification with verification of the published app.
---

Confirm the actual browser origin after programmatic Clerk login. Do not assume
that requesting the published URL means the authenticated checks ran there.

**Why:** The available helper issued a development-instance sign-in ticket and
redirected the browser into Preview when the published site was requested.
Development and published authentication environments are separate.

**How to apply:** Use isolated synthetic accounts and owned fixture records,
check the actual origin, clean up created sessions, and clearly distinguish
Preview results from published-site results. Do not bypass authentication or
alter provider settings to force a production test.
