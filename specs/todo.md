# Todo

Open work only. Delete an item when it's done and record the outcome where it belongs (ADR, README,
or code). Features that are **built but await a real run** (in-game, packaged, or two clients) live
in the **[manual QA checklist](./testing/manual-qa.md)**, not here.

_Zones:_

- **Calibrate the five bundled-but-uncalibrated maps.** RunnyEye Citadel's four floors and
  Northern Desert of Ro ship with images and **no calibration** — what they used to carry was
  their image's own pixel dimensions, which plotted your dot at a fictitious spot
  ([ADR 0038](./decisions/0038-a-map-has-a-scale-and-a-centre.md)). Each now needs one real
  visit: 📐, `/loc`, click where you are, walk somewhere far, `/loc`, click again. Two clicks
  per floor, and the values get pasted into `zones.ts`.
- **Add maps for the zones actually being played.** A real log showed visits to East Commonlands,
  The Estate of Unrest, New Sebilis Expedition and the EQL Tutorial — none of which have a bundled
  map, so the map window falls back to the P99 link. Each needs an image plus calibration (📐),
  see [map](./map/README.md).

_Distribution wiring:_

- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download → `/releases/latest`,
  Launch → `eqlist://open`) and the Download target is populated by CI. Remaining: **host** the static
  page somewhere (e.g. GitHub Pages). Optional: point Download straight at
  `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown publisher".
  Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

_Ready to build (decided, not started):_

- **Count the coin.** 248 lines of "You receive 3 silver and 2 copper from the corpse." (and
  "…from that item" on an auto-sell) go unparsed, so the camp report can't answer what a camp
  is worth per hour in money — which is half of "is this camp worth it". The loot parser
  already handles the auto-sell *item* line; this is the coin beside it. Needs a small money
  type (platinum/gold/silver/copper) rather than a bare number.
- **Damage per mana.** eqlwiki states a spell's mana cost — verified, `Mana 7` in
  `fixtures/wiki/spell-burst-of-fire.html` — so this is a wiki lookup, not OCR. One
  wrinkle: cost is per *rank*, and `spellName()` strips the rank to make cast and damage
  lines agree, so the rank needs carrying alongside the canonical name (it's still in `raw`).
- **Fold `session-stats.ts` into `combat-stats.ts`.** Two main-process modules watch the
  log and count experience and kills; the combat tracker needs about five lines (gain
  count, solo/party split) to be a strict superset. Retires a module and its test, fixes
  the Session tab counting the pet's own death as a kill, and removes the split that
  already caused one bug — two "reset" buttons that meant different things, now papered
  over by `resetSession()`.

_Next up:_

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
- **Loot tab — filters and highlighting.** The panel and an always-on, persisted loot feed now
  ship (`electron/loot-log.ts`, `LootPanel`; [ADR 0033](./decisions/0033-eating-a-log-is-idempotent.md)
  is unrelated — this is the live feed), showing the latest drops and each one's fate (kept / bag /
  depot / auto-sold). **Highlighting is wanted** but needs **filters** and an **ignore list** to be
  usable: the first cut highlights what's on your shopping list (free, already known), and the
  broader rule ("used by a quest in my level range in this zone") comes with the filters.

_Recently settled (kept only as pointers):_

- Need to keep Awari up to date. We are 2 releases behind currently
  - Should use the optional google handshake stuff. peerjs servers are iffy


- **A 'custom' alert location you place with the mouse.** The one alert item still open: stick the
  banner to the cursor, click to drop it, name that spot, then pick it per alert (the per-alert
  style plumbing is already there — it'd be another `AlertStyle` field plus a named-location list).
  The work is in the overlay window: it's click-through and never focused
  ([ADR 0035](./decisions/0035-cast-alert-overlay-window.md)), so placement means temporarily
  making it interactive and focusable, then handing the dropped point back.

- Player pings are currently light yellow and are very hard to see. Either add a thin dark outline or change the color.

- **Name the zones we could only name by their file.** 133 game maps resolve to 14 real zone
  names; the rest show as `gukbottom`. Deliberate — a wrong name plots kills in the wrong
  place — but the alias table in `map-sources.ts` is where they get filled in, a few at a time
  as zones are actually visited.


- Fix the zone names. Go research all the zones and show more normal names when possible. 
  - update the zone picker to be a combo dropdown that you can type in, and narrow the selection options to only zones that match a reasonable  lavenstein distance 