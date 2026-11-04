# Reflection 1 — Plan vs. Reality

The biggest gap between my original plan and the app I shipped was how previous workout results would appear when starting a saved workout. I wanted the tracker to help me remember what I lifted last time, but my plan did not clearly describe that everyday workflow.

In [Feature 8 of my original plan](https://github.com/aidangilkerson-cpu/gym-workout-tracker/blob/ec612567a0ec6dbdbf9a2297f8b471c9fed9ddc3/PLAN.md#L18), I described reusable workouts and starting sessions from their latest versions. In [Feature 10](https://github.com/aidangilkerson-cpu/gym-workout-tracker/blob/ec612567a0ec6dbdbf9a2297f8b471c9fed9ddc3/PLAN.md#L20), I wrote that users could “copy a previous session’s exercises, weights, and reps into a new dated session.” That described deliberately repeating a specific session. It did not say that starting a preset should automatically offer results from the most recent session for that workout. Those actions sounded similar to me, but they required different behavior.

I noticed the gap while reviewing Feature 8. I asked whether selecting a saved workout would automatically populate the weight and reps used previously. The [agent replied](../prompts/repeat-session.md#recovered-feature-8-clarification):

> “Not currently. Starting a saved workout fills in:
> - The workout name and ordered exercise list.
> - **Weight:** blank.
> - **Reps:** blank.
> - **Sets:** defaults to 3—not your previous set count.”

It then suggested:

> “That behavior could fit **feature 10, ‘Repeat a previous session,’** which we haven’t built yet.”

I decided to request the expanded behavior. My clarification, recorded in the [Feature 10 prompt log](../prompts/repeat-session.md#actual-requirement-excerpts), was: “yes plan that behavior and make it so it notes that is what you did last time until you fill in the new numbers.” This shows that the change was my call, although the agent suggested where it belonged in the build order. It was not a case of the agent ignoring an explicit requirement; I had not specified exactly what I meant.

The change cost me additional time and effort to recognize the omission and clarify the intended workflow. I do not have a measured time estimate. The important lesson was that a feature central to how I wanted to use the app could still be missing from a plan that seemed detailed.

[PR #24](https://github.com/aidangilkerson-cpu/gym-workout-tracker/pull/24) implemented both behaviors. Repeating a selected session copies that session’s results, while starting a preset offers matching results from the most recent session for that workout. “Last time” labels distinguish suggestions from newly entered numbers.

I would replace the original Feature 10 description with:

> **Repeat sessions and suggest previous results:** Let users repeat any selected historical session into an independent draft without changing its source. Separately, when starting a saved workout, use its latest template version and offer weights and individual set reps from the most recent saved session linked to that workout, including earlier template versions. Match exercises by stable ID, not name or position. Leave unmatched exercises blank. Label suggested values “Last time,” show the source date, and remove each field’s label when edited. Repeated-session values should say “Copied.” Neither action saves a session until the user explicitly chooses Save.
