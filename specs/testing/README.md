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
    All **three** DoT wordings are pinned, and pinned *against each other* — a caster-named tick must
    not be read as a nameless one and neither may be read as yours — because the third
    (`… has taken 29 damage from your Heat Blood.`) went unread for as long as the other two existed
    and cost 3.3% of a character's damage ([ADR 0095](../decisions/0095-your-own-dot-tick-is-yours.md)).
    A **critical tick** is pinned too, with its untagged twin beside it: the qualifier sits after the
    full stop, so a pattern anchored there silently loses the hardest ticks in the log rather than an
    arbitrary few. A spell name carrying an apostrophe (`Denon's Bereavement`) guards the lazy group.
  - `src/shared/dot-attribution.ts` → `electron/tests/dot-attribution.test.ts` (a caster-less DoT
    tick credited to whoever was last seen casting that spell — including across the rank the cast
    line states, a group-mate's DoT staying theirs, and the two cases that must be left exactly as
    the log wrote them: a spell nobody was seen casting, and the long tick form that names its own
    caster. Plus that resolving never mutates the event it was given.)
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
  - `src/shared/spawn-timers.ts` → `electron/tests/spawn-timers.test.ts` (the respawn-learning
    rules, [ADR 0092](../decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)): that
    the figure is the **shortest** gap and never the mean, that a later longer gap can't stretch it
    while a shorter one tightens it, and that an implausible gap is **discarded rather than clamped**
    — since against a bound that only falls, an invented short number is permanent. Also what isn't
    evidence (a peer's kill, whose clock isn't yours; a kill with no zone) against what is (a
    bystander's, deliberately unlike a drop rate), the article proof that a mob is a named — with
    **absent meaning unknown**, and one fresh kill making an old record's history readable
    retroactively — and that a learned figure is always *worded* as a bound with its sample. Then
    the window on top of it ([ADR 0094](../decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md)):
    that **both ends** of the evidence are kept, that clustered gaps are trusted while disagreeing
    ones are flagged and lead with the range, that padding opens a window **without moving the
    by-time** and can't reach back past the kill, and that with no padding the whole thing collapses
    to the point-in-time countdown it replaced.
  - `electron/spawn-tracker.ts` → `electron/tests/spawn-tracker.test.ts` (the holder: when a
    countdown starts and restarts, that a due timer speaks **once**, that a stated figure outranks
    the learned one and clearing it falls back rather than empties, and that a due time survives a
    restart). The two refusals are the point: a pop that already happened is **shown, never
    shouted** — asserted both for a restart after the fact and for the kill replayed out of a log
    gap, which is the same lie arriving by a different road — and, once padding existed, for a
    window opened *retroactively*, which is the third road to the same lie and why one `arm()` check
    covers all of them. Padding is asserted to re-shape a countdown **already running**, since it is
    set while waiting for the very pop it's wanted for. Clock and sweep are injected, so a six-hour
    timer is exercised in a millisecond.
  - `src/shared/mob-stats.ts` → `electron/tests/mob-stats.test.ts` (rolling kills up into
    observations, observed drop rates and their denominators, roam areas ignoring untrustworthy
    positions, and pooling a peer's counts while keeping provenance — including that a pooled
    area *widens* rather than averaging inward). Also the storage/aggregation split
    ([ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)): a **stored**
    observation keeps the log's zone name verbatim, variant and all, while the **pooled** view is one
    camp per place named from the mapping table — asserted together, since the pair is the point, plus
    the repeatability property (a reversed input aggregates identically) and that two zones which merely
    look alike are never pooled by either.
  - `src/shared/kill-filters.ts` + `kill-confidence.ts` → `electron/tests/kill-filters.test.ts`
    (time windows, mob/drop matching, the confidence floor, and every tier having a distinct
    glyph so the map doesn't depend on colour alone). Plus **a peer's kill as an ordinary kill**
    (`sharedAsKill`): kept by default because it's data, removed by `shared: false`, never yours
    (`mine: false`), and — the part that needs pinning — **kept by every time window**, because no clock
    travels with it and dropping a kill for not knowing when it happened would be worse than showing it.
    A drop filter still excludes it, which is correct: no loot travels either, so it is no evidence about
    drops. And `filterMobKnowledge`, the same filters over the 📖 panel: mob and drop narrow it, a time
    window and a position floor **don't apply** (it's a lifetime tally, and "session" as a default would
    hide last week), and `shared: false` keeps the mobs you have first-hand knowledge of while leaving a
    pooled row's counts alone.
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
  - `src/shared/high-scores.ts` + `electron/high-scores.ts` →
    `electron/tests/high-scores.test.ts`. The pure half: one hit landing in every category it belongs
    to at once, a spell landing and a DoT tick being different records, ours-on-ours counting as
    neither dealt nor taken, a fight's rate refused below `MIN_DPS_SEC`, "survived" refusing a death
    *and* a cut-short fight, a fight read for the hits inside it off its own cells, a floor rejecting a
    trivial sample, a tie not beating, a family id describing itself, and — since
    [ADR 0095](../decisions/0095-your-own-dot-tick-is-yours.md) — a cell whose hits are *all* ticks
    yielding a `biggest-tick` while a cell with a landing among them yields a `biggest-nuke`, which is
    what took that category from unreachable to seedable. The keeper's half is one test
    per rule from [ADR 0093](../decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md),
    because each is a thing that reads as a bug when it's missing: a **board per character** (surviving
    a reload, and keyed so the log's capitalisation can't split one in two), a **first score that sets
    the bar silently**, a **replayed gap filed but never announced**, a **streak that speaks once**
    (including the case that caught a real bug — a streak whose first record was the silent
    bar-setting must still announce its crossing), **seeding once from this character's fights only**,
    and a **cleared board staying cleared**. Temp dir, for the same reason as above.
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
  - `electron/json-store.ts` → `electron/tests/json-store.test.ts` (the one reader and the one **atomic**
    writer every store on disk goes through). Ten modules each had their own, and only two wrote to a temp
    file and renamed; the other eight wrote straight to the destination, so an interrupted write left a
    half-file, the next read threw, the fallback took over, and the store came back **empty with nothing
    said**. Atomicity can't be tested by killing the process mid-write, so what's pinned is the property
    behind it: **a write that fails leaves the previous file completely intact** (forced by putting a
    directory where the temp file needs to go), no temp file survives a success, a missing file is the
    quiet fallback and a corrupt one the loud fallback. Touches a temp dir — what lands on disk is the
    whole subject. Plus `createSaver`, the debounced writer **seven** stores had a copy of: what's pinned
    is the cancellation, since that's where the copies could drift — a timer never released stops a store
    saving for the rest of the session, and a `flush` that doesn't cancel lets a write land after the app
    has quit. Including the one axis they genuinely differ on: a window being dragged wants only where it
    landed (`restart`), while a log being eaten wants a write every so often no matter how long the stream
    runs, or a busy camp would postpone it for ever.
  - `src/shared/numbers.ts` → `electron/tests/numbers.test.ts` (`round`, `ratio`, `over` — the two bits
    of arithmetic the whole app shares). Three lines each, pinned because of what they replaced: twenty-odd
    hand-written copies of `d ? Math.round((n / d) * 10) / 10 : 0`, where the guard and the scale factor
    are both easy to get wrong and neither failure shows up in a review. What's held is the contract the
    call sites lean on — nothing to divide by is **0** (never `Infinity` or `NaN` reaching a panel as
    `NaN%`), or **`undefined`** where zero would be a lie, and `places` is never assumed, since a default
    of "whole numbers" would have turned every share in the damage tree into 0 or 1.
  - `src/shared/format.ts` → `electron/tests/format.test.ts` (the display formatters the panels share).
    Pinned because of how they arrived: `clock` existed in three components and `mins`/`duration` in
    **four**, under two names with **three** different answers to the same span — one dropped the
    seconds, one kept them, one showed a dash at zero. Every reading was wanted; sharing a name while
    disagreeing was the bug. The tests hold the option explicit, and hold "a timestamp that isn't one
    reads as a gap". Locale wording is the browser's, so they assert structure, not words. `percent`
    arrived the same way — a dozen inline `Math.round(x * 100)`s and `(x * 100).toFixed(0)`s, two answers
    to "what is half a percent" — and takes the **fraction**, so it composes with `ratio`; what's pinned
    is that `0%` is a reading (a measured nothing is real) while an absent or non-finite value is a gap.
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
  - `src/shared/zones/resolve.ts` → `electron/tests/zone-resolve.test.ts` (matching a zone name against
    the zones we know — [ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)). Two
    properties that pull against each other: it **resolves rephrasings** ("The Castle of Mistmoore" →
    "Castle Mistmoore", a sub-zone → its parent) and it **refuses to guess** (ambiguity, weak spelling,
    and a zone the list simply lacks all come back undefined, because a wrong zone is worse than none at
    every call site). The safety half runs against the **real 344-zone table** rather than a fixture:
    with every tier on, all 344 resolve to themselves and none to a neighbour — which a hand-picked list
    could never show.
  - `electron/migrations.ts` → `electron/tests/migrations.test.ts` (one-time repairs to data already on
    disk — [ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). A migration
    edits the player's own recorded history, so what it must **not** do carries the tests: never
    overwrite a zone a record already has (the record's wording came from the log; ours would be a
    reading of it), never choose when two characters' logs disagree about where you were, leave a record
    the log can't speak for unplaced, and lose nothing when it can't run — with the backup written only
    when there is actually something to repair, and the whole thing idempotent. Touches a temp dir and
    writes a synthetic log: what lands in the file *is* the feature.
  - `src/shared/zones/place.ts` → `electron/tests/zone-place.test.ts` (which place a *recorded* zone
    name means — [ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). Data
    is stored with the in-game name and grouped when it's read, so this is the module every aggregation
    goes through, and two properties carry it: the answer is a **property of the name alone** (asserted
    by asking in different company, and by aggregating a reversed input to the same result — "repeatable
    and fixable" is only true if nothing about the batch can move it), and a zone **no table knows keeps
    its own name** rather than being guessed into a neighbour's. Plus the deliberate asymmetry: a *key*
    comes from the table, while `samePlace` — a filter — may also take the one-edit rule, because a row
    shown wrongly is recoverable and a merged sample isn't.
  - `src/shared/zones/gazetteer.ts` → `electron/tests/zone-gazetteer.test.ts` (the supplied zone table,
    and the two views derived from it —
    [ADR 0076](../decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)). The data comes from
    outside, so this is a **review, not a unit test**: it is what a re-supplied file has to pass. Almost
    all of it is about what must *not* happen, because going from 3 hand-written aliases to 250-odd
    derived ones feeds the fold that keys every kill record — no alias may rename a zone we name, none
    may fold two of the fandom table's distinct zones together, no bracketed spelling may get in (the
    real bug it caught: `Qeynos (North)` folds to `qeynos`, renaming the city to its own half), and
    nothing the gazetteer names may end up *excluded* from the picker by the era filter. Plus the two
    entries it independently confirms, which are why it's believed at all.
  - `src/shared/zones/spelling.ts` → `electron/tests/zone-spelling.test.ts` (the same zone spelled wrong
    — [ADR 0075](../decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)). The rule is one edit
    wide, so the whole risk is in what it **refuses**, and the load-bearing test is a corpus one: over
    all 361 zone names the app ships, no two are one edit apart. It stays honest if the expansion table
    is ever regenerated, and it's why one edit is the ceiling — at two, the same corpus offers twelve
    real pairs (East/West Karana, North/South Qeynos). Plus the property that makes the resolver's
    `typo` tier shippable: a typo of any zone resolves back to *that* zone or to nothing, never to
    another, since a name can sit one edit from two zones that are two apart.
  - `src/shared/zones/expansions.ts` → `electron/tests/zone-expansions.test.ts` (which expansion a zone
    came with, and whether that means you can go there —
    [ADR 0065](../decisions/0065-a-zone-belongs-to-an-expansion.md)). Checked in **both** directions,
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
  - `src/shared/awari-bootstrap.ts` → `electron/tests/awari-bootstrap.test.ts` (our HTTP client for the
    room directory — awari ships none, so this one is ours). Every test is a way the service can fail,
    and every one must **reject**, because core waits on that: it confirms a leader-hint registered
    *before* committing leadership, so a client that resolves regardless leaves a peer believing it leads
    a room nobody can resolve — the "two clients never met" symptom
    [ADR 0028](../decisions/0028-peer-networking-verified-and-repaired.md) mitigated with jittered
    rejoins. So a refused hint rejects on **every** status that isn't `registered`, including none at
    all; the three transport failures stay told apart (unreachable, a status code, a body that isn't
    JSON) because the message is what reaches the log
    ([ADR 0052](../decisions/0052-an-error-goes-to-the-log-not-the-screen.md)) and "bootstrap is down"
    has to read differently from "nobody's online"; and a body missing `status`/`contacts` is refused
    rather than handed on, since core reads that as an empty room. `fetch` is injected, the way
    `createXpProgress` takes its clock — so this needs no network and no DOM. Lives in `shared/` because
    that is what `tsconfig.electron.json` can see; the browser-only transport stays in
    `src/lib/awari/net.ts`.
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

## Testing against a real game install

Almost everything this app reads belongs to the player: their **log**, which carries their
character's name and other people's chat, and their **game install**, which is tens of megabytes of
Daybreak's data. Neither can be committed — the first for privacy, the second because it isn't ours
to redistribute — so committed fixtures are small, and `fixtures/spells_us_sample.txt` is outright
**synthetic**, built to a documented layout rather than copied from a real file.

That leaves a gap worth naming: a synthetic fixture proves we read *the format we believe exists*,
and can never prove the format. When that gap was closed by hand once, the live `spells_us.txt`
turned out to have **173 columns where the reference documented 171**
([ADR 0080](../decisions/0080-the-game-s-own-spell-file.md)) — harmless, because nothing validates a
width, but invisible to any fixture we write ourselves.

So `electron/tests/game-data.ts` gives an **opt-in** handle on a real install, and `*.live.test.ts`
files use it. Point it at one and they run; don't and they *skip*, so CI and anyone without the game
are unaffected. Two ways to point it, the env var winning when both are set:

```bash
EQL_GAME_DIR="…/Installed Games/EverQuest Legends" npm test
```

…or write the path into **`fixtures/local-game-dir.txt`**, which is gitignored — one line, no
quoting. A path that doesn't exist, or doesn't hold `spells_us.txt`, reads as "not configured"
rather than failing every live test.

**The rule these tests follow: assert game data, never your data.** A spell's name, mana cost and
class levels are Daybreak's facts — the same for every player, stable for decades, and safe to
write down. Your install path, your character names and anything out of your log are not, so no
live test puts the resolved path in a test name, an assertion message or its output; a failure says
*what* disagreed, not where the file was. Nothing about the machine reaches the repo.

A real **log** is a different matter again, and deliberately has no helper here: it's the most
sensitive file of the set, and the thing it's most useful for — feeding a whole evening through the
parsers to see what they couldn't read — is the unread-line tally
([ADR 0079](../decisions/0079-an-unread-line-is-counted-by-its-shape.md)), which is a debug-log
activity rather than an assertion. If a real line ever needs pinning as a fixture, sanitise it
first: no chat or tells, character names replaced.

## Guidance
- New pure logic (e.g. the wiki HTML parser) should get its own `*.test.ts` under
  `electron/tests/` with a captured HTML fixture, so it becomes a black box too.
- Anything read from the player's install gets a synthetic fixture for the everyday suite **and** a
  `*.live.test.ts` that checks the same reading against a real one — see above. The two answer
  different questions and neither replaces the other.
- Treat passing black boxes as frozen: don't edit them without cause, and don't
  re-verify them when unrelated code changes.

## Non-responsibilities
- No end-to-end Electron/GUI tests — window behavior is verified by running the app
  (`npm run dev`), and the loot pipeline by `npm run sim`. The dev sandbox is headless.
- Network calls (the wiki API) are not hit in tests; parsers are tested on fixtures.

## See also
[manual QA checklist](./manual-qa.md) · [log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md)
