# Sign-up and Login Development Log

## Purpose and scope

Implement feature 1 only, after the original plan was merged through its planning
pull request. Work on `feature/sign-up-login` for the linked authentication Issue.
Do not add workout tables, workout logging, templates, stars, search, or charts.

## Approved implementation prompt

**Approval:** “Build feature 1 only”

**Brief reviewed before approval:**

> Read PLAN.md and GitHub Issue #3. Work only on feature/sign-up-login.
>
> Implement feature 1: Sign up and login using the approved React/TypeScript,
> Express, PostgreSQL, and Clerk stack. Add only the app foundation and users
> table needed for in-app email/password sign-up, login, logout, and authenticated
> access. Use the approved dark charcoal and lime-green style.
>
> Link each account to a users-table row. Enforce authentication on the server,
> show friendly errors, and keep credentials out of code and logs. Collect any
> needed credentials through secure setup, never chat.
>
> Save the implementation prompts, relevant response excerpts, decisions, and
> verification results in prompts/sign-up-login.md, formatted as development
> notes rather than a chat transcript.
>
> Do not build workout tables, logging, dashboards, or later features. Preserve
> the original plan. Do not commit directly to main, merge the feature PR, or
> deploy before the student merges it. Stop after implementation and verification
> so we can review before opening the PR.

## Implementation decisions

- Use the existing assignment repository and its actual feature-branch ancestry.
  The provided project template was not a replacement assignment repository.
- Clerk supplies embedded signup/login forms, email verification, session
  handling, and logout. Secrets were provisioned securely and are not recorded
  here. The browser uses same-origin session cookies, not custom password storage
  or manually managed bearer tokens.
- The single application table for this feature is `users`, with text primary
  key `id`, unique `auth_id`, and `email`, as planned.
- On authenticated `GET /api/me`, resolve the identity and verified primary
  email from Clerk and upsert the application account. This provisions the row
  before showing the linked-account screen and preserves its ID on repeat
  access. Identity is never accepted from query parameters or request bodies.
- Clear private query caches when the signed-in identity changes and on logout.
- Keep the public homepage accessible when signed out. Signed-in visitors go to
  their account area; logout returns to the public homepage.
- Preserve the approved original `PLAN.md` unchanged.

## Response excerpts

> “I’ll move this work into a Replit project to implement sign-up and login only,
> using your existing GitHub repository and feature/sign-up-login branch.
> We’ll stop after verification, before opening the PR.”

> “The server is running and correctly blocks account requests when signed out.
> The phone-sized check caught a layout issue: the sign-up form extends past the
> right edge. I’ll fix that before handing over this feature.”

## Correction identified during verification

**Observed:** At a 402-pixel phone width, the embedded signup card extended beyond
the right edge, clipping inputs and the action button.

**Correction:** Constrain the auth layout and nested Clerk card widths to the
available viewport, including minimum-width overrides.

## Verification record

- Full workspace TypeScript check passed.
- Development schema push succeeded; inspection showed only the `users`
  application table. No later feature tables were created.
- Both managed app services started successfully.
- `GET /api/healthz` returned HTTP 200 and `{"status":"ok"}`.
- Signed-out `GET /api/me` returned HTTP 401 with a friendly sign-in message.
- Supplying a different `userId` in the query still returned HTTP 401.
- The public landing page rendered successfully.
- The corrected signup form rendered at a 320-pixel-wide phone viewport without
  the previous clipping. The revised frontend typecheck also passed.
- At the initial implementation handoff, real signup/login/logout interactions
  and the signed-in account screen had not been exercised end to end.
  Subsequent account-flow verification is recorded below.
- The two assignment-required workout-isolation and dashboard tests are deferred
  until those features exist. These authentication checks are not a substitute
  for their later red/green evidence.

## Delivery boundary

### Branding revision during review

**Prompt excerpt:** “I like LiftLedgr”

**Decision:** Rename the visible app brand to LiftLedgr, using the exact spelling
chosen during review. Update the header, homepage copy, footer, browser title, and
social metadata. Keep the existing feature scope and original plan unchanged.

Implementation and verification only. No feature PR opened, no merge performed,
and no publishing performed in this build step.

## Subsequent account-flow verification

**Approval prompt excerpt:** “Verify feature 1”

**Scope:** Verify the account flow only; leave the feature pull request as a
draft, without merging, publishing, or starting another feature.

**Method:** Use Clerk's supported programmatic sign-in with a unique synthetic
development test identity, then drive the real application in a browser.
Do not interact with Clerk password/signup forms in this automated test. Do not
mock `/api/me`, insert an application user manually, bypass authentication, or
change application code or service settings to make the check pass.

**Results:**

1. In a fresh signed-out context, `/api/me` returned HTTP 401.
2. After programmatic Clerk sign-in, the app redirected to `/user-portal`.
   The actual `/api/me` endpoint returned HTTP 200. The account card displayed
   the matching test email and nonempty application and authentication IDs.
3. Refreshing retained the signed-in account and the same application ID.
   `/api/me` again returned HTTP 200 without an account error.
4. Clicking Log out returned to the public homepage, removed private account
   details, and made `/api/me` return HTTP 401 again.
5. Visiting `/user-portal` while signed out redirected to the public homepage.

**Relevant result excerpt:** “The supported programmatic mechanism was used,
and the actual `/api/me` endpoint succeeded; no mocked response, manually
inserted application row, middleware bypass, code change, or service
configuration change was used.”

**Automated-test limitations:** This verifies an authenticated session, account linking,
refresh persistence, logout, and signed-out protection. It does not verify
actual signup, entering a password, actual email delivery, or the
email-verification screens. Those checks were outstanding at this point and
were subsequently checked manually as recorded below. No changes to feature
scope or the original plan.

## Manual account checks confirmed by the user

These results were reported by the user in Preview. They are separate from the
automated browser results above and must not be presented as automated
password-entry or email-delivery coverage.

- **Password-policy observation:** The signup form required at least 15
  characters. A 10-character minimum was requested but was not applied. The user
  chose “Continue signup with 15 characters,” leaving the provider policy
  unchanged for this verification.
- **Signup and verification:** The user confirmed “Account created and verified.”
- **Password-based login:** After being instructed to log out and sign in with
  the newly created email and password, the user confirmed “Signed in and
  account linked.”
- **Refresh persistence:** After being instructed to refresh Preview, the user
  confirmed “Still signed in and linked.”

**Current boundary:** Account-flow verification is complete with automated
session/protection checks and user-reported manual signup/password checks.
Keep the PR as a draft pending approval to mark ready for review. Do not merge,
publish, or begin another feature during this verification step.
