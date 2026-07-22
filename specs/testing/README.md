# Testing

## Purpose
Say what is a tested black box, how tests run, and what is intentionally not
unit-tested.

## Responsibilities
- **Tested black boxes** — pure, side-effect-free modules with pinned behavior:
  - `src/shared/log-parser.ts` → `electron/tests/log-parser.test.ts` (loot grammar
    + timestamp handling).
  - `src/shared/fuzzy.ts` → `electron/tests/fuzzy.test.ts` (typo/transposition/
    partial/word-order matching and ranking).
  - `src/shared/grouping.ts` → `electron/tests/grouping.test.ts` (grouping by origin,
    ordering, per-group progress).
  - `src/shared/sources.ts` → `electron/tests/sources.test.ts` (drops-by-zone,
    loose zone matching, current-zone split).
  - `electron/session-stats.ts` → `electron/tests/session-stats.test.ts` (XP/kill
    counts and time-windowed XP-to-mob attribution).
  - `electron/wiki/parse.ts` → `electron/tests/wiki-parse.test.ts`, pinned against
    real page HTML in `fixtures/wiki/` (item drops, quest turn-ins/rewards, recipe
    components). Re-capture a fixture only when the wiki's markup actually changes.

  Once green, don't re-run or change these unless the module itself changes.
- **Integration test** — `electron/tests/log-watcher.test.ts` drives the real
  `log-watcher` against a temp eqlog: it asserts only newly-appended lines are
  emitted (backlog/chatter ignored) and that truncation/rotation resets cleanly.
  Timing-based (500ms poll), so it uses short real-time waits.
- **Runner**: Node's built-in test runner, no extra dependency. `npm test` compiles
  the Electron/shared TS (`tsconfig.electron.json`) then runs
  `node --test "dist-electron/electron/tests/**/*.test.js"`.
- **Static checks**: `npm run typecheck` (both tsconfigs) and `npm run lint`.

## Simulating the game log
`npm run sim` replays `fixtures/sample-eqlog.txt` (example loot + chatter in the
real EQ format) into a target `eqlog_*.txt`, restamping each line to the current
time so it looks live. Point the app's Log folder at the replay directory and the
overlay reacts exactly as in-game — no playing required. `scripts/replay-log.mjs`
takes `--loop`, `--loot-only`, `--interval`, `--jitter`, `--from <real log>`,
`--to <dir|file>`, `--keep-timestamps`, `--append` (see the file header, or
`npm run sim -- --help`).

## Guidance
- New pure logic (e.g. the wiki HTML parser) should get its own `*.test.ts` under
  `electron/tests/` with a captured HTML fixture, so it becomes a black box too.
- Treat passing black boxes as frozen: don't edit them without cause, and don't
  re-verify them when unrelated code changes.

## Non-responsibilities
- No end-to-end Electron/GUI tests — window behavior is verified by running the app
  (`npm run dev`), and the loot pipeline by `npm run sim`. The dev sandbox is headless.
- Network calls (the wiki API) are not hit in tests; parsers are tested on fixtures.

## See also
[log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md)
