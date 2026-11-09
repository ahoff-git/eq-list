# 0373: Release notes are a release line, and how-to guides are checked against the code

## Status

Accepted

## Context

The app updates itself ([ADR 0279](./0279-the-app-updates-itself.md)) and says nothing about what changed. Somebody who
installs a build after a month away gets a window that behaves differently from the one they remember, with no way to
find out how. The player asked for three things: tell a player what changed when they update — and if they jumped from
v1 to v5, show v2, v3, v4 and v5; keep that history readable inside the app; and add how-to guides for the parts of the
app people miss, with a process that keeps those guides true.

The obstacle to "v1 to v5" is what a version *is* here. Every push to main publishes a build stamped
`major.minor.<CI run>` ([ADR 0064](./0064-every-build-has-a-number.md)). The patch is a counter the author of a note can't
know when writing it, and CI never commits the stamp, so a note can't be keyed by it. The part a person does set, by hand,
is the `major.minor` — ADR 0064 calls it the release line.

Docs are also where drift lives. A how-to that says "press Ctrl+Shift+L" is correct until the hotkey moves, and then it
is wrong in a place nothing checks.

## Decision

- **A release note is a release line.** The change that adds a note for `0.4` is the change that bumps `package.json` to
  `0.4.0`; every build of that line (`0.4.17`, `0.4.18`…) carries the same note. The notes are `CHANGELOG` in
  `src/shared/releases/changelog.ts` — code, so they ship inside the build and need no network — newest first.
- **What a player is owed is a pure function** (`notesSince`): every line after the last one they were shown, up to the
  one running, newest first. Skipping builds changes nothing — `0.1.x` to `0.5.x` yields `0.5`, `0.4`, `0.3`, `0.2`. A
  later build of the same line yields nothing. With nothing remembered (a first install, or an update from before this
  was tracked) the answer is the newest note alone, not the history.
- **The marker is the newest version whose notes were shown**, kept in main's UI store (`eqlist.main.releaseSeen`), and it
  is written when the notes are *answered* — the panel opened or the banner dismissed — not at launch, so a window hidden
  to the tray when an update landed still announces it on the next look. It never goes backwards (`nextSeen`): an
  unstamped dev build over an installed one, or a rollback, can't make the next real launch announce everything again.
- **The announcement is a strip, not a dialog**, in the slot the update banner uses. This window floats over the game, and
  a modal there is a blackout ([ADR 0052](./0052-an-error-goes-to-the-log-not-the-screen.md)). It carries the newest title
  and a count, and **What's new** opens the notes; the history is always there under Settings → What's new, new releases marked.
- **How-to guides are code too** (`src/shared/help/guides.ts`, shown under Settings → How-to). The two facts most likely to rot
  are not typed into the prose: a hotkey is a `{hotkey:stats}` token read from the constant main registers it from, and the
  tab a guide is about is a key checked against the nav. A test fails if a guide names a tab that no longer exists, an
  unknown hotkey, or a registered chord spelled out by hand.
- **The process lives in `CLAUDE.md` and is held up by tests.** A user-visible change gets a release note (and the version
  bump) in the same change; a change to something a guide describes updates the guide in that change. A pushed note is not
  edited — a later change is a new line — so that a player who has already answered a line is never shown additions they
  would miss. The tests pin what can be pinned: the newest note's line is `package.json`'s line, the notes are well formed
  and in order, every guide and every note-to-guide link resolves. What no test can pin — that a change *has* a note — is
  the rule's job.

## Consequences

- Every user-visible push is a new line, so line numbers climb faster than a human release cadence would set them
  (`0.40` is unremarkable). That is the price of keying on something a note's author can know; the patch stays the build.
- Players on the same line but different builds see the same notes, and a note can't be amended for people who already
  answered it. The cost of a mistake in a note is a correcting note on the next line.
- The web build has no installed version, so it has no banner and no marker — only the history and the guides, which are
  its use for them.
- The first update after this ships shows existing players the newest note only, because nothing was remembered; the notes
  start counting from there.
- Guides can still go stale in their prose. The tests keep the hotkeys and tabs honest; the rest is a rule, not a check.
