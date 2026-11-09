# Help

## Purpose
Tell a player what changed when they update, keep every update readable inside the app, and teach the parts of the app
people miss — in a way that stays true as the app changes. Two sections of the **Settings** area: **How-to** and **What's new**.

## Responsibilities
- **Release notes** (`src/shared/releases/changelog.ts`, shown by `WhatsNewPanel`): one note per **release line**
  (`major.minor`, the part of the version a person sets), newest first. A line is added by the change that bumps
  `package.json` to it; every build of the line (`0.4.17`, `0.4.18`…) carries the same notes
  ([ADR 0373](../decisions/0373-release-notes-are-a-release-line-and-guides-are-checked-against-the-code.md)).
- **What a player is owed** (`notesSince` in `release-notes.ts`, pure): every line after the one they were last shown, up
  to the one running, newest first — so `0.1.x` → `0.5.x` yields `0.5`, `0.4`, `0.3`, `0.2`. Same line, different build:
  nothing. Nothing remembered: the newest note only. A host with no version (the web build): nothing.
- **History before release notes** (`src/shared/releases/history.ts`, `HistoryNote`): dated periods rebuilt from the
  project's log, newest first, shown under **Before release notes** and **never announced** — every install is on `0.1.x`, so
  a numbered note for something they have would be announced as new. Less detail the further back; closed (new changes are
  release notes) and checked to end before the first numbered release
  ([ADR 0374](../decisions/0374-history-before-release-notes-is-read-never-announced.md)).
- **An update from before tracking**: with no marker but other saved UI state, the install is counted from `BEFORE_NOTES`
  (`0.1.0`, what everyone was on) and owed every note since (`countFrom`); a blank slate gets the newest alone.
- **The marker** (`eqlist.main.releaseSeen` in main's UI store, read and written by `useReleases`): the newest version
  whose notes were shown. Written when the notes are *answered* (panel opened, banner dismissed), not at launch, and it
  never goes backwards (`nextSeen`) — a dev build or a rollback can't make the next real launch re-announce everything.
- **The announcement** (`ReleaseBanner`): a strip in the update banner's slot — never a dialog, because this window floats
  over the game and a modal there is a blackout. The newest title and a count; **What's new** opens the notes. The tab
  label counts the unread releases while there are any.
- **How-to guides** (`src/shared/help/guides.ts`, shown by `HowToPanel`): a few numbered steps and tips per guide, a
  button to the tab it is about, and "needs the desktop app" where the host can't do it. A release note can link to a
  guide (`guide: "<id>"`, shown as **How-to →**), which opens the card.
- **Keeping guides true** (`guide.ts`): a hotkey is a `{hotkey:stats}` token resolved from the constant main registers it
  from; the tab is a section key checked against `areas.ts`; a chord typed by hand is a test failure; and every bold label
  must be spelled somewhere in the app's source, so a renamed button fails the guide that names it. `guides.test.ts`
  and `changelog.test.ts` hold the real data to these rules, and to `package.json`'s line.
- **The process** is a rule in [CLAUDE.md](../../CLAUDE.md): a user-visible change carries its release note and version
  bump; a change to what a guide describes carries the guide.

## Non-responsibilities
- **No network.** Notes and guides are bundled; there is no "fetch the changelog" and nothing to be offline for. (Whether
  a newer build exists is [auto-update](../decisions/0279-the-app-updates-itself.md)'s job.)
- **Not the ADR log or the commit history.** A release note is a sentence a player reads about what they can do now;
  *why* a thing is the way it is stays in [decisions/](../decisions/README.md).
- **Not a manual for every tab.** Guides cover flows people don't find by looking; a tab's own hints stay beside its controls.
- **Doesn't decide that a change needs a note.** No test can know; that is the rule's job.
- **No translation, no per-class or per-server variants,** no rich formatting beyond bold labels and hotkeys.

## See also
[overlay-ui](../overlay-ui/README.md) · [testing](../testing/README.md) ·
[ADR 0373](../decisions/0373-release-notes-are-a-release-line-and-guides-are-checked-against-the-code.md) ·
[ADR 0064](../decisions/0064-every-build-has-a-number.md) ·
[ADR 0279](../decisions/0279-the-app-updates-itself.md) ·
[ADR 0320](../decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)
