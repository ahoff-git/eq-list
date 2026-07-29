# Testing

## Purpose
Say what is a tested black box, how tests run, and what is intentionally not
unit-tested.

## Responsibilities
- **Tested black boxes** — pure, side-effect-free modules with pinned behavior:
  - `src/shared/log-parser.ts` → `electron/tests/log-parser.test.ts` (loot grammar,
    stack quantities, timestamp handling).
  - `src/shared/combat-parser.ts` → `electron/tests/combat-parser.test.ts` (the combat
    grammar: melee/spell/shield/DoT damage, misses, heals, `(Critical)`/`(Riposte)`
    qualifiers, overheals, and the casting lifecycle — casts, fizzles, interrupts,
    resists, blocks). Every input line is **verbatim from a real log**.
  - `electron/combat-stats.ts` → `electron/tests/combat-stats.test.ts` (per-combatant
    tallies, fight boundaries, active-time DPS, `mine` flagging, and the per-spell
    numbers: measured cast time, rank-folding, resist rate, and the dmg/s-cast formula
    that must not inflate partly-timed spells; plus the per-stance / per-invocation splits,
    including the "unknown" bucket and modes surviving a reset). Deterministic: time comes from the log's
    timestamps, so there are no clocks or sleeps. Note the helper builds timestamps as
    real clock times — an early version wrote "00:00:60", which `Date.parse` rejects, and
    the resulting NaN quietly zeroed a window's span.
  - `src/shared/drop-truth.ts` → `electron/tests/drop-truth.test.ts` (confirmed / undocumented
    / unseen verdicts, when a wiki claim becomes suspicious, and the sample size at which our
    own observations take over from the wiki's figure).
  - `src/shared/mob-stats.ts` → `electron/tests/mob-stats.test.ts` (rolling kills up into
    observations, observed drop rates and their denominators, roam areas ignoring untrustworthy
    positions, and pooling a peer's counts while keeping provenance — including that a pooled
    area *widens* rather than averaging inward).
  - `src/shared/kill-filters.ts` + `kill-confidence.ts` → `electron/tests/kill-filters.test.ts`
    (time windows, mob/drop matching, the confidence floor, and every tier having a distinct
    glyph so the map doesn't depend on colour alone).
  - `electron/kill-log.ts` → `electron/tests/kill-log.test.ts` (placement from the last fix,
    confidence decay, the movement penalty, dead reckoning, and recording kills that can't be
    placed at all).
  - `electron/hp-estimate.ts` → `electron/tests/hp-estimate.test.ts` (floors from survived
    damage, ceilings from deaths at full health, and — the important half — every case
    where it must *refuse* to infer: healing, lulls, your own buffs fading, overkill, and a
    floor that contradicts the ceiling).
  - `electron/xp-progress.ts` → `electron/tests/xp-progress.test.ts` (nothing assumed
    until the player says so, gains accumulating, level-up resetting, clamping, reload,
    corrupt file).
  - `electron/combat-history.ts` → `electron/tests/combat-history.test.ts` (session
    grouping, newest-first ordering, per-zone aggregation, personal bests, the 1000-fight
    cap, reload after a restart, and a corrupt file being survivable). Touches a temp dir, like the log-watcher test —
    persisting and reloading *is* the feature.
  - `src/shared/fuzzy.ts` → `electron/tests/fuzzy.test.ts` (typo/transposition/
    partial/word-order matching and ranking).
  - `src/shared/grouping.ts` → `electron/tests/grouping.test.ts` (grouping by origin,
    ordering, per-group progress, and the cross-group demand breakdown behind the
    entry-count hover — pinned to sum to `itemTotals`).
  - `src/shared/sources.ts` → `electron/tests/sources.test.ts` (drops-by-zone,
    loose zone matching, current-zone split).
  - `electron/wiki/parse.ts` → `electron/tests/wiki-parse.test.ts`, pinned against
    real page HTML in `fixtures/wiki/` (item drops, quest turn-ins/rewards, recipe
    components). Re-capture a fixture only when the wiki's markup actually changes.

  Once green, don't re-run or change these unless the module itself changes.
- **Checking a parser against a whole log** — unit tests pin the shapes we *know*; they
  can't tell you about a shape you've never seen. So when the game's messages change (or
  before trusting a new parser), run the parsers over a **real log** and look at what
  didn't match: bucket the leftovers by shape, ignore chat/system noise, and anything
  combat- or loot-looking in the remainder is data being silently dropped. That pass is
  what found the `(Critical)`/`(Riposte)` qualifiers, the overheal form, archery, damage
  shields and the tradeskill-depot loot line — 57 lines in one log that parsed as
  nothing. It's a throwaway script, not a committed test: it needs a real log, which
  isn't in the repo.
- **Integration test** — `electron/tests/log-watcher.test.ts` drives the real
  `log-watcher` against a temp eqlog: it asserts only newly-appended lines are
  emitted (backlog/chatter ignored) and that truncation/rotation resets cleanly.
  Timing-based (500ms poll), so it uses short real-time waits.
- **Runner**: Node's built-in test runner, no extra dependency. `npm test` compiles
  the Electron/shared TS (`tsconfig.electron.json`) then runs
  `node --test "dist-electron/electron/tests/**/*.test.js"`. Needs **Node 22+**
  (`engines` in `package.json`): older Node takes the glob literally, and passing the
  directory instead isn't supported on current Node — so the glob stays quoted.
- **Static checks**: `npm run typecheck` (both tsconfigs) and `npm run lint`.

## Simulating the game log
`npm run sim` replays `fixtures/sample-eqlog.txt` (example loot, chatter and a **full
combat exchange** — melee, a crit, a riposte, spell damage, a pet, a damage shield, a
DoT tick, a heal, misses, a looted stack and a depot loot — in the real EQ format) into a
target `eqlog_*.txt`, restamping each line to the current time so it looks live. The
sample's pet lines are named for the character `Kainos`, so replaying into an
`eqlog_Kainos_*.txt` also exercises the meter's "these rows are mine" highlighting. Point the app's Log folder at the replay directory and the
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
