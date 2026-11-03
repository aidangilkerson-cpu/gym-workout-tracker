# Gym Workout Tracker

Solo app assignment repository.

This initial commit establishes the repository for the planning pull request. The student confirmed instructor approval for this one-time initialization exception. PLAN.md and subsequent assignment work will be added through linked Issues, branches, and pull requests.

## Current feature

Feature 1 adds email/password signup, login, logout, and a private account screen
using Clerk. A verified signed-in account is linked to a PostgreSQL `users` row.
Workout logging and the other planned features are not implemented yet.

## Tools and structure

- React, Vite, TypeScript, and Tailwind: `artifacts/gym-tracker`
- Express and Clerk authentication middleware: `artifacts/api-server`
- PostgreSQL and Drizzle: `lib/db`
- OpenAPI contract and generated clients: `lib/api-spec`, `lib/api-client-react`,
  and `lib/api-zod`
- Original plan: `PLAN.md`
- Development notes and evidence: `prompts/`

## Run in development

Use Node.js 24 and pnpm 10. Install with `pnpm install --frozen-lockfile`.
Provide `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and
`VITE_CLERK_PUBLISHABLE_KEY` through secure environment configuration, never
committed files. Replit provisions these for this project.

Apply the development schema with `pnpm --filter @workspace/db run push`.
In Replit, run the managed API Server and Gym Workout Tracker workflows; they
supply the required ports and routing.

For local development outside Replit, run the API with `PORT=8080` and the web
package with `PORT=5173 BASE_PATH=/`, with a same-origin reverse proxy routing
`/api` to Express and other paths to Vite. Cookie-based authentication requires
the UI and API to share an origin. Configure the development host with your
Clerk instance.

Run `pnpm run typecheck` for the full TypeScript check. After changing the API
contract, run `pnpm --filter @workspace/api-spec run codegen`.

## Publication

No published app URL yet. A development preview is not the submission URL.
The student must merge each feature pull request before publishing its update.

## Verification boundaries

Type checking, public-page rendering, responsive signup rendering, and signed-out
API protection were checked. Real signup/login/logout and the signed-in account
screen have not been exercised end to end. The assignment's workout-isolation
and dashboard tests will be added when those features exist.
