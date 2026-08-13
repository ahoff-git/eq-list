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

- **`poiKind` reads `Druid Rings` as a plain name.** Its transport vocabulary spells the ring singular
  (`\bdruid ring\b` can't reach the plural), so those markers are filed under "Names & places" in the
  map's own label filter instead of "Ports & boats". The travel graph re-reads its fallback kinds to get
  around it; the filter still shows them in the wrong section. One character in the regex, but it's a
  pinned black box with a corpus tally behind it
  ([ADR 0048](./decisions/0048-a-map-label-is-read-by-its-words.md)) — worth re-tallying rather than
  patching blind.

## From the neighbours

Five changes decided by reading **EQBuddy** and **eql-tooltip**, both of which solve our problems for
a different player and got somewhere we haven't. Taken because the knowledge in them is *empirical* —
which letters OCR confuses in EQ's font, what a player actually wants an alert to do — and that is
the kind of thing worth borrowing rather than rediscovering a year later.

Every repo named below, and the file to open in it, is in [neighbours.md](./neighbours.md).

- **OCR is corrected before it is searched.** `cleanText` in `electron/lookup.ts` strips junk characters
  and stops; whatever survives goes to the Search box, where [fuzzy.ts](../src/shared/fuzzy.ts) has to
  absorb the damage as if it were a typo. But an OCR slip is not a typo — it is a *specific, repeatable*
  misreading of EQ's small font, and eql-tooltip has the tally, in `OcrVariants()` in
  `EqWikiOverlay/Wiki/EqlWikiProvider.cs`: `rn` read as `m` ("Morning Star" → "Moming Star") is the
  common one, with `q`→`g` and `0`→`o` behind it. Correcting before the search is
  what recovers a name fuzzy ranking alone can't, because the damage is one edit spread across a token
  boundary rather than a letter off. The shape: a pure `ocr-variants.ts` yielding the raw text plus its
  corrected variants in order, deduped, fed through `fuzzyRank`, best score wins. A black box with the
  confusion table as its tested surface — so when a new misreading shows up in the field, one list grows
  and nothing else moves.

- **An alert can be scheduled, not just raised.** Every alert fires the instant it matches, which is
  right for "dispel, now" and wrong for everything shaped like a reminder. A *delay* per watch (up to
  30 minutes, seconds by default, `m` for minutes) turns the same watch into a cue: match your mez and
  sound 25 s later to mean "recast it"; match a placeholder's death and sound at 8 m to mean "it's back".
  This is the cheapest route to timers we have — no timer subsystem, no catalog, just the watch list we
  already ship. Two rules to carry over from EQBuddy — see `AlertDelaySeconds` and `IsCombatCue` in
  `src/EQBuddy.Core/TrackedRule.cs` — both learned the hard way: only the **alert** waits (counts and the
  ledger update immediately, or the app is lying about what it saw), and a **death cancels a short cue
  but not a long one** — a reminder to recast is noise once you're dead, but dying doesn't change when a
  mob pops. The natural split is a pure "what should fire, and when" function next to `matchCast` in
  [cast-alerts.ts](../src/shared/cast-alerts.ts), with the scheduling itself in main.

- **A watch can hold a regex, and can't hang the watcher.** `matchesWatch` is `text.includes(needle)`
  and nothing else, so a watch can't say "either spelling of this raid call" without being two watches.
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

- **A named's respawn is learned from your own kills.** We know when a named died, where
  ([ADR 0022](./decisions/0022-invocation-effects-and-kill-locations.md)), and how confidently
  ([ADR 0023](./decisions/0023-kill-heatmap.md)) — and then throw the interval away. The gap between two
  kills of the same named *is* its respawn timer, measured on this server and this build, which is the
  same argument [ADR 0025](./decisions/0025-observation-over-the-wiki.md) already makes about drop rates.
  So: a countdown per named you've killed, seeded by the wiki's figure where it has one, and **tightened
  whenever you re-kill sooner than the timer claimed possible** (a shorter observation is proof; a longer
  one is just you arriving late, and must not stretch anything). A hand-typed value is never overwritten.
  It wants the map's pins for camps and the mob knowledge store for the numbers, both of which exist —
  which is why this is a todo and not an idea. Needs an ADR for the learning rule before the UI.
  EQBuddy's three files are worth reading together first: `SpawnTimers.cs`, `SpawnCatalog.cs` (the
  shipped seed) and `SpawnOverrides.cs` (what a player typed, which nothing may overwrite).

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

- **The game's own data files are a source we don't read.** Nothing in the tree touches `spells_us.txt`,
  `spells_us_str.txt` or `dbstr_us.txt`, and each answers a question we've already written down as
  unanswerable. The first is the prize: [cast-alerts.ts](../src/shared/cast-alerts.ts) records as an
  honest limit that *"a fade **on you** is always worded per spell ('The light breeze fades.') and names
  no spell... so a watch for one has to hold the words the log used"* — and `spells_us_str.txt` **is**
  the table mapping those sentences back to their spell. The limit is a missing input, not a property of
  the log. EQBuddy hand-maintains the same map in `src/EQBuddy.Core/FadeMessageCatalog.cs`, whose doc
  comment is worth reading before we start: it records that one wear-off line often belongs to *several*
  spells (every haste in the game shares one sentence), so entries need a candidate list and a display
  label rather than a single answer — and that some spells fade silently, for which it says a delay-cue
  rule is the honest tool, which is the alert-scheduling item above. We can derive what they typed.
  `spells_us.txt` then carries mana cost, cast/recast, buff duration and per-class levels, which retires
  the wiki-lookup plan (and its rank wrinkle) under *Damage per mana* in [ideas.md](./ideas.md) and is
  what any buff-timer would need.

  The format is documented rather than guessed, by
  [Amerzel/eql-info](https://github.com/Amerzel/eql-info) — a Flask spell browser whose `SPELL_FORMAT.md`
  derives the layout by statistically diffing EQL's file against Live EverQuest's (which is publicly
  documented) and the older EQEmu 237-field reference. What it establishes, and what we'd rely on:
  **EQL's format is Live's format** — 171 caret-delimited columns, of which `[0..164]` are bitwise
  identical to Live's for 99%+ of shared spells, with five EQL-specific columns appended at 165–169
  (four are reserved sentinels) and the pipe-delimited effects blob last. The columns we'd want are all
  early and stable: `mana` at 14, `cast_time` at 8, `recast_time` at 10, `buff_duration_formula`/
  `buff_duration` at 11/12, and `classes[16]` at 36–51 (per-class minimum level, `255` = unavailable).
  Two cautions carried from the source: EQL **inserts** columns by patch (a 2026-06-29 patch added one
  at index 103 and shifted everything after), so the effects blob must be located **by content, not
  index**, and anything derived from the effect formulas is EQEmu's *classic-era* reference math rather
  than EQL's server code — an estimate that must be labelled one. Also note the file ships L1–125 while
  the server is L1–50, so ~74k spells need gating down to what's obtainable; eql-info maintains
  hand-verified per-class lists for exactly that.

  Care: these are the player's own installed files, read-only, and we already know where the install is
  (we read `maps/` from it). Nothing ships; the parse degrades to blank facts when a file is absent,
  the way the map degrades when a pack is.

- **A Project Quarm baseline, as a seed layer under our own observations.** The spawn-timer item above
  says "seeded by the wiki's figure where it has one", and the wiki often hasn't. eql-log-reader ships a
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
  [ADR 0049 was retired](./decisions/0062-a-travel-graph-of-zone-lines.md) for and what
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

- **Generated datasets should carry a provenance manifest, and could come from the client.** The MCP
  server extracts its reference data straight from the game install (`scripts/extract-eql-reference.mjs`,
  written up in `docs/local-client-extraction.md`) and ships a manifest beside it —
  `src/data/eql-client/manifest.json`, listing every source file with **bytes, mtime and sha256**, plus
  an `extractedAt` and an `extractorVersion`.
  Ours don't. [wiki/index.ts](../electron/wiki/index.ts)'s `CACHE_VERSION` + `fetchedAt` is the same
  instinct at *page* granularity, but our generated artefacts — the zone gazetteer, the travel graph,
  the zone-expansion table — record nothing about what built them or when, which is what makes a stale
  one mysterious rather than diagnosable. Cheap, and it pairs with the scripts already in `scripts/`.

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

Three of the six are **done** and have left this list: the named-pet proof and the bystander rule
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
  where a shared-emote watch fires. It is also **the same machinery as the delayed-alerts item above**
  — a thing that happened, remembered briefly, acted on when a second thing does or doesn't follow —
  so the two want designing together rather than twice.

  Note the honest edge eql-alerts also documents: some upgrade ranks still share one emote line
  (their example is Dazzle upgrading the generic mesmerize sentence), so the gate identifies *whose*
  spell it was, not always *which*.

- **Many classic buffs are permanent on Legends, and there's a list.** Recorded now so it is found
  before, not after, anything ships a duration. Classic-EQ durations are simply wrong for a large set
  of self-buffs that EQL made `Duration: Permanent` — Yaulp I–III (but **not** IV, which stays four
  ticks), Divine Might, Divine Purpose, Lich, Elemental Armor, Greater Wolf Form, Grim Aura, Deadeye,
  Firefist, every Shielding tier. eql-alerts ships the list as `samples/eql_permanent_buffs.json` and
  both strips their countdowns **and** silences their cast alerts, because a toast for a buff that
  never ends is pure noise.

  This bites us in two places, one of them already on this page: any buff timer we build, and the
  **spoken/delayed alert** items above, where a "recast it" cue for a permanent buff is worse than
  useless. It costs nothing to carry the list; it costs a bug report to discover it. Files under the
  same heading as the wider trap — *EQL is not classic EQ* — which the whole of
  [neighbours.md](./neighbours.md) is a standing reminder of.

- **The rank is already parsed; nothing scales anything by it.** [ideas.md](./ideas.md)'s *Damage per
  mana* says "the rank needs carrying alongside the canonical name (it's still in `raw`)" — that note
  is **stale**. `spellRank()` in [combat-parser.ts](../src/shared/combat-parser.ts) already extracts the
  trailing roman numeral and the cast event already carries it, precisely so `spellName()` can strip it
  and make the cast and damage lines agree. So the carrying is done; what's missing is a consumer.

  eql-alerts is the worked example of what a consumer looks like: store the **unranked** figure from
  the wiki as the base, then scale it by the roman rank at cast time (~7% per tier in their engine).
  That turns one wiki number into a whole spell line's worth of correct ones, which matters because the
  wiki documents ranks unevenly. The same trick applies to any per-rank quantity — duration first, mana
  cost second (which is the ideas.md item, now unblocked). Worth fixing the ideas.md note in the same
  change, so the next reader isn't told to build something that exists.

