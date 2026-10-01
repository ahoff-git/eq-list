# 0279: The app updates itself

## Status

Accepted

## Context

[ADR 0034](./0034-update-notification.md) told the user a newer build existed and stopped there: a
dismissible banner whose **Download** button opened the release page, and nothing more. The user
still had to fetch the `.exe` and run the installer by hand, every build. That ADR named the two
reasons it stopped short of a real auto-updater: there was no real per-build version feed (the tag
is always the rolling `latest`, ADR 0013), and no code signing — both called "more machinery than
this needs" at the time, with an explicit note that auto-update was an additive step for later.

The first reason is gone. [ADR 0064](./0064-every-build-has-a-number.md) gave every build a real,
ordered version (`0.1.<run>`, stamped before packaging) specifically so "is the published build
newer?" became a question with a reliable answer. The second — code signing — is a separate cost
decision nobody has made, and this record doesn't make it: the app ships unsigned today, a person
already accepts that running the installer, and nothing here changes that trust model. It only
removes the manual step in the middle.

## Decision

**`electron-updater` replaces the notify-only checker, riding the same rolling release.**
`electron/update-check.ts` is retired; `electron/auto-update.ts` wraps electron-updater's
`autoUpdater` instead. No change to the publishing pipeline itself: CI still pushes one `.exe` to
the same rolling `latest` GitHub release on every push to `main`. The only addition is that
electron-builder's `publish` config (added to `package.json`) makes it also write `latest.yml` and
the installer's `.blockmap` into `release/`, and CI uploads those two alongside the `.exe`.
electron-updater reads `latest.yml` to learn the published version, compares it to `app.getVersion()`,
and — because both come from the same build-number stamp ADR 0064 introduced — the comparison it
needs is already the one this app has been making since that record landed.

**Download and install, not just notify.** `autoDownload` and `autoInstallOnAppQuit` are both on:
a newer build fetches in the background the moment it's found, and installs itself the next time the
app quits — the tray's "Quit", or Windows shutting it down — with no further action required.
`UpdateBanner` only ever shows two things worth seeing: a light "downloading…" line, and once it's
ready, a **Restart now** button for someone who doesn't want to wait for their next natural quit. A
dismiss on that banner hides it for the session; the installer still lands on the next quit, because
dismissing is about not being interrupted *now*, not about declining the update.

**Checked more than once a launch.** The old checker only asked on startup. This app is a long-running
overlay — someone can leave it open for days — so `auto-update.ts`'s `check()` also runs every six
hours while the app stays open, not just once at launch.

**Every failure is still silent.** Offline, rate-limited, or a malformed `latest.yml` all resolve to
an `error` state that's logged and never surfaced — the same rule ADR 0034 established, carried into
the new module's state machine (`idle → checking → available → downloading → ready`, with `error`
reachable from any step).

**Unsigned stays unsigned.** Nothing here adds code signing. An update installs with the same trust
posture as today's manual installer — no new SmartScreen story, better or worse, than what already
ships.

## Consequences

The manual step is gone: a user who keeps the app running gets updated within six hours of a push to
`main`, without visiting a release page. `electron/update-check.ts`, its test, and the two helpers
`version.ts` carried only for it (`isNewerVersion`, `versionFromRelease`) are deleted —
`parseVersion`/`compareVersions`/`withBuildNumber` stay, since `scripts/stamp-version.mjs` still
needs them and nothing about build-number stamping changes.

The CI publishing shape (ADR 0013) and the version-stamping rule (ADR 0064) are both unchanged and
still load-bearing — this ADR is additive on top of them, not a replacement.

The accepted gap: code signing is still not part of the picture, so a fresh *install* still shows
whatever unsigned-binary friction Windows already shows today. That was true before this change and
stays true after it; it's the obvious next step if it's ever worth the cost, and is deliberately left
for its own decision rather than folded into this one.
