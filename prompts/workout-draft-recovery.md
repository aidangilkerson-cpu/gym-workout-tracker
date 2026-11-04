# Workout draft recovery — stranger-test fix

## Report and approved scope

Issue #39; branch fix/workout-draft-recovery from merged main. Branch and implementation were approved separately. Fix only lost in-progress session edits after phone lock/account recovery. Stop for approval before opening the PR; student review/merge and publishing remain separate.

The student reported that the participant locked her phone while doing a set and, on reopening it, saw:

> we could not reach your account. your session stay locked until the training server confirms who you are.

Retry restored access but erased previously entered edits. The student explained that this prevented logging between sets and effectively required entering the entire workout afterward.

This is the student's report of the real stranger test, not an independently observed physical-phone test by the agent. Two smaller reported struggles—dislike of technical member/sign-in IDs on the account/landing screen, and New session opening a blank workout rather than a saved-workout choice—are deliberately outside this fix. Data loss takes priority over presentation and start-flow convenience.

Approval: “Investigate and fix”.

## Cause found in the source

AccountGate returns an account-error panel instead of its child subtree when the account query fails. That unmounts SessionForm. Its draft, baseline, previous-result hint state, and pinned workout provenance were local component state only. A successful Retry mounts a new form from its initial source, losing entered values.

This establishes a destructive client lifecycle independently of the underlying transient account/network failure. It does not establish why the participant's particular phone failed its account request; no Clerk-provider outage or production-server defect is asserted.

## Decisions and implementation

- Add a versioned recovery checkpoint scoped by authenticated Clerk user, sign-in session, mode, and route/source query. Use this tab's sessionStorage, not shared cross-tab localStorage or the server's completed-session records.
- Keep an in-memory fallback for account-gate remounts when browser storage is blocked. Show a visible warning that reload recovery is unavailable in that case; do not promise durable recovery.
- Preserve every draft field, local row key, dirty baseline, pinned template/version provenance, prior-result reference, and edited-field hint state. A later template revision must not silently replace the draft's original version.
- Flush on draft/hint changes and pagehide/visibilitychange. A cold page can restore the checkpoint after normal authentication and data loading.
- Keep the account gate locked on failures, missing authentication, or a cached application identity that does not match the current Clerk user. Recovery is not an authorization bypass.
- Clear recovery copies on successful save, confirmed discard, explicit logout, or account change. Keep editing leaves the checkpoint intact. No unfinished workout is automatically saved as completed.
- Reserve restored row keys so newly added exercise/set rows cannot collide after reload.
- Show a restoration notice. Saved payloads do not contain recovery metadata.
- No backend contract, authentication configuration, database model, dependency, original plan, completed reflection, or published deployment change.

## Automated checks

- 53 client checks passed, including nine new recovery cases: complete/cold restoration; account/session/source isolation; removal and logout cleanup; blocked storage; invalid stored shapes; added/removed rows and blank values; and restored key allocation.
- Frontend TypeScript check passed.
- Targeted frontend production build passed. Existing tooltip sourcemap and bundle-size warnings remain nonblocking.
- Frontend managed workflow restarted once after the implementation batch and served cleanly; API workflow remained running unchanged.

## Browser verification

One tester performed a focused pass and a narrow continuation, on the confirmed development Preview origin at 402×874. No student account or records were used and no authentication bypass was added.

- A two-exercise draft retained whole-session and exercise notes, 134.25 lb, unequal reps 10/8/6/5 and 12/10/8 through a browser-intercepted account 503 followed by Retry, and through same-tab reload. Adding a set afterward produced a distinct row; Keep editing preserved entries, whereas explicit Discard cleared them.
- Saving through the real UI produced synthetic session 515. Editing its reps to 8/7/5 and changing notes, then repeating account-error/Retry, preserved the edits through the subsequent save.
- Logout with explicit discard cleared the draft. Signed-out account requests returned 401. A second synthetic account in the same browser context had an empty history and blank form, not the first account's draft.
- Initial attempts to dispatch visibility events did not make the automated browser change its actual visibility state or trigger a focus refetch. That partial test used account failure on reload and did not establish in-place refetch recovery. The same tester continued with the exact already-loaded TanStack focusManager singleton, transitioning false→true while the form remained mounted.
- That deterministic in-place refetch produced the account-error panel without navigation or reload, with the form hidden. Removing the browser-only 503 interception and clicking Retry restored the exact workout title, both note types, exercise name, 47.25 lb, and reps 9/7/5. No app code changes were needed after the initial browser pass.
- Template provenance was tested with synthetic workout 101: version 1 (149) was pinned in a populated draft, while a separate real API save created version 2 (150) with a different name/list. Cold reload retained version 1 and its original exercise list/results. The UI save payload and authenticated saved-session read both retained workoutVersionId 149, while the template's latest version remained 150.
- SessionStorage was checked directly: the checkpoint existed before save, was absent after save, existed for a separate draft before Discard, and was absent afterward.
- Cleanup deleted only synthetic sessions 515 and 516; the second deletion returned 204 followed by 404. The synthetic template was archived with versions retained. Synthetic account/library rows remain; no student data was changed.

Signed-in evidence: initial restored form `q1rjul`, edit recovery `n1ydsi`, in-place account error `3whgi7`, in-place recovered form `fa3p3n`, reloaded version-1 draft `pwqqwz`, saved version-1 detail `vajfbd`, explicit discard `wa5pge`.

**Limits:** This verifies equivalent account-failure/recovery and deterministic query-focus lifecycles in Preview, not physical iOS/Android lock/unlock, OS process eviction, or the published build. Recovery is tab-local browser storage, not cross-device synchronization. Browser-storage blocking has unit coverage and a visible warning, not a separate browser journey. Logout/account switching deliberately removes recovery; a new sign-in session does not inherit another session's checkpoint.

## Reflection and delivery boundary

The student supplied the stranger's observations; the source investigation and synthetic verification above are agent work. No additional participant observations or actual time measurements are invented. The two lesser concerns remain deferred while this data-loss fix is reviewed. Reflection 2 is not written in this branch.

After final whitespace/scope checks, commit and push, then stop before opening the linked PR. No merge or publishing is performed here.
