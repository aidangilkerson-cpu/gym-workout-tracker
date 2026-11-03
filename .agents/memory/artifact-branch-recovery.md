---
name: Artifact recovery after branch changes
description: Restore app registration safely when a Git branch switch temporarily removes an artifact manifest.
---

A branch switch that removes an artifact manifest can unregister the app and
remove its managed workflow. Restoring the manifest from Git alone may leave
registration missing even when the complete app files are back.

**Why:** During a workspace branch synchronization, the app disappeared from
the artifact registry and publishing became unavailable. Returning to the
correct source tree did not re-register it automatically.

**How to apply:** Check branch ancestry before switching. If registration is
missing after restoring files, reapply the unchanged complete manifest through
the validated temporary-manifest replacement procedure. Then check the artifact
registry and managed workflow list. Do not scaffold a duplicate app or manually
configure a replacement workflow. Confirm the app source still matches the
previously verified build.
