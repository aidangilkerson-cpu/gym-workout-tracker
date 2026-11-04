# Reflection 2 — The stranger test

For the stranger test, I gave the live LiftLedgr app to my girlfriend, who is outside my class. She created her own account and used it for ten minutes while I watched without helping. The most useful finding came from her trying to use the tracker during a workout, rather than simply exploring its screens.

Her biggest struggle was losing an in-progress workout after locking her phone. She closed the phone to perform a set and reopened it to enter her results. The app displayed an account-confirmation error saying it could not reach her account. Clicking Retry restored access, but the edits she had already entered were gone. This undermined the main reason for using the app: recording results between sets. Instead, she would have needed to remember everything and enter the entire workout afterward.

The second struggle concerned the account-facing landing screen. She disliked seeing the technical member and sign-in IDs used by the application. Those details did not help her understand or use a workout tracker. They made the screen feel focused on the underlying system rather than the person using it.

The third struggle was the behavior of New session. From the Sessions page, she expected to start a workout she had already created. Instead, the button opened a blank workout. The application supported saved workouts, but this entry point did not match her expectation.

I prioritized the lost-edit problem because it destroyed work and interrupted the intended workout flow. The other issues mattered, but neither was as serious as making someone re-enter results they had already recorded. I addressed it through [PR #40](https://github.com/aidangilkerson-cpu/gym-workout-tracker/pull/40).

The investigation found that an account-check failure removed the workout form from the page. Its unsaved values existed only in that form’s memory, so Retry created a fresh form without them. The fix added a recovery copy scoped to the account, sign-in session, and specific draft. It preserves individual set reps, weights, notes, and the workout version originally selected. Recovery does not bypass authentication or automatically record unfinished training as completed.

The agent verified account-error recovery, reload recovery, save and discard cleanup, and separation between accounts using synthetic data in Preview. It also checked that a draft retained its original workout version after the template changed. These were simulated recovery checks, not a repeat of the physical-phone test. The fix was merged and published; I am not claiming that the participant retested it.

I decided not to fix the technical IDs or the New session entry point in this change. Keeping the fix focused made it easier to review and verify the data-loss behavior without mixing in unrelated interface changes. Those improvements remain useful future work. For now, protecting entered workout results is the more important tradeoff because the app must reliably support logging between sets before making that process more convenient or attractive.

The [fix log](../prompts/workout-draft-recovery.md) records the reported observations, investigation, verification, and limits.
