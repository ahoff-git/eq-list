# Todo

**Open work only** — a bug, or a decided change someone means to make. Delete an item when it's done
and record the outcome where it belongs (an ADR, a README, or the code). Keep each item to a few
lines; the reasoning lives in the ADR it links. Everything else has a neighbour:

- [ideas.md](./ideas.md) — features worth building that nothing is waiting on.
- [decisions/README.md](./decisions/README.md) `## Open Questions` — anything that needs *deciding*
  first.
- [testing/manual-qa.md](./testing/manual-qa.md) — built, typechecked and tested, but never yet run
  for real (in-game, packaged, or across two clients).

## Bugs

- **A group-mate killed by a named lands on the spawn board as a named.** `provenNamed` only learns
  someone is a person when they kill an article mob, so `Bunnyslayer` (slain by Lord Nagafen) passes
  as a named. Likely tell: the killer is a known named (article proof, or a rare tag per
  [ADR 0324](./decisions/0324-the-game-saying-rare-is-proof.md)), and a named killing something is a
  player or pet dying.
- **Respawn learning reads only your last 200 kills.** `spawn-tracker.ts` calls unscoped
  `killLog.kills()`, capped by [ADR 0243](./decisions/0243-remove-the-remaining-storage-caps.md). A full
  read is ~40ms per kill at 10k kills, so it wants a cached read keyed on `killLog.version()`.
- **"West Cabilis" and "East Cabilis" don't resolve to Cabilis**, so a Cabilis merchant reads as
  open while Kunark is shut (item "How to get it", Tradeskills hover). Probably one alias in the zone
  resolver every era check shares — look at what else it would fold.
- **`poiKind` files `Druid Rings` under "Names & places".** `\bdruid ring\b` misses the plural. Pinned
  black box with a corpus tally ([ADR 0048](./decisions/0048-a-map-label-is-read-by-its-words.md)), so
  re-tally rather than patch.
- **A stale `out/` looks exactly like a broken feature.** `npm run app` rebuilds only a *missing*
  build, so an old renderer can pair with a new main process. Stamp both halves with one version, or
  have `launch.mjs` compare mtimes against `src/`.
- **ADR 0280 says the MCP server registers seven tools; it registers nine** (`item_facet_options`,
  `list_spell_classes` came later). Record the drift the next time that area is touched.

## Maps, zones and travel

- **Three expansion pages the zone table can't read**: Omens of War, Ring of Scale, The Darkened Sea
  (`scripts/fetch-zone-expansions.mjs`, [ADR 0065](./decisions/0065-a-zone-belongs-to-an-expansion.md)).
  Their wikitext may need one more row separator.
- **The travel graph reads each zone from the chosen pack only.** It ignores `STOCK_ONLY_ZONES` and
  can't borrow a zone the pack lacks the way the map does
  ([ADR 0063](./decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)). One fix for both: harvest each
  pinned or borrowed zone's labels from its own folder (`zonesFromSources` is the shape).
- **102 borders are still one-sided**, each a `2000?` stand-in on a route. Each is one
  `manual-links.ts` entry read off the map. Start with East Freeport ↔ West Freeport.
- **Second drawings of a zone still slip through.** Re-run the duplicate-drawing audit against the
  pack's whole file list ([ADR 0111](./decisions/0111-one-zone-one-map-file.md)); West Freeport's
  borders to *The Commonlands* and *Oldcommons* are the clearest leftover.
- **Five ring/spire files resolve to no zone**: `commonlands`, `lavastorm_original`,
  `nektulos_1_original`, `eastkorlach`, `frontiermtnsb`. The first three look like `STALE_DRAWINGS`
  cases; check against the game's own map file as [ADR 0174](./decisions/0174-the-era-decides-which-drawing-is-the-zone.md) did.
- **A mob with several camps still gets one map pin.** `MobKnowledge.tsx`'s ± and `huntPins()` pin
  only the best-supported place ([ADR 0228](./decisions/0228-a-mob-can-have-more-than-one-known-location.md)).
  `LOCATION_CLUSTER_UNITS` (600) is also an unmeasured global guess.

## Features

- **Fight trends suggest what to do.** Turn [ADR 0344](./decisions/0344-fight-search-finds-combatants-and-reads-trends.md)'s
  tips into advice: fire resist against a fire-heavy mob, AC against crushing melee, another spell
  against a resist wall.
- **One achievements view.** Show the game's achievements dump beside the app's tracked ones
  ([ADR 0212](./decisions/0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md)), and
  tick an app achievement when the export says it's done.
- **The shopping list counts what you hold.** Use the inventory dump plus loot and sells since it, as
  EQBuddy's `SinceDump` does (`src/EQBuddy.Core/InventoryFile.cs`).
- **An alert can be spoken.** A per-watch `speechSynthesis` toggle, independent of the beep, speaking
  the watch's `message`, with duplicate suppression (EQBuddy).
- **Gate a shared emote on your own cast.** Arm a zone-visible land emote only after your own `You
  begin casting <spell>`, in a short-lived pending-cast map (`alert-queue.ts` is the neighbour), and
  withdraw it on a fizzle or a kill of a same-named mob (eql-alerts v0.1.29). The cast also tells which
  rank landed. The Burnout pet decider below rides on the same map.
- **Committed datasets say what built them.** The travel graph, zone table and gazetteer get a
  manifest of their sources (bytes, mtime, sha256, extractor version), so `data-health.ts` can compute
  staleness ([ADR 0096](./decisions/0096-stored-data-says-which-rules-wrote-it.md) did the `userData`
  half). everquest-legends-mcp's `manifest.json` is the shape, and its `zones.json` could cover the
  three unreadable expansion pages.
- **Data-integrity tests over committed artefacts.** Every travel edge resolves to a known zone,
  every gazetteer zone has a map, every expansion has a zone, keys agree across tables. Write down
  the harvest scripts' merge precedence while there.

## Blocked on evidence

- **A consider's level.** The model exists ([ADR 0121](./decisions/0121-a-mob-is-a-range-of-levels.md));
  it needs one real consider line from a log to see where the level is written.
- **Three pet/group-mate deciders from eql-meter v0.1.28** (`My leader is <Player>.`, `I am unable to
  wake <mob>, Master.`, `Burnout` → `goes berserk.`). `fixtures/` has no instance of any of them, so
  their counts and false-positive rates ([ADR 0127](./decisions/0127-an-unknown-name-is-held-not-dropped.md))
  are the gate on adopting them.

## Performance

- **The zone list pays ~110ms of Levenshtein once per process**, from `zoneAvailable` falling through
  to `fuzzy` for ~250 names the expansion table never heard of, where that tier matches nothing. Skip
  it for a bulk check, or add an admissible prune inside `fuzzy.ts`.
- **A page write drops the whole pack**, so the catalogue rebuilds on next use. Re-measure against
  the SQLite store ([ADR 0256](./decisions/0256-the-wiki-page-cache-moves-onto-sqlite.md)), then patch
  that page's rows as the shard index does.
