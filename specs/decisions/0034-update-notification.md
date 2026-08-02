# 0034: Tell the user a newer build exists; don't install it for them

## Status

Accepted

## Context

CI publishes a rolling `latest` GitHub release on every push to main
([ADR 0013](./0013-ci-rolling-latest-windows-build.md)). Nothing told a running app that a newer
build had appeared, so a user stayed on whatever they installed until they happened to check the
releases page.

Two things make the obvious solution awkward. First, the release **tag is always `latest`** and
the **version isn't bumped per build**, so neither the tag nor `app.getVersion()` can tell two
builds apart — the only per-build identity is the commit, which CI writes into the release body
("Automated build of `<sha>`"). Second, a full auto-updater (electron-builder + electron-updater)
wants a real version feed and, to avoid a SmartScreen scare on every silent install, code signing
— neither of which is set up, and both of which are more machinery than "there's a new build" needs.

## Decision

**Notify, with a link — no auto-install.** On launch the main process asks the GitHub API for the
`latest` release, reads the commit from its body, and compares it to the commit we last
acknowledged. A different commit means a newer build; the renderer shows a dismissible banner whose
**Download** button opens the release page. Nothing is downloaded or installed on the user's behalf.

**Identity is the commit; the baseline is what you've acknowledged.** The first check ever just
records the current latest silently — a fresh install is almost always current, and notifying
someone who just installed is noise. After that, Download or Dismiss records that commit as seen,
so a build is never flagged twice, but the next one still is.

**A broken check is silent.** Offline, rate-limited, or malformed responses all resolve to "nothing
to report". An update check must never delay startup or interrupt the app.

## Consequences

No build-pipeline or packaging changes, and no new dependencies: the whole feature is a `fetch`, a
one-line state file (`update-state.json`), and a banner. It rides on the release CI already
publishes.

The tradeoff is the honest one for a per-launch, commit-based check: someone who installs a *stale*
build won't be told they're behind (their first check baselines to the current latest). The common
path — keep the app, get told when the next build lands — is covered. If auto-update is ever wanted,
it's an additive step (electron-updater + signing), and this notifier can retire or coexist.
