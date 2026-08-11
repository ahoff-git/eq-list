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
    / unseen verdicts, when a wiki claim becomes suspicious, the sample size at which our
    own observations take over from the wiki's figure, and every grade of an item pooling into
    one row with its counts *added* rather than overwritten).
  - `src/shared/names.ts` → `electron/tests/names.test.ts` (an item's `+N` grade and a zone's
    difficulty number and ruleset tag read off a name and taken back off it — and, the half that
    matters, a name carrying none of them surviving untouched). Plus `zoneKey`, the one fold behind
    every "same zone?": every difficulty and ruleset of a zone landing on one key, the backtick the
    maps write folding onto the apostrophe the log writes, an aliased name (Kerra Isle → Kerra Ridge)
    folding onto the map's, and two zones that merely share words staying apart.
  - `src/shared/mob-stats.ts` → `electron/tests/mob-stats.test.ts` (rolling kills up into
    observations, observed drop rates and their denominators, roam areas ignoring untrustworthy
    positions, and pooling a peer's counts while keeping provenance — including that a pooled
    area *widens* rather than averaging inward, and that a zone's difficulty variants tally as one
    sample even when an older or a peer's entry was stored under the decorated name).
  - `src/shared/kill-filters.ts` + `kill-confidence.ts` → `electron/tests/kill-filters.test.ts`
    (time windows, mob/drop matching, the confidence floor, and every tier having a distinct
    glyph so the map doesn't depend on colour alone).
  - `electron/kill-log.ts` → `electron/tests/kill-log.test.ts` (placement from the last fix,
    confidence decay, the movement penalty, dead reckoning, and recording kills that can't be
    placed at all). Also the two halves of the zone fold, which pull opposite ways: reading kills
    back by zone reaches every difficulty variant, while a `/loc` fix from another variant still
    can't place a kill — changing difficulty is a teleport like any other zoning. Including the
    hole that let a fix taken *before the zone was known* place kills anywhere
    ([ADR 0060](../decisions/0060-a-position-belongs-to-the-zone-it-was-taken-in.md)): unknown
    matches only unknown.
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
    loose zone matching including a zone made harder, current-zone split, and `sameZone` — the
    strict fold used for keying — refusing the neighbour that `zoneMatches` happily accepts).
  - `src/shared/loot-filters.ts` → `electron/tests/loot-filters.test.ts` (each filter narrowing the
    ledger, "on my list" matching the way the store matches, tallies counting stacks rather than
    lines, and the default sort leaving same-second drops in the order they were looted).
  - `src/shared/sorting.ts` → `electron/tests/sorting.test.ts` (what a header click does, and that a
    sort is stable and non-mutating — both of which its callers lean on).
  - `src/shared/tooltip.ts` → `electron/tests/tooltip.test.ts` (a hover card placed right of its
    anchor, left when the right won't fit, sliding up to clear the window's foot, the below/above
    fallback for a window too narrow for either side — flipped without covering the anchor — and the
    no-room-anywhere case that must clip rather than cover).
  - `electron/eq-maps.ts` → `electron/tests/eq-maps.test.ts` (what counts as a map source, and that
    **a pack is named from its own labels only** — including that a folder's names don't change when
    another pack appears beside it, [ADR 0061](../decisions/0061-a-map-pack-names-its-own-zones.md)).
    Touches a temp dir: "which folder did this come from" is the whole question.
  - `src/shared/zones/expansions.ts` → `electron/tests/zone-expansions.test.ts` (which expansion a zone
    came with, and whether that means you can go there —
    [ADR 0064](../decisions/0064-a-zone-belongs-to-an-expansion.md)). Checked in **both** directions,
    because the two failure modes aren't equal: the zones it must exclude (Argath → Veil of Alaris, Vex
    Thal, the Plane of Knowledge), and — the half that matters — the zones it must **never** exclude,
    including ones the table has never heard of, which must fail open. Plus the generated table being
    release-ordered so a classic zone can't be claimed by a later expansion's revamp, the live era list
    being what closes Kunark today and re-opens it later, and a permanent refusal outranking a temporary
    one.
  - `src/shared/travel/` → `electron/tests/travel-harvest.test.ts`, `travel-build.test.ts`,
    `travel-manual.test.ts`, `travel-route.test.ts` — the four jobs of the zone-line graph
    ([ADR 0062](../decisions/0062-a-travel-graph-of-zone-lines.md)), split so each is its own black box:
    - **harvest** — which labels are travel, and the half that matters: which are *refused*. A label
      naming no single destination is dropped and counted; a labelled ferry destination is an ordinary
      border **wherever in the label it's stated** (`Boat to Erudin` as much as `to Erudin (Boat)` —
      reading only the second is what cut Odus off the graph); a conveyance the shared classifier files
      as a plain name (`Druid Rings`) is still recognised, while `a dock worker` and `Dock Merchant`
      are not. Plus **how you'd cross** read off the label in the words a route shows — a dock is a
      `boat`, `Spires` a `spire`, a bare `Portal` a `portal` (it used to fall through) — with a gnome on
      a dock reading as a translocator and anything unrecognised still reading as nothing.
    - **build** — both halves of a border collapsing into **one** node that holds its position in each
      zone, a zone's boundaries joined to each other by the distance between them (the `A|B`/`A|C`/`A|D`
      shape, asserted edge by edge), branching onward measured in the *next* zone's frame, several
      crossings of one border all kept with the nearest used, a one-sided border still a border whose
      walks are flagged as guesses, a destination no file answers to reported rather than dropped, a
      zone name resolved *exactly* after folding (never by containment — "commonlands" sits inside
      "east commonlands"), EverQuest's backtick folded against a typed apostrophe, rings hubbed but
      **docks never** (a boat has two particular ends), a conveyance that names its destination becoming
      a border carrying **`via`** — one field for how you cross, not words appended to its name — while one
      whose destination resolves to nothing keeps its node for pairing, the zones with no way in or out, and **a zone the server hasn't got never
      entering the graph at all** — its own points skipped, borders into it refused and counted rather
      than called unresolved, named either as you'd say it or as its map file, and a pack that never had
      it treated as no error.
    - **manual** — a boat stated as a **border** with no mode, cost or toggle and positioned at each
      end's dock; a boundary the maps already found only **gaining coordinates** rather than being
      duplicated; a far side with no dock drawn still a border whose walks are flagged; a place matched
      by a piece of its label rather than a node id; a port place this pack never labelled *invented*
      **and wired into its zone** (walks are stored, so otherwise it's an island); an addition
      **extending** the network the maps already found instead of standing up a second; a dropped member
      keeping its node and losing its free ride; a block *removing* the walk in both directions **and
      surviving the zone's walks being recomputed in the same pass**; a malformed entry told apart from
      one naming a zone this pack simply lacks; a place naming its zone **either way round** (its name or
      its map file), since the shipped table says "South Qeynos" and the file is `qeynos`; and the input
      graph left unmutated, positions included.
    - **route** — zoning costing no leg with the walk after it measured in the next zone's frame, the
      nearest of a border's several crossings used, a conveyance not used until asked for, a wizard
      toggle not opening the druid network, a boat working with **every** toggle off (it's a border), a
      zone you only pass through by conveyance still named in the summary, an unplaced border's walk
      priced as a guess *and flagged*, one zone answered as a straight line, no route returned as an
      answer rather than thrown, and — the output half — **every zone a route mentions carrying the name
      a person reads** ("Northern Felwithe", never `felwithea`) in the summary, on each leg and on the
      virtual ends, down to the tidied fallback for a zone the graph never named. Plus `answerRoute`,
      which is what the UI actually calls: each of the four refusals told apart (no graph, unknown
      start, unknown destination, unreachable) and the zone/border counts that make "no route"
      believable — including the fifth refusal, a zone that **isn't in the game**, told apart from one
      that is merely unreachable, because only one of the two is worth going on looking for.
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
`npm run sim` replays `fixtures/sample-eqlog.txt` (example loot, chatter, a **party invite**
verbatim from a real log — so a line watch can be seen firing without waiting on a groupmate — and a
**full combat exchange** — melee, a crit, a riposte, spell damage, a pet, a damage shield, a
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
[manual QA checklist](./manual-qa.md) · [log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md)
