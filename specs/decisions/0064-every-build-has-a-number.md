# 0064: Every build has a number, and "newer" is a comparison

## Status

Accepted

## Context

CI publishes a rolling `latest` release on every push to main
([ADR 0013](./0013-ci-rolling-latest-windows-build.md)), and the app tells the user when a new one
appears ([ADR 0034](./0034-update-notification.md)). Both were built around the same gap: **nothing
in a build identified it as a build.** `package.json`'s version is hand-set (`0.1.0`) and never
touched by the pipeline, and the tag is always `latest`, so every installer ever produced claimed
to be the same version. `app.getVersion()` was useless, and the installers were indistinguishable
by name.

ADR 0034 worked around that by using the **commit** from the release body as the identity. A commit
is unique, but it is not *ordered* — the check could only ask "is this different from the one I
acknowledged?", which answers the wrong question. A re-run of the workflow, a rebuild of an older
commit, or a revert all publish a `latest` whose commit differs from yours, and every one of them
would have prompted the user to "update" to a build they were already past. The same absence forced
the awkward second half of 0034: because a fresh install couldn't say what it was, the first check
had to *baseline silently*, which means someone who installs a stale build is never told they're
behind.

## Decision

**The pipeline stamps a build number.** Before packaging, CI runs `scripts/stamp-version.mjs` with
the workflow's run number and writes `0.1.<run>` into `package.json` — major and minor stay the
hand-set release line, the patch position is the build. Run numbers only ever increase, so builds
are ordered; bumping the minor by hand outranks every build of the previous line, so the sequence
never goes backwards either way. electron-builder reads it from there, so the number reaches both
the installer's filename and `app.getVersion()` inside the packaged app. The stamp is a working-tree
edit in the runner, never committed — the repository keeps one hand-set version, not a commit per
build.

**The identity is the version, and the test is `>`.** The release body carries a machine-readable
`version: 0.1.<run>` line (the rolling tag can't carry one), and the app notifies **only when the
published version is strictly greater** than the running one, compared part by part as numbers —
`0.1.10` is newer than `0.1.9`, which a text comparison gets backwards. This supersedes 0034's
commit identity and, with it, the silent-baseline rule: a version says what you have, so a stale
install is told it's behind on its first check. Acknowledging (Download or ✕) still records that
version as seen, so a build is flagged once and the next one still is.

**Unreadable is "nothing to report".** A version that doesn't parse, a release with no version line
(one published before this ADR), an offline or rate-limited check — all resolve to no notice.
Prompting on a guess is worse than staying quiet. A build that isn't packaged has no stamped
version at all, so it doesn't check.

The rolling release itself is unchanged: still one `latest` entry, still not a release per commit,
for the reasons 0013 gives.

## Consequences

The three things that were guesses are now facts: which build an installer is (its filename), which
build is running (`app.getVersion()`, shown in the banner), and whether the published one is newer.
Downgrade prompts — the failure mode a re-run or revert would have caused every time — are
impossible by construction rather than by luck.

Ordering lives in one place, `src/shared/version.ts`, used by the stamping script and the update
check alike and tested as a black box; `electron/update-check.ts` is tested against a stubbed
GitHub, so "an older build never prompts" is a test rather than a hope.

The run number is per workflow: renaming or replacing `build-windows.yml` restarts it at 1, which
would publish a version *below* what's installed and silently stop notifying. Bumping the minor in
`package.json` when that happens restores order — worth remembering, and cheap to check, since the
version is now on the release page.

Versions are not commits, so a release page still names the commit it was built from (the body keeps
its `Automated build of <sha>` line) for anyone who needs the exact source. An install of a build
predating this ADR reports `0.1.0` and will be told, correctly, that it's behind.
