# 0384: The running app is smoke-tested by a committed suite, not by hand

## Status

Accepted

## Context

The unit tests here are per-module black boxes and they are green. The bugs that were actually found in the
last two bug hunts all came from running something real, and every one of those probes lived in a throwaway
script in somebody's scratch folder:

- sweeping every tab and every view over the DevTools protocol for console errors (a startup `statement is busy`
  error, a duplicate React key from an aliased spell page, a zone page whose "NPCs" were item cards);
- changing a store through its real API and quitting at once (the achievements and the panel settings were missing
  from `before-quit`'s hand-written list — [ADR 0379](./0379-quitting-writes-every-pending-save.md));
- sending the window the real `WM_ENDSESSION` message and ending the process, which is what a Windows shutdown does;
- calling every function on `window.eql` with a null, `{}`, `-1`, `NaN` and a 2 MB string and asking after each
  whether main still answers (a 2 MB search query held main for half an hour —
  [ADR 0378](./0378-a-typed-search-is-capped-before-it-searches.md)).

[`specs/testing/manual-qa.md`](../testing/manual-qa.md) holds a second kind of debt: checks a person was meant to
make in the running app (every table's column menu, Manage columns, the pager, the Faction Hits ▶ arrow that had
already regressed once), which depended on someone launching it. Launching it is not easy to do right. The
environment sets `ELECTRON_RUN_AS_NODE`, which turns `electron .` into plain Node; the single-instance lock makes a
second launch on the player's own userData quit with no output, which reads like a pass; `better-sqlite3` is built
for Node *or* Electron and the two are swapped by `npm test` and `npm run rebuild:*`; a fresh profile downloads the
wiki's whole title index from the main process, which no renderer-side network block reaches; the machine usually
has the player's own copy of the app running beside it, and a sweep that matches processes by a command-line flag
once ended the shell that launched it.

## Decision

- **`npm run smoke` runs the real desktop app, in isolation, and checks it.** It lives in `scripts/smoke/`, as plain
  Node ESM like the other scripts, and exits nonzero on any failure. `presmoke` runs `rebuild:electron`, as `predev` does.
- **Isolation is built in, not remembered.** The app runs on a scratch `--user-data-dir` (so the single-instance lock
  neither collides with the player's app nor silently quits), with `EQL_DEV` and `EQL_DEV_URL`, `ELECTRON_RUN_AS_NODE`
  removed, a random debugging port, and `--host-resolver-rules` so the renderer reaches only this machine. A small
  `--require` guard (`NODE_OPTIONS`) refuses every non-local `fetch` from the **main** process and records the
  attempts, so a run never reaches eqlwiki.com and the report can say what the app tried. The seeded settings keep
  the peer room, location sharing and the Lucy lookup off: an isolated instance must not announce itself under the
  log's character name in the real room. The player's own database is only ever **copied**, read-only, and nothing is
  written under `%APPDATA%\eq-list`; with none (a clean checkout) a fixture profile is fed through the character's
  log. Processes are ended by the PID the suite was handed, never by matching a command line; a run ends by checking,
  from the scratch folder every one of its processes carries, that none is left, and by stopping a dev server only
  if it started it. One thing a launch does outside the scratch folder: an unpackaged instance re-registers the
  `eqlist://` link handler (`HKCU\Software\Classes\eqlist`) as bare `electron.exe`, so the suite reads the key before
  it starts and puts it back afterwards, whatever the outcome.
- **Four checks, each a named function returning pass, fail or skip with evidence** (a skip is shown and is not a
  failure; a check that cannot run must not read as a pass):
  - the **sweep** walks the app's own navigation table (`AREAS`, read from the compiled build, so a new section is
    swept the day it lands) and every view in it, collecting error-level console output and exceptions against an
    explicit, commented allowlist, plus the main process's own log, a crash boundary showing, and `NaN`/`undefined`
    on screen. At the tables the checklist names it asserts the column menu, Manage columns, the pager and rows per
    page, sort-then-page, and the Faction Hits ▶/◀ arrow and page-size change;
  - the **quit probe** changes an achievement, a panel setting and a game-clock alarm through the real API, quits
    inside the shortest debounce, relaunches on the same userData and asks what survived;
  - the **session-end probe** does the same but sends `WM_ENDSESSION` to the process's windows and then ends it;
  - the **IPC fuzz** calls every side-effect-free function on `window.eql` with ten hostile argument shapes and
    asks the debugging port after each call whether main still answers. Functions with side effects (windows,
    dialogs, the peer room, wiping a ledger, a crawl) are listed with their reasons and left alone.
- **What decides is pure, and is unit-tested; what drives is proven by running.** Classifying a finding, the
  allowlist, the report, building a profile (including that the live folder is left byte-for-byte untouched), the
  grid judges and the fuzz plan are `node:test` files beside the code in `scripts/smoke/`, and `npm test` runs them
  by one more glob, because the compiled-test glob only reaches `electron/tests`. The judges are written to read
  *facts* the page scripts return, so each is tested against the facts a broken grid would produce.
- **A check must be shown able to fail.** `--inject-fault <name>` breaks one thing from inside the suite (a console
  error, an exception, `NaN` or a crash boundary on screen, a stripped pager, a swallowed ▶ click, a hard end with
  no chance to save, a frozen main process) and the owning check must go red; a misspelt name is an error.
  `--app-rev <git-rev>` builds the main process as it was at that revision (`git archive`, compiled in scratch
  with the shared `node_modules`) and runs the suite against it, which is how the two persistence probes were
  shown to catch the bug of [ADR 0379](./0379-quitting-writes-every-pending-save.md): against the revision before
  the fix they lose the achievement and the setting on a quit, and all three on a session end, which is exactly
  what was measured by hand.

## Consequences

- The probes that found nine bugs are repeatable, and the manual checklist items they cover say so; what is left
  on those items is what only eyes can judge (colours, the light-mode flash, a window filling when maximised) and
  the tables a script cannot reach (Peers' scoreboard needs the room, which is never joined).
- It is a desktop run: windows appear while it goes and it takes a few minutes, so it is a command to run before
  a release or after touching lifecycle, tabs or tables, not part of `npm test`. It needs the Electron build of
  `better-sqlite3`, and `npm test` needs the Node one: they swap the same native file, so the two cannot run at
  the same time, and the failure is that file being busy rather than a wrong answer.
- **The allowlist is a list of debts.** Each entry carries its reason, and four stand today: the network refusals
  the suite causes on purpose, a third-party DataGrid CSS deprecation, and two real bugs the first runs found, which
  are allowed so the suite can be green and named so they can be fixed (a duplicate React key in the Tailoring
  guide's shopping list, and `recheckDialogueCauses` running while another query holds the shared SQLite connection
  at startup on a large ledger). Fixing one means deleting its entry.
- Loot Drops has no column Filter on purpose (it is paged on the server); the suite asserts the menu stays that way,
  so a Filter that narrows only the page on screen cannot come back unnoticed.
- A new table is one entry in `grid-expectations.mjs`; a new `window.eql` function is fuzzed unless it matches a
  skip pattern, so a new side-effecting function has to be added to that list or it will be called with garbage.
