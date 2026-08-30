# Todo

**Open work only** — a bug, or a decided change someone means to make. Delete an item when it's done
and record the outcome where it belongs (an ADR, a README, or the code). Three neighbours take
everything else, so this list can stay short enough to read:

- [ideas.md](./ideas.md) — features worth building that nothing is waiting on.
- [decisions/README.md](./decisions/README.md) `## Open Questions` — anything that needs *deciding*
  first.
- [testing/manual-qa.md](./testing/manual-qa.md) — built, typechecked and tested, but never yet run
  for real (in-game, packaged, or across two clients).

## Distribution

- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download → `/releases/latest`,
  Launch → `eqlist://open`) and the Download target is populated by CI. Remaining: **host** the static
  page somewhere (e.g. GitHub Pages). Optional: point Download straight at
  `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown publisher".
  Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

## Next up

- **Hold an unplaceable name loosely, then process it** — [ADR 0127](./decisions/0127-an-unknown-name-is-held-not-dropped.md),
  in the order the measurements set rather than the order the idea suggests. Today an unproven named
  pet is *dropped*: `pet-registry.ts` learns one only from `<Pet> told you, 'Attacking <mob> Master.'`
  ([ADR 0077](./decisions/0077-a-pet-is-proven-not-guessed.md)) and starts every launch empty, which
  is why this reads as a fresh-install fault. Measured on a magician's 315,601-line log — 34 pets in
  three weeks, a fresh name per summon, each blind 15s to 5½ minutes: **646** damage short on
  `totalDealt`, **5,608** on `yourDealt`, **2,127** on `yourTaken`, concentrated in **26 fights**,
  with four pets doing more damage before their proof than after it (`Xebeker` 671 vs 201).

  Three steps, and **the first is the gate**:

  1. ~~**Re-derive a stored fight.**~~ **Done** —
     [ADR 0128](./decisions/0128-a-fight-is-re-derived-not-refused.md). Eating a log now redoes the
     fights it already holds, so an identity settled after a fight was filed can reach that fight.
     Proven on the measured log: re-reading it with every pet known refreshes 1,000 stored fights and
     puts 3,906 damage into them. **The remaining two steps are what turn that into the full 5,608.**
  2. **Make attribution read-time everywhere.** The *saying* half is done —
     [ADR 0130](./decisions/0130-data-in-doubt-says-so.md): a window holds the names nothing placed,
     re-asks on read, and the doubt propagates to the sitting, the camp and any record taken off the
     fight (measured: 20% of fights, 73 names, no false positives among the top ones). The *fixing*
     half is not. `mine` is already read-time for rows and cells (`combat-stats.ts`'s `row()`), which
     is why `totalDealt` is only 0.03% short, but it is baked at record time in seven places —
     `w.bucket` (sparkline), the per-spell table, the per-invocation proc tallies, the `incoming`
     death-recap buffer, `castRepertoire`, `pending`, `lastLanding` — so a fight filed *after* its pet
     is proven still contradicts itself: the damage is on the row and in the drill-down and missing
     from the Spells tab and the sparkline. Shape: tally an undecided name into a **held** side-tally
     keyed by that name, merge it in when the name is decided. Bounded, since only ambiguous names get
     one.
  3. **`FightScope.admits` gains a third value, `hold`.** Its doc explains the boolean: it "runs live,
     once per line, with no way back". After (1) and (2) there is a way back. Expiry of a held event
     means drop, so it degrades to today's behaviour.

  Deciders, all checked against the log (full workings in ADR 0127): the attack confirmation (242
  lines); `<Pet> says, 'Sorry, Master... calming down.'` (138, no false positives, worth adding once
  there is somewhere to put it); party joins and group chat, which `party.ts` already reads but only
  forwards; an article meaning mob; and the **negative** deciders a pen needs as badly — a name that
  talks in a chat channel is a player, and a pet cannot, which is what lets the pen discard instead of
  holding to expiry. Not proof: `was partially successful in capturing` (442 of its 1,242 lines name a
  player in the group). Proof but nameless: `Captured <mob>'s attention, Master!` (1,635 lines).

  Three more deciders from **eql-meter** v0.1.28 (see [neighbours.md](./neighbours.md)), and the
  honest state of all three is that **none is counted on a log of ours** — `fixtures/` holds no
  instance of any of them, so the line count and false-positive rate every decider above carries is
  missing, and getting it is the gate on adopting these rather than a follow-up to it:

  - `<Pet> says, 'My leader is <Player>.'` — the `/pet who leader` answer, and the odd one out twice
    over. It is **asked for** rather than waited on, which makes it the `AskValue` nag
    ([ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md)) pointed at a pet instead
    of a `/loc`, and the one decider a blind window can be ended *deliberately* with. It also names
    the **leader**, so it is the only signal here that can place a **group-mate's** pet: every proof
    ADR 0077 admits is addressed to you and therefore only ever answers "is this mine", where this one
    answers "whose is it". That is a wider claim than ADR 0077 makes, and should be read as an
    extension of it rather than an application of it.
  - `<Pet> told you, 'I am unable to wake <mob>, Master.'` — the same private-tell proof as the attack
    confirmation and structurally as safe (a tell addressed to you cannot be about someone else's
    pet), but it fires on an order that **failed**, so it can land inside the blind window before
    anything has been attacked — which is where the damage measured above is lost.
  - `You begin casting Burnout.` followed by `<Pet> goes berserk.` — a pet-only buff, so its landing
    names a pet; eql-meter reads Augment Death and Focus Death the same way. Worth noting for the
    order of work rather than for the evidence: this is the **same two-correlated-lines trick** as
    *Gate a shared emote on your own cast* below, and wants the same pending-cast map. Build that one
    first and this rides on it instead of growing a second copy.

- **eqlgs.net is down** (checked 2026-08-28: `HTTP 502 Bad Gateway` at the origin — the host answers,
  the app behind it doesn't). That blocks the item below, which depends on reading its pages. Worth
  re-checking before spending any time on it; a 502 is the kind of thing that comes back.

- **An item's era is derived where a neighbour simply states it.** [Lucy](./lucy-data/README.md) is
  in ([ADR 0124](./decisions/0124-lucy-is-a-second-opinion.md)) and its one real weakness is the era:
  Lucy has no era or expansion field anywhere, so the verdict is inferred from the zones on its drop
  and merchant rows, and for a quest reward or a crafted good it can only answer `unknown` — which is
  most search rows, until you open one. **[EQLGS](./neighbours.md) has the field.** Its item search
  shows an expansion badge *and* a hand-curated availability flag whose hover reads verbatim `Item is
  verified as available in EverQuest Legends`, and — the part that makes this cheap — **it is keyed on
  the same item ids Lucy is**: `eqlgs.net/item/detail/1649` and `lucy.allakhazam.com/item.html?id=1649`
  are the same bracelet, and its own page links out to Lucy. So `LucyItem.id` is already the join key;
  nothing has to be matched by name. Two further prizes on the same page: its **zone names need no
  decoder** (it says `The Hole` where Lucy says `Ruins of Old Paineel 2.0 (The Hole)`), and its drop
  lists are **this server's** — ten elemental NPCs in The Hole for that bracelet, where Lucy has two.
  What to settle first: it has **no public repo and no licence to read**, so this is a scrape of
  someone's website and worth asking them about; the availability flag is one person's curation, not a
  measurement, so it belongs at Lucy's trust level rather than the wiki's; and it says
  `WARNING: Out of era items may be listed!` over its own results, which is a caveat to carry through
  rather than launder.

- **Lucy isn't in the setup check.** The `wiki` step pings eqlwiki and reports how long it took
  (`pingWiki`, `electron/self-check.ts`), and there is no equivalent for
  [Lucy](./lucy-data/README.md) — so "search found nothing" and "lucy.allakhazam.com is unreachable"
  read identically in the one place built to tell those apart. The shape is already there: a
  `pingLucy` beside `pingWiki` (smallest thing the site will serve, short deadline, never throws), one
  more entry in `SETUP_CHECKS`, one more injected dep. The wording should say what the `wiki` step's
  does — that nothing else in the app needs it.

- **A consider's level is unread — and one real line unblocks it.** The model is built and tested
  ([ADR 0121](./decisions/0121-a-mob-is-a-range-of-levels.md), `src/shared/levels.ts`): a mob's level
  is a *range*, its bounds widen with evidence, the wiki's `Level: 33-37` already parses, and pooling
  a range across contributors is arithmetic that already exists. What's missing is the live source.
  `parseSighting` reads a consider today for a different purpose — it recognises the closed set of
  faction wordings (`regards you indifferently`, `scowls at you, ready to attack`, …) as proof the mob
  is up ([ADR 0097](./decisions/0097-a-sighting-is-the-tightest-evidence-there-is.md)) and **throws
  the rest of the line away**, including the `-- this opponent looks like an even fight` tail.

  It needs **one consider line, copied out of a real log**, showing where the level appears — in the
  tail, on a line of its own, or somewhere else. That regard list fails closed on purpose (a false
  sighting is permanent, a missed one costs a click), so guessing the wording is exactly the mistake
  it exists to prevent. With the line in hand this is: extend the consider parse to carry an optional
  `level`, fold it through `observeLevel` per mob, store it beside the observations, and put it in the
  contribution payload — the machinery from
  [ADR 0132](./decisions/0132-a-contribution-is-keyed-by-who-made-it.md) carries it unchanged.

- **Nothing yet shows the pooled provenance it now carries.** `src/shared/pooling.ts` can say whose a
  figure mostly is, split a pooled drop rate back into your evidence and each contributor's, and name
  the drops where the two plainly disagree — and no panel reads it yet. The mob knowledge panel shows
  `myKills` of `kills` and a contributor list, which is the old, coarser version of the same idea.
  Wiring `poolStanding`/`poolWhy` into that panel's hover, and surfacing `disagreements()` somewhere,
  is what makes ADR 0132's "reported, not resolved" visible rather than merely true. `mobs.contributors()`
  is likewise wired end to end with nothing calling it — it's what a "who have I pooled with, and
  forget this one" list would be built on (`forgetPeers(id)` already takes an id).

- **Your own damage shield is unread.** The other half of
  [ADR 0095](./decisions/0095-your-own-dot-tick-is-yours.md), which fixed the DoT ticks and left this
  because it is a different line shape. Same first-person asymmetry, one wording along:

  | line | read? |
  |---|---|
  | `A pledge familiar is pierced by Kainos`s warder's thorns for 6 points…` | ✅ the pet's |
  | `A wild tiger is pierced by YOUR thorns for 1 point of non-melee damage.` | ❌ **your own** |

  `SHIELD_RE` binds on the `'s` possessive, and `by YOUR thorns` hasn't got one. **907 lines, 1,576
  damage** on the log ADR 0095 measured (thorns 1,034, flames 542) — small next to the ticks, and real.
  It needs its own thought rather than a copied regex: a shield is damage you dealt *by being hit*
  (`shield: true`, no spell), the amounts are tiny and the line count is not, and `YOUR` is
  capitalised where the tick form's `your` is not — so the two aren't one pattern with a flag.

- **A level that goes down may confuse the XP and HP trackers.** The same sweep found that EQL levels
  are **per class**: `You have gained a level! Welcome to level 11!` appears four separate times in one
  character's log, the sequence runs `… 19 20 21 13`, and the achievement line beside it reads
  `Primary Class Unlock - Wizard`. The log's level line names no class. `xp.levelUp(level, at)` and
  `hp.levelUp(level)` both assume a level only ever rises — `hp` voids its inferred bounds on a
  level-up ([ADR 0018](./decisions/0018-inferred-max-hit-points.md)), so a 21 → 13 line throws away
  bounds learned at 21 and starts inferring against a level the character isn't. Worth checking what
  each actually does with a *lower* level before deciding the rule; "ignore a level below the highest
  seen" is probably right for `hp` and probably wrong for `xp`, since the percentage really did reset.

- **A replayed gap is read and parsed in one tick.** Startup no longer stalls on the maps
  ([ADR 0072](./decisions/0072-a-folder-of-maps-is-named-once-and-remembered.md)), but the other thing
  that begins at launch still can: `log-watcher.poll()` reads *everything* appended since the cursor in
  a single `readNew(offset, size)` and runs the whole batch through `splitLine` → `parseSplitLine` → the
  handlers without yielding. Measured on a real log, parsing alone is ~20ms/MB and the downstream fan-out
  (meter, kill log, HP, alerts) costs more than the parse — so play for an evening with the app closed
  and the first poll is a multi-second freeze, ADR 0044's "read it as the news it is" paid all at once.
  The fix is a byte cap per pass, continuing on the next tick until caught up, which `catchingUp` already
  has the shape for; the care needed is that `onCaughtUp` must still fire once, after the last chunk.

- **Three expansion pages the zone table can't read.** `scripts/fetch-zone-expansions.mjs` gets 22 of 25
  expansions; **Omens of War**, **Ring of Scale** and **The Darkened Sea** write their zone lists in a
  shape neither of the two it handles matches, so it skips them and says so
  ([ADR 0065](./decisions/0065-a-zone-belongs-to-an-expansion.md)). Their zones therefore aren't excluded:
  they'll be offered in the picker and, being their own continents, sit as isolated zones rather than
  corrupting a route. Worth a look at those three pages' wikitext — it may be one more row separator.

- **Travel: the graph doesn't honour `STOCK_ONLY_ZONES`.** The map draws a pinned zone from the game's
  own files, but `buildFromSource` harvests exit labels per source, so the graph reads that zone's
  labels from the *chosen pack's* file — the two can disagree about a zone we've deliberately said the
  pack gets wrong. Same plumbing as the item below (a harvest has to read each borrowed or pinned zone
  from its own folder), so worth doing in one go.

- **Travel: a graph could borrow a zone the pack lacks, the way the map now does.**
  [ADR 0063](./decisions/0063-a-zone-the-pack-lacks-is-borrowed.md) made the zone *list* fall back to the
  game's own maps for a zone the chosen pack has no file for; `travel-graph.ts` still builds strictly per
  source (`zonesFromFiles`, one folder). So a zone only the backstop covers is a hole in the graph — and
  worse than a hole, since its neighbours' `to <zone>` labels then resolve to nothing and show up as
  unresolved destinations. `zonesFromSources` is the shape to reuse; the wrinkle is that harvesting has
  to read each borrowed zone's labels from *its own* folder.

- **Draw the chosen route across the maps it crosses.** *(Asked for again — still the biggest open
  piece of the travel UI.)* The graph's nodes are now on the map they were
  read from ([ADR 0113](./decisions/0113-the-graph-is-drawn-on-the-map-it-was-read-from.md)); the half
  that was deliberately not built is the *route* — every map a trip passes through, laid out and joined
  at the borders they share, with the chosen path drawn through the waypoints. Everything it needs
  exists: `surveyZone` gives a zone's nodes and positions, a border node carries **its position in each
  of its two zones**, which is exactly the pin that stitches two maps together, and `routeInstructions`
  already says which nodes the route uses in order.

  **The thing to settle first is not technical.** A line between two points on a map is a claim about
  the ground between them, and this graph cannot support one — that is the whole of
  [retired ADR 0049](./decisions/README.md), and the map's non-responsibilities still say so. A
  cross-map schematic may be a different claim (“these are the places, in order” rather than “this is
  the way”), but it will *look* like a path however it is drawn, so it needs an answer to **what stops
  a reader walking it** before any of it is built — probably in how it is drawn (deliberately not
  following the geometry: straight, or curved, or beaded) rather than in a caption nobody reads.

  Two smaller things fall out of it: two maps have **no shared coordinate frame** (a border's two
  positions are in two different ones), so laying them out is a placement problem with no correct
  answer, only a legible one; and a zone the route only passes *through* by conveyance has no walk in
  it at all, so it may deserve to be drawn as a stop rather than a map.

- **Ocean of Tears, and the maps that are split in confusing ways.** The wiki pass
  ([ADR 0117](./decisions/0117-the-wiki-says-which-zones-touch.md)) got East Freeport ↔ Ocean of Tears
  back, but the underlying mess is still there and is the biggest known source of thin data. Four of
  the five duplicate drawings ([ADR 0111](./decisions/0111-one-zone-one-map-file.md)) carry **more
  travel labels in the drawing the fold discards**: `oceanoftears` holds Ocean of Tears' druid ring,
  boat dock and the Narrik translocator while the kept `oot` holds only a succor point; `freeporteast`
  holds six exits to `freporte`'s two; `southro` holds ten to `sro`'s four. They **cannot** be merged —
  the frames genuinely differ, the same `to Innothule Swamp` sitting at `-1101, 3200` in `sro` and
  `342, 596` in `southro` — so the kept drawing has to win and those labels are simply lost.

  Two threads to pull, neither obvious: **which drawing should win?** Today it is the *named* one, which
  is right for the map overlay (the survey must be drawn in the frame you are looking at) and often
  wrong for coverage. And **East Freeport is currently two zones in the graph**, since `freeporteast`
  isn't a spelling of "East Freeport" and the fold's rule can't see it — the same is likely true of
  other pairs the spelling test misses. Worth an audit of the pack's file list against the gazetteer
  before deciding anything.

- **More second copies of a zone, in the same shape as the ones already listed.** `NOT_IN_GAME` and
  `STALE_DRAWINGS` cleared the ones that were producing visible noise; the same query that found them
  still returns names worth a look, and West Freeport is the clearest — it still shows borders to *The
  Commonlands* and *Oldcommons*, which are the revamped single Commonlands and an older copy of it,
  where this server has East and West Commonlands. Each needs somebody who knows which zone is live on
  Legends rather than a rule: the query (a zone whose whole travel content is one border the neighbour
  never drew) is in [ADR 0111](./decisions/0111-one-zone-one-map-file.md)'s neighbourhood and returns
  four real places among its 44, so it can only ever be a worklist.

- **102 borders are still one-sided.** 161 before the far side started naming what this side couldn't
  ([ADR 0115](./decisions/0115-a-border-one-side-could-not-name.md)), then up as the wiki added borders
  nobody drew ([ADR 0117](./decisions/0117-the-wiki-says-which-zones-touch.md)) and down again as the
  instance zones and Timorous Deep's destination board came out
  ([ADR 0119](./decisions/0119-a-pile-of-destinations-is-a-sign.md)). What is left is the real thing:
  a zone whose mapmaker labelled no way back. Each puts a `2000?` stand-in
  ([`UNKNOWN_CROSSING`](../src/shared/travel/types.ts)) on a leg — once, now that a stand-in can no
  longer be chained ([ADR 0118](./decisions/0118-a-stand-in-is-not-a-shortcut.md)) — and each is one
  `manual-links.ts` entry from a measured distance: open the map with the 🧭 panel up, read the
  coordinate off the way out, add the boundary's missing side. Worth doing for the ones that keep
  turning up in real routes; the survey aside names them per zone under *Here, but nowhere on this map*,
  and marks the wiki-only ones `wiki` — those never had a coordinate to lose, so they are where a
  hand-authored entry buys the most. **East Freeport ↔ West Freeport is the one to do first**: it sits
  on the route between Faydwer and everything east of it, and East Freeport's classic drawing is the one
  the fold keeps while the gnome and half its exits are in the modern one.

- **The map's zone picker lists a zone drawn twice, twice.** The travel graph now folds a pack's second
  drawing of a zone into the first ([ADR 0111](./decisions/0111-one-zone-one-map-file.md)) — five pairs
  in Brewall, `mistythicket` beside `misty` — but that fold is the graph's alone. `zonesFromFiles` still
  returns both, so the picker offers "Misty Thicket" and a bare "mistythicket" beneath it, and kills and
  mob knowledge keyed to whichever you were looking at are two piles. Cosmetic where the graph's version
  was a wrong answer, which is why it was left: `zonesFromFiles` is the map subsystem's core and its
  outputs are pinned by tests. The rule is written and tested already (`duplicateZoneFiles`) — the work
  is deciding whether the picker should hide the duplicate outright or show it as a second *drawing* of
  one zone, since it is a real map someone may prefer.

- **`poiKind` reads `Druid Rings` as a plain name.** Its transport vocabulary spells the ring singular
  (`\bdruid ring\b` can't reach the plural), so those markers are filed under "Names & places" in the
  map's own label filter instead of "Ports & boats". The travel graph re-reads its fallback kinds to get
  around it; the filter still shows them in the wrong section. One character in the regex, but it's a
  pinned black box with a corpus tally behind it
  ([ADR 0048](./decisions/0048-a-map-label-is-read-by-its-words.md)) — worth re-tallying rather than
  patching blind.

- **The pin editor is placed in the wrong pixel space.** `onPinClick` / `onPlace` hand `PinEditor` a
  click's raw `clientX/clientY`, and it writes them as a `fixed` position — so under any map scale
  other than 100% the editor opens away from the pin it belongs to (at 200%, twice as far from the
  corner). Exactly the defect [ADR 0123](./decisions/0123-a-popover-is-placed-in-the-units-it-is-written-in.md)
  fixed for hover popovers, and the same one-line conversion (`localPoint`, in `src/lib/screen.ts`)
  fixes it — left out of that change because a click-positioned editor is not a hover popover and
  deserves its own look at where an editor *should* open.

## From the neighbours

Changes decided by reading **EQBuddy** and **eql-tooltip**, both of which solve our problems for
a different player and got somewhere we haven't. Taken because the knowledge in them is *empirical* —
which letters OCR confuses in EQ's font, what a player actually wants an alert to do — and that is
the kind of thing worth borrowing rather than rediscovering a year later.

Every repo named below, and the file to open in it, is in [neighbours.md](./neighbours.md).

- **A watch can hold a regex, and can't hang the watcher.** *Smaller than it was:*
  [ADR 0084](./decisions/0084-a-watch-is-a-rule-not-a-substring.md) took the cases this item led with
  — "either spelling of this raid call" is now `match: any` with a second condition, and an anchored
  match is `starts` / `ends` — without a pattern language or its hazards. What's left is genuine
  patterns: a number in the sentence, a name shape, anything a fixed string can't describe. Worth
  asking first whether that's a real request or a completionist one, because the cost below hasn't
  moved at all.

  A per-watch `.*` toggle makes the text a real `RegExp` (case-insensitive, as the plain mode already
  is). The care is entirely in the failure modes, and both are ours to own now that
  [ADR 0050](./decisions/0050-a-watch-can-read-a-whole-log-line.md) points watches at *every* line: an
  **invalid** pattern must match nothing and say why where the user typed it, rather than throwing
  inside the poll; and a **runaway** pattern must be cut off — EQBuddy caps a match at 100 ms and catches
  `RegexMatchTimeoutException` in `src/EQBuddy.Core/TrackedRule.cs`, a luxury .NET gives it and Node
  doesn't — because the watcher polls twice a second on the main process's thread and a backtrack stalls
  log tailing outright. Node has no regex timeout, so the cut-off needs deciding rather than assuming:
  the cheap version is to reject patterns with the nested-quantifier shapes that backtrack, the honest
  version is to match somewhere that can be abandoned.

- **An alert can be spoken.** [alertSounds.ts](../src/lib/alertSounds.ts) synthesizes beeps, and a beep
  can only say *something* happened — mid-fight, distinguishing four of them means looking away from the
  game, which is the one thing an overlay exists to prevent. `speechSynthesis` is already in the renderer
  where the alert overlay lives, so this is a per-watch toggle and a call, not a dependency. Two details
  from EQBuddy that make it usable rather than maddening: **duplicate suppression**, so a chain of fades
  doesn't chant at you, and speech being *orthogonal* to the beep — a watch can ding, speak, both, or
  neither. What it speaks should be the watch's `message` when set, since that field already exists to
  say what the player actually wants to hear rather than what the log said.

## From the neighbours, second pass

A wider read: **eql-log-reader** (a five-overlay Python suite over the same log),
**everquest-legends-mcp** (a read-only MCP server over EQL's public sources), **eql-info** (which
decoded the client's spell file), and **everquest-legends-companion** (a planning PWA) — all four, and
the file to open in each, in [neighbours.md](./neighbours.md).
The theme running through them is that **we read the log, the wiki and the map files, and stop
there** — while the game ships several more files, and two public databases describe this game's
lineage. Most of what follows is about widening the input, not the output.

- **`dbstr_us.txt` is the third of the game's own text files, and still unexamined.** 9.8 MB, sitting
  beside the two we now read (`spells_us.txt` for the facets a spell has,
  [ADR 0080](./decisions/0080-the-game-s-own-spell-file.md); `spells_us_str.txt` for the sentences it
  prints, [ADR 0140](./decisions/0140-a-buff-is-watched-until-it-lapses.md)). It is where AA and item
  **description** strings live. No consumer in mind yet, which is why this is a note and not a plan —
  recorded because the other two each turned out to answer a question we had already written down as
  a limit.

- **A Project Quarm baseline, as a seed layer under our own observations.** Spawn timers now ship and learn
  from scratch ([ADR 0092](./decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)) — nothing
  seeds a named before your first two kills of it, and the wiki usually can't. eql-log-reader ships a
  distillation of the public Project Quarm database — same EQMacEmu lineage as EQL — carrying exactly
  the three things we keep wanting: **named spawn points, respawn timers, and drop tables with
  percentages**, plus zone adjacency and an item id↔name map. A second file distils ~3,300 item turn-ins
  from Quarm's quest scripts. Both are regenerated by committed dev scripts from a public dump
  (`eql_atlas_baseline.json.gz` / `eql_atlas_baseline_build.py` and `eql_quest_db.json.gz` /
  `eql_quest_db_build.py`), so this is a build-time input rather than a runtime dependency. Their
  `ARCHITECTURE.md` §2 is the shortest description of what each file actually holds.

  It bears on three open things at once: the spawn timers above, the wiki-claimed half of
  [drop-truth.ts](../src/shared/drop-truth.ts), and the two travel items above, where the graph has
  holes because it can only know what a mapmaker labelled.

  **This needs an ADR before any code.** It is a second reference source with different provenance,
  different licensing and a different game than [ADR 0003](./decisions/0003-eqlwiki-runtime-data-source.md)
  chose, and the whole argument for it rests on how it's *presented*: era-gated, shown as a claim rather
  than a fact, and outranked by observation the moment we have one — which is
  [ADR 0025](./decisions/0025-observation-over-the-wiki.md) again, pointed at a source that is further
  from this game than the wiki is, not closer.

- **A borrowed claim can be promoted to proven, permanently.** The other half of the item above, and
  worth its own line because it generalises past Quarm. eql-log-reader flags a quest **✔ confirmed on
  EQL** — permanently, per character — the moment the log shows the hand-in NPC speaking that quest's
  recorded success dialogue (`QuestState.confirmed` in `eql_quest.py`, a `{qid: epoch first seen}` map
  persisted per character; the dialogue is case- and whitespace-folded before matching). The claim came
  from another game's scripts; the *proof* came from this one,
  and once proven it stops being provisional. We have the reverse machinery already —
  [ADR 0031](./decisions/0031-an-inferred-bound-must-be-able-to-fall.md) lets an inferred bound fall, and
  [ADR 0056](./decisions/0056-a-dropped-record-keeps-what-it-taught.md) keeps what a dropped record
  taught — but nothing that *ratchets*: no way for a piece of borrowed data to be marked "this one we
  have seen ourselves." The care is in picking evidence a false positive can't fake (a whole dialogue
  sentence, not a substring) and in being clear that confirmation is per character and permanent, while
  its absence means nothing at all.

- **In-zone A\*, revisited with new evidence — and the evidence says no.** Recorded because it will come
  up again. eql-log-reader draws a guide line by A* over the map's own geometry, which is precisely what
  [ADR 0049 was retired](./decisions/README.md#retired-and-reused-numbers) for and what
  [map](./map/README.md)'s non-responsibilities rule out: *"an `L` record is a wall in a dungeon and a
  contour line outdoors — so a route through the geometry could only ever be a guess dressed as
  advice."* Reading their implementation settles whether they solved it: they did not. `_nav_graph()` /
  `_nav_path()` in `eql_atlas_map.py` snap every `L` segment endpoint to a coarse grid (8×8×24) and make
  the **line segments themselves** the traversable edges, then A* over that with straight-line distance
  as the heuristic — so the path follows the drawn lines. In a dungeon, where those lines are corridor
  walls, following a wall roughly parallels the corridor and looks convincing. Outdoors, where they are
  contours, it would confidently route you along a hillside. So the objection stands, and shipping it
  anyway is what a neighbour did, not a counter-argument.

  What *would* reopen it: the claim narrowed to zones where the geometry is known to be walls —
  `zone_type` in `spells_us.txt` (column 33: outdoor / dungeon) is one signal we'd have for free once we
  read that file, and the map's own z-spread is another. A dungeons-only guide line that refuses to draw
  outdoors is a different, smaller claim than the one that was retired, and it's the only version worth
  costing.

- **A generated dataset should be stamped by the script that built it.** *Half done:* the stores under
  `userData` now stamp themselves and the app flags what the rules have moved on from
  ([ADR 0096](./decisions/0096-stored-data-says-which-rules-wrote-it.md)). What's left is the other
  kind — the **committed** artefacts (the travel graph, the zone/expansion table, the zone gazetteer),
  which are registered as concerns but whose state can only be *asserted* by hand-bumping a revision,
  never computed. So the panel can give you the command and cannot tell you whether you need it.

  The MCP neighbour's shape is the one to copy: `src/data/eql-client/manifest.json` lists every source
  file with **bytes, mtime and sha256**, plus an `extractedAt` and an `extractorVersion`. With that
  beside a generated dataset, "is this stale?" becomes computable — re-hash the sources and compare —
  rather than a revision somebody remembered to bump. `scripts/` already owns the build side, so this is
  a manifest writer shared by three scripts and a reader in `data-health.ts`.

  The same extraction is also a way out of a bug above: **three expansion pages the zone table can't
  read**. The MCP's client-derived zone inventory (`src/data/eql-client/zones.json`) is 192 map files'
  worth of labelled POIs with x/y/z and a `classicExpansionHint` per zone, none of it parsed from wiki
  prose — so the zones we currently miss because
  [ADR 0065](./decisions/0065-a-zone-belongs-to-an-expansion.md)'s harvester can't read three page
  layouts are simply *listed* by the client. Worth doing as one piece of work: a script that reads the
  install, writes the dataset, and writes the manifest next to it.

- **Data-integrity tests, as their own category.** Our 73 test files test **logic** — parsers, fuzzy,
  routing, geometry. None asserts that our shipped *data* is self-consistent. The companion app runs
  exactly that as a named category — `src/lib/maps.test.ts` is the pattern in miniature: *every zone has
  imported map geometry*, then structural assertions over every file (non-trivial path count, sane
  bounds, every colour index defined), with the failing zone's id in the assertion message. It is the
  one thing that would have caught, as failures rather than as
  things somebody eventually noticed, at least three items on this list: unresolved `to <zone>`
  destinations, zones the travel graph has no node for, and three expansions silently skipped by their
  harvester. The assertions are obvious once named — every travel edge resolves to a known zone, every
  gazetteer zone has a map file some source provides, every zone key in one table exists in the others,
  every expansion in the table has at least one zone. The point is that they run over the **committed
  artefacts**, so a regenerated dataset can't quietly get smaller. Related and cheap: our harvest
  scripts already **merge rather than overwrite** (`apply-travel-manual.mjs`), and the precedence rule
  that governs it should be written down as a rule rather than lived in the code.

## From the neighbours, third pass

Four more tools, all of them newer and narrower: **eqltools-companion** (an Electron overlay for
eqltools.com — the closest thing to us anyone has built), **eql-alerts** and **eql-meter** (a Tauri
trigger app and combat meter), and **eqdps** (a Go meter with a TUI and a GUI). The file to open for
each item below is in [neighbours.md](./neighbours.md) — see its *Which neighbour backs which item*
table, which covers every item on this page.

What this pass turned up is different in kind from the last two: less "here is a feature we lack" and
more **"here is a log line, a game command, or a distinction that does the work a heuristic is
currently doing"**.

Four of the six are **done** and have left this list: rank-aware spell costs
([ADR 0080](./decisions/0080-the-game-s-own-spell-file.md)), the named-pet proof and the bystander rule
([ADR 0077](./decisions/0077-a-pet-is-proven-not-guessed.md)), a fight recording why it ended
([ADR 0078](./decisions/0078-a-fight-records-why-it-ended.md)), and the unread-line tally
([ADR 0079](./decisions/0079-an-unread-line-is-counted-by-its-shape.md)). What's left:

- **`/out inventory` writes a file, and we never look at it.** The game will dump every bag, bank slot,
  depot and key-ring row to `<Char>_<server>-Inventory.txt` on command — and we are a **shopping list**
  that has no idea what the player already owns. Three of the ten neighbours read it
  (eqltools-companion parses it fully, eqdps has an `inventorysync` module, eql-log-reader's launcher
  detects it); we don't reference it anywhere.

  It is cheaper than it sounds, because the file lands in the **EQ install directory — the parent of
  the `Logs` folder we tail** — and [eq-maps.ts](../electron/eq-maps.ts) already derives exactly that
  path (`path.join(path.dirname(logDir), "maps")`) to find the map pack. The same `dirname` finds the
  dump. Poll for the newest by path+mtime; a dump is a few KB, so ship the whole file and parse it
  where the data lives.

  The format, from eqltools-companion's `renderer/app.js` where it's recorded against real dumps: a
  **TSV** with header `Location/Name/ID/Count/Slots`, CRLF line endings, and `Empty` placeholder rows
  to skip. Locations are worn slots (plus `-SlotN` socket rows), `General 1`–`12` with bag sub-slots,
  `Held`, `Bank 1`–`24`, `SharedBank`, `Personal-Depot`, `KeyRing`, and the Dragon's Hoard *only while
  its window is open*. Two traps they hit and wrote down: the client spells `General 1` **with** a
  space and `Bank1` **without**, so a matcher wants the space optional; and anything that matches no
  section must land in an "elsewhere" bucket rather than being dropped, because the list of locations
  is not closed.

  The honest limit is that a dump is a **snapshot taken on command**, not a feed — so live loot counts
  on top of it until the next one, and the app has to say which of the two a number came from. That is
  the same claim-vs-observation shape as everywhere else, and it's what makes the feature safe to
  build: it never silently goes stale, it goes *old*, visibly.

  What it unlocks: an item on the list you already hold, the quest-readiness item above (which needs
  "what do I have" far more than it needs "what did I loot"), and the **ignore list** in
  [ideas.md](./ideas.md).

- **Gate a shared emote on your own cast, instead of guessing from the sentence.**
  [cast-alerts.ts](../src/shared/cast-alerts.ts)'s `isNamedCaster` decides player-vs-mob from the
  article on a name, and the file says plainly that this is *"the only player-vs-mob signal a single
  cast line offers."* True — and the way out is to stop judging a single line. Many EQL land emotes are
  **zone-visible** (`X has been mesmerized.`, `X has been poisoned.`), so at a busy camp every nearby
  caster lights up your overlay. eql-alerts scopes them to you by arming the emote **only if you
  recently logged `You begin casting <that spell>`** — two correlated lines inside a short window,
  rather than a heuristic on one.

  We already parse both halves: `combatant()` folds you to `SELF` and the cast event carries the
  spell, so this is a small pending-cast map keyed by canonical spell name with a short expiry, read
  where a shared-emote watch fires. It is the **same shape as a delayed alert**
  ([ADR 0082](./decisions/0082-an-alert-can-be-scheduled.md)) — a thing that happened, remembered
  briefly, acted on when a second thing does or doesn't follow — so `alert-queue.ts` is the neighbour
  to read before starting, even though the state it keeps is the mirror image (a cue waits to *fire*,
  a pending cast waits to be *matched*).

  Note the honest edge eql-alerts also documents: some upgrade ranks still share one emote line
  (their example is Dazzle upgrading the generic mesmerize sentence), so the gate identifies *whose*
  spell it was, not always *which*.

  Two refinements shipped since (**eql-alerts** v0.1.29, 2026-08-13), and the second is a mechanism we
  would otherwise have had to find the hard way. First, the shared line **can** be narrowed after all:
  they resolve one `mesmerized` sentence to Mesmerize, Mesmerization, Dazzle or Fascination and scale
  the duration by rank — so *which* is answerable from the cast that armed the gate, which turns the
  edge above from a limit into a lookup. Second, and the part that is not just more coverage: a
  pending cast has to be **withdrawn**, not merely left to expire. A **fizzle** means the cast never
  landed, so an emote that follows it is somebody else's; and a **kill of a same-named mob** ends the
  attribution, so a later emote naming that name is a fresh mob and a fresh caster. Without both, the
  gate is strictly better than the article heuristic and still wrong at exactly the busy camp it was
  built for — two casters on `a gnoll pup`, one of whom fizzled.

- **A delay cue can still prompt a recast of a buff that never ends.** The permanence trap itself is
  answered — `buffdurationformula` states it, so the buff board reads it off the player's own install
  rather than carrying eql-alerts' hand-built list
  ([ADR 0140](./decisions/0140-a-buff-is-watched-until-it-lapses.md)) — but only the *board* knows.
  A hand-written watch with a `delay` ([ADR 0082](./decisions/0082-an-alert-can-be-scheduled.md)) will
  still say "recast Yaulp" 25 s after a cast, because a rule matches a line and knows nothing about the
  spell behind it. `SpellFacts.permanent` is now the fact that could gate it; what needs deciding is
  whether a rule should be *silently* suppressed (surprising — the player wrote it) or **told**, as a
  note on the rule's row saying this spell has no duration on this server. The second is more in
  keeping with how every other soft figure here behaves.

## Performance

- **The first Items open still costs ~400ms of disk**, warmed a few seconds after launch so it is
  usually already done. The walk is 11,519 individual `readFileSync` calls for 13.5 MB; a single
  packed index file (one read, one parse) would make it tens of milliseconds and remove the warm-up
  entirely. Worth doing if the catalogue grows much past this.
- **~55ms of structured clone per first mount** (4.3 MB of rows). Held across mounts in the window, so
  it is paid once per run — but a window opened later still pays it. Sending only the rows a filter
  actually keeps, or moving the search itself into main, would remove it.

## Build hygiene

- **A stale `out/` looks exactly like a broken feature.** The renderer bundle and `dist-electron` are
  built by separate scripts (`build:next`, `build:electron`), and a run that rebuilt only the second
  left the app pairing a months-old renderer with a current main process — which presented as the
  Items tab hanging, and cost an hour to diagnose. `npm run app` rebuilds only when the build is
  *missing*, never when it is merely stale. Worth either stamping both halves with the same version
  and refusing to start on a mismatch, or making `launch.mjs` compare mtimes against `src/`.
