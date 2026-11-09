# 0374: History before release notes is read, never announced

## Status

Accepted

## Context

[ADR 0373](./0373-release-notes-are-a-release-line-and-guides-are-checked-against-the-code.md) made a release note a
numbered line. The player then asked for the notes retroactively, from the project's history — more detail near the
present, less the further back. That history is 326 commits and 372 decision records over about fifteen months, and
nearly all of it shipped as `0.1.<run>` ([ADR 0064](./0064-every-build-has-a-number.md)): a single line.

A numbered note for any of it would be shown, as *new*, to every install that already has the feature, because every
install is on a line older than the one the note would be filed under. The history is real and worth reading, but it
is not an update.

0373 also left a hole this surfaced. An install with nothing remembered is shown only the newest note — right for a
first install, wrong for the update that *introduces* tracking, where every existing player has nothing remembered
and would never see the note before the newest.

## Decision

- **History is its own list, not release lines.** `HISTORY` in `src/shared/releases/history.ts`: dated periods
  (`from`–`to`, newest first), each with a title and the same `new`/`better`/`fixed` changes. It is shown under
  **Before release notes** in Settings → What's new, and is **never announced** — it takes no part in `notesSince`.
- **It is reconstructed, and less detailed the further back.** The last week is feature by feature, the autumn is
  month by month, the first months a sentence. It is written from the commit log and the dated decision records, in the
  player's words. It is not added to any more: a new change is a release note. The tests hold it to real dates, newest
  first with no overlap, and ending before the first numbered release (`historyProblems`).
- **An install updating from before tracking is read as updating from `BEFORE_NOTES` (`0.1.0`).** With no marker
  remembered, an install that holds *any other* saved UI state has been used before, so it is owed every note since
  the baseline; only a blank slate gets the newest note alone (`countFrom`). The banner doesn't say where it came from
  in that case — it doesn't know.

## Consequences

- Amends 0373's first-update consequence: existing players updating from `0.1.x` are shown every numbered note, not just
  the newest.
- "Used before" is a heuristic: a player who installed it and never changed a setting has no saved UI state and is
  treated as new, so sees the newest note alone. That costs them a note they could have read under What's new.
- The history is a reconstruction, not a record. Dates are when work landed; many early decision records were committed
  in one batch on 2026-07-22, so the first months are coarse, and a feature a commit subject doesn't name is missing.
  Correcting it is an edit to `history.ts`, not a new note.
- A player who updates from `0.1.x` sees `0.2`'s stats-reading notes though they may already have some of that work
  (builds shipped the same day). Counting from the baseline errs towards telling them twice rather than never.
