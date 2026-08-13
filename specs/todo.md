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
