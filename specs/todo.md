# Todo

Open work only. Delete an item when it's done and record the outcome where it belongs (ADR, README,
or code). Features that are **built but await a real run** (in-game, packaged, or two clients) live
in the **[manual QA checklist](./testing/manual-qa.md)**, not here.

_Distribution wiring:_

- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download → `/releases/latest`,
  Launch → `eqlist://open`) and the Download target is populated by CI. Remaining: **host** the static
  page somewhere (e.g. GitHub Pages). Optional: point Download straight at
  `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown publisher".
  Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

_Ready to build (decided, not started):_

- **Damage per mana.** eqlwiki states a spell's mana cost — verified, `Mana 7` in
  `fixtures/wiki/spell-burst-of-fire.html` — so this is a wiki lookup, not OCR. One
  wrinkle: cost is per *rank*, and `spellName()` strips the rank to make cast and damage
  lines agree, so the rank needs carrying alongside the canonical name (it's still in `raw`).
_Next up:_

- **Three expansion pages the zone table can't read.** `scripts/fetch-zone-expansions.mjs` gets 22 of 25
  expansions; **Omens of War**, **Ring of Scale** and **The Darkened Sea** write their zone lists in a
  shape neither of the two it handles matches, so it skips them and says so
  ([ADR 0065](./decisions/0065-a-zone-belongs-to-an-expansion.md)). Their zones therefore aren't excluded:
  they'll be offered in the picker and, being their own continents, sit as isolated zones rather than
  corrupting a route. Worth a look at those three pages' wikitext — it may be one more row separator.

- **Travel: ask from the other windows too.** The 🧭 panel ships in the map window
  ([ADR 0062](./decisions/0062-a-travel-graph-of-zone-lines.md), [travel](./travel/README.md)), and
  `api().travel.route` is available to any of them. The two that would want it: the **Hunt tab**, which
  already points at zones you'd travel to ("how far is that camp?"), and an **item's drop zones**, where
  "who drops this, and where" stops short of "and how do I get there". Both are a call and a line of
  UI; the question is where a distance belongs without turning a list into a route planner.
- **Travel: the graph doesn't honour `STOCK_ONLY_ZONES`.** The map draws a pinned zone from the game's
  own files, but `buildFromSource` harvests exit labels per source, so the graph reads that zone's
  labels from the *chosen pack's* file — the two can disagree about a zone we've deliberately said the
  pack gets wrong. Same plumbing as the borrowing item below (a harvest has to read each borrowed or
  pinned zone from its own folder), so worth doing in one go.
- **Travel: a graph could borrow a zone the pack lacks, the way the map now does.**
  [ADR 0063](./decisions/0063-a-zone-the-pack-lacks-is-borrowed.md) made the zone *list* fall back to the
  game's own maps for a zone the chosen pack has no file for; `travel-graph.ts` still builds strictly per
  source (`zonesFromFiles`, one folder). So a zone only the backstop covers is a hole in the graph — and
  worse than a hole, since its neighbours' `to <zone>` labels then resolve to nothing and show up as
  unresolved destinations. `zonesFromSources` is the shape to reuse; the wrinkle is that harvesting has
  to read each borrowed zone's labels from *its own* folder.
- **Travel: verify the hand-authored table in game.** `manual-links.ts` ships classic-EverQuest boat
  runs as a starting point, unverified on EQ Legends, and **no translocator gnomes at all** — nothing
  about a Legends-only NPC can be read off a map or reasonably guessed, so that section is empty on
  purpose (with both shapes to copy from in a comment: a border if anyone can walk up to it, a
  `gnome`-mode link if it needs a class, a faction or a fee). `npm run travel:manual` prints which
  entries found a real label, which named a zone this pack has no map for, and which are malformed —
  that's the list to work through. The same run also prints the destinations no map file answered to and
  the zones with no way in or out, which is where the graph is actually thin.
- **`poiKind` reads `Druid Rings` as a plain name.** Its transport vocabulary spells the ring singular
  (`\bdruid ring\b` can't reach the plural), so those markers are filed under "Names & places" in the
  map's own label filter instead of "Ports & boats". The travel graph re-reads its fallback kinds to get
  around it; the filter still shows them in the wrong section. One character in the regex, but it's a
  pinned black box with a corpus tally behind it
  ([ADR 0048](./decisions/0048-a-map-label-is-read-by-its-words.md)) — worth re-tallying rather than
  patching blind.

- **Share item prices with peers.** Coin per mob now pools like a drop rate, but a vendor
  price doesn't — it's derived from your own auto-sells
  ([ADR 0047](./decisions/0047-money-is-copper-in-two-ledgers.md)). A price is the *easiest*
  thing to pool (it's identical for everyone, so one observation settles it) and would fill in
  the trash you've never happened to auto-sell. Needs a place in the observation payload.
- **Mark undocumented drops in the mob panel too.** The Hunt tab now reconciles wiki claims
  against your kills ([ADR 0025](./decisions/0025-observation-over-the-wiki.md)); the 📖 panel
  shows observed rates but doesn't yet say which of them the wiki has never heard of. Same
  module, one more lookup.
- **A "what this build changed" list.** Undocumented drops are the app discovering things no
  reference knows. Pooled across the room that's a genuinely new dataset — worth surfacing
  somewhere deliberate rather than only per mob.

_To discuss:_

- **OCR beyond item lookup — mostly settled.** Ruled out for the **experience bar** (the
  log's gains plus a level-up baseline already solve it exactly, see
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md)) and for **mana
  cost** (the wiki has it, above). **Health** is now *inferred* from what you survive and
  what kills you ([ADR 0018](./decisions/0018-inferred-max-hit-points.md)), so the only
  remaining prize is a live health *trace* rather than a maximum — worth deciding whether
  that's wanted, given it needs a user-calibrated screen region per UI layout, is fragile
  across resolutions and UI mods, may capture nothing in exclusive fullscreen, and a
  confidently wrong reading is worse than a blank.
- **Ask-the-user, applied elsewhere.** `AskValue` +
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md) established the
  pattern (hover for why, click to fill in) and it now backs two figures: experience into
  the level, and maximum health. Worth a look for other gaps — resist rate targets? gear
  goals? — rather than inventing new one-off inputs.
- **Kill heatmap — what's left.** Recording, the confidence marker, the filtered map layer, the
  kill list and peer sharing all ship ([ADR 0023](./decisions/0023-kill-heatmap.md)). Remaining:
  - **The `/loc` nag.** This is the load-bearing piece: a real 13,000-line log yielded 323
    kills and **six** positions worth believing, because `/loc` was typed nine times across
    several evenings. Ask for one when the camp looks to have changed (the `AskValue` pattern
    fits), and the map fills in.
  - **Retro-scoring.** Confidence is fixed when the kill is recorded, but the evidence is
    stored — a later `/loc` close to the earlier one could raise confidence for the kills in
    between, which is exactly the "they can only go so far so fast" argument.
  - **Spawn points, not just roam areas.** A roam area is the centroid and spread of where a
    mob died. With enough fixes, clusters would separate individual spawn points from a
    wandering path — the data is already stored, this is an analysis question.
  - **Group-mates' kills.** A group-mate's killing blow is indistinguishable from a stranger's
    in the log, so those kills only count towards a drop rate once you loot the corpse
    ([ADR 0027](./decisions/0027-only-your-kills-count.md)). Telling them apart means asking
    who was damaging the mob, which the kill log can't see — the damage tracker can. Worth
    doing if grouping turns out to be common; it needs the two to talk.
  - **Items per kill, alongside the drop chance.** `drops` counts kills that produced an item,
    which is the right numerator for a probability but throws away the stack size — a line
    saying "You looted 2 Spiderling Eye" counts once. For a stackable trash drop the useful
    figure is items-per-kill. It's a second number, not a correction, and it changes the shared
    observation shape, so it wants deciding rather than sneaking in.
- **Setting: split the meter by mode by default.** The per-stance / per-invocation data is
  already tracked and shown on hover
  ([ADR 0020](./decisions/0020-split-by-stance-and-invocation.md)). Some players will want
  those as real rows all the time — a Settings toggle, no new data needed.
- **Loot tab — an ignore list, and highlighting worth the name.** The split views, filters and
  sortable columns now ship ([ADR 0058](./decisions/0058-a-ledger-needs-filters-and-a-column-to-sort-by.md)),
  and the only highlight rule is still "on your shopping list". Two things left, both now filter
  questions rather than new mechanisms: an **ignore list** (trash you never want to see again —
  persisted, unlike the per-window filters), and the broader rule **"used by a quest in my level
  range in this zone"**, which needs the wiki's quest data per item and a level to compare against.

- Damage history tab should have a search box for reducing the number of records shown to just those that include the searched term
  - Search field should focus on mob name and zone  
- DoT damage is not being counted correctly. It hits way more than is being parsed from the logs. 
  - There is an initial cast + damage logged and then every damage tic should be added to that spell's damage. 
    - Tic damage should be shown as a spell total and with an expandable section showing damage stats, like how many times it ticed, or resisted etc