# Map

## Purpose
Show the current zone's map with the player's live location (and a short movement
trail) plotted on it, in a sibling window opened from the main window's 🗺 button.

Every map is one of **the game's own map files** — the `.txt` vector maps EverQuest itself draws,
from the player's install. There are no bundled images and nothing to calibrate: the geometry is
world coordinates, so a map knows where it is. See
[ADR 0039](../decisions/0039-render-the-game-s-own-maps.md) for adopting them and
[ADR 0042](../decisions/0042-only-the-game-s-own-maps.md) for dropping the scans.

## Responsibilities
- **Geometry core** (`src/shared/map/`, ported from the eq-map project — see
  [ADR 0010](../decisions/0010-ported-map-core.md)), pure and DOM-free so it's unit
  tested (`electron/tests/map-coords.test.ts`):
  - `types.ts` — `Loc {y,x}` (EQ order), `Point {x,y}`, `CanvasSize`, `MapRect`, `MapView`,
    `MapProjection` (`scale` + `center`, **read off a map, never authored**), and `Zone`, which is
    now just a name and the map file behind it.
  - `coords.ts` — `fitRect` (where the map lands on the canvas — the one definition the drawing and
    the maths share), `eqToCanvasCoords` / `canvasToEqCoords`, exact inverses that take a projection
    and return `undefined` without one, and `clampPan` (a zoomed map can't be dragged off into blank
    space). Math derived in [data-model.md](./data-model.md).
  - `zones.ts` — `CURATED_ZONES` (re-exported from `zones/gazetteer.ts`, which owns every name we can
    state and which file it belongs to — see **Zone names**),
    `findZone` (the log's wording resolves through `resolveZone` — case, a leading "the", the
    apostrophe the maps and the log write differently, a difficulty number and the ruleset tag beside
    it ("The Steamfont Mountains 2 (Adaptive)") all wash out and a harder zone still gets its map,
    see [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md) — plus **word order**, so "The
    Castle of Mistmoore" finds "Mistmoore Castle", and **one letter**, so a pack's "Toxulia Forest"
    draws the log's "Toxxulia Forest"
    ([ADR 0075](../decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)). It takes only the tiers
    that cannot pick a *different* zone: a wrong file draws one under the right name, so no map beats
    the wrong map, see
    [ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)), and — when the pack's
    own labels match nothing — **the gazetteer's own name → file mapping**, so a file this pack
    labelled something else is still reachable by the name the log uses
    ([ADR 0139](../decisions/0139-a-difficulty-can-never-cost-a-map.md)); `mapZoneName`
    (see **One name per map reference**), `sortZones`,
    and `onLayer` for floor-scoped markers (against the *set* of floors in view).
- **Drawing** (`src/lib/map/draw.ts`, renderer-only — uses canvas): `drawLine`, `drawCircle`,
  `clearCanvas`. Geometry itself is drawn by `MapPanel` onto the static lower canvas, batched into
  one `Path2D` per colour (the biggest zones carry 20k segments) with hairline strokes that survive
  zoom. A segment whose file colour is pure black gets the panel's default line colour — black meant
  "no colour given", and a black line on a dark panel is no map at all. Points of interest are drawn
  on the *overlay* canvas instead, so their labels stay a constant size as you zoom, like every other
  marker and like the game's own map.
- **Location feed** — a `/loc` line (`Your Location is Y, X, Z`) becomes a `LocEvent`
  via `parseLocLine` (`src/shared/log-parser.ts`) and flows through the same
  main→IPC→renderer pipeline as the `zone` event (`watcher.onLoc` → `currentLoc` →
  `CH.locChanged` broadcast → `usePlayerLoc` / `usePlayerTrail`). The **trail** (the line
  between logged positions) is owned by the map window so the toolbar's **∿** button can
  clear it; it also clears itself when you zone, since a `LocEvent` carries no zone and
  the old path would otherwise be drawn across the new map. **So does your position**:
  `main.ts` drops `currentLoc` and broadcasts `null` on a zone change, so the dot goes rather than
  standing at the last zone's coordinates on this zone's map
  ([ADR 0060](../decisions/0060-a-position-belongs-to-the-zone-it-was-taken-in.md)). Everything
  that reads a `/loc` now agrees a position expires at the zone line — including the kill log,
  whose fixes must match the kill's zone *verbatim*, unknown zone included.
- **UI** — `MapPanel` (`src/app/components/MapPanel.tsx`) stacks two canvases (static map + moving
  overlay) **filling the window**, sized by a `ResizeObserver`. They were square, which threw away
  the difference between the window's width and its height — on a wide window, most of the screen.
  `fitRect` still letterboxes a map whose shape differs from the canvas's, but that's now a gap you
  can zoom into rather than dead canvas, because **`clampPan` bounds panning by the map as drawn
  rather than by the canvas**: once the map covers an axis, its letterbox bar is unreachable. Per
  axis and independently, since a map can be letterboxed on one and not the other. A **zoom/
  pan view** (scroll wheel zooms toward the cursor; **drag to pan** once zoomed in) is layered on
  top of the pure coord math and inverted for the cursor→EQ
  **readout** and hit-testing. `clampPan` keeps the map covering the canvas, so it can't be
  dragged off into blank space, and there's nothing to pan at fit. Panning shares the left
  button with pinging, so **a press that travels more than `DRAG_SLOP` becomes a drag and
  the click it ends with is swallowed** — otherwise looking around the map would ping the
  room on every glance. That's the drag *attempt*, not a successful pan: at fit zoom there's
  nowhere to go, and a drag that visibly did nothing must still not ping. Move mode's pin drag
  wins over panning, which is its whole job.

  **Everything drawn names itself on hover** (`src/shared/map/hit-test.ts`, pure and tested): a
  kill says which mob, when, what dropped and *how much to believe its position* (the tier's own
  wording, since that's the one thing a dot can't show — see
  [ADR 0023](../decisions/0023-kill-heatmap.md)); a peer says who they are; a ping says who pinged;
  the player dot says its coordinates; a map label says its full text and which kind it is. One
  target list and one hit-test, so there's no branch per marker kind.

  Overlaps are the interesting part, and why the pick is a tested function rather than inline: a
  crowded camp can have a pin, a kill and a zone label within a few pixels. Nearest wins, with a
  small `priority` nudge settling near-ties — what you placed yourself outranks what the log
  inferred, which outranks the map's own labels — and each kind carries its own radius, since a pin
  is a thing you aim at while a kill dot is one of hundreds. **Clicking a kill** opens the ☠ list
  filtered to that mob, which narrows the heatmap to it as well (one filter drives both), and
  clicking a marker never falls through to a ping.

  The zoom ceiling depends on what's drawn: an image runs out of pixels (`IMAGE_MAX_ZOOM`, 6×),
  while the game's own maps are lines and stay sharp, so they go to `VECTOR_MAX_ZOOM` (30×) —
  which a dungeon corridor needs.
  The map **window** (`src/app/map/page.tsx`, route `/map`) follows the current zone by
  default with a dropdown to view any mapped zone (and `map.openAt(zone)` / the
  `mapViewZone` event let a clickable location elsewhere point it at a zone — with a
  coordinate it also drops a marker pin there, and with a `MapFocus` it opens the 📖 panel
  narrowed to the mob and drop that coordinate came from and rings that mob's kills, so a
  star arrives with the evidence behind it,
  [ADR 0104](../decisions/0104-a-position-is-read-and-arrives-with-its-evidence.md)); created on
  demand by `createMapWindow`. A hand-picked zone is an **override** that persists —
  but only until the log says you actually **changed place**, which clears it so the map goes
  back to following you (otherwise one dropdown pick silently stops it forever). Re-entering the same
  zone at another difficulty is not that: it is the same map, so it leaves your override alone
  ([ADR 0134](../decisions/0134-a-map-reference-resolves-to-a-place.md)). The
  **follow** checkbox beside the dropdown governs that, on by default; turn it off to
  keep studying one map while you travel. The
  title bar carries its own **A− / A+** (`overlay.mapFontScale`, a *separate* value from the main
  window's and one that may go **above 100%** — `MAP_UI_SCALE`, since a map is a picture you lean
  into rather than an overlay to shrink; see
  [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md)) — the map's **pin, ◐ and
  👻 are its own**, remembered against this window beside its bounds and restored when it reopens
  ([ADR 0074](../decisions/0074-how-a-window-was-left-is-window-state.md)), which is what ended the map
  opening pinned according to the *main* window's setting — its own **◐ opacity**
  toggle (the shared `OpacityButton`. The saved opacity is the app-wide `overlay.opacity`, but the
  flip-to-solid is *this window's* — a map you're leaning into wants clear glass without the list
  going solid with it), a **👻 click-through** toggle (`ClickThroughButton` + `useClickThrough`,
  per window for the same reason the ◐ is) that hands clicks landing **on the map
  itself** to the game while the title bar, toolbar and any open side panel stay clickable — so you
  can fight through the map instead of moving it, at the cost of not being able to pan, zoom, ping or
  drop a pin until you turn it off; see
  [ADR 0073](../decisions/0073-a-click-through-window-keeps-its-chrome.md) — **minimize**,
  **maximize/restore**, a **pin** (this window's own always-on-top, via the shared `PinButton`) and a
  **⌂ floors** button saying how many storeys are drawn, which opens the 👁 panel to change it (only
  when the map labels more than one — see **Floors and heights**). A zone with
  **no map file** shows a clear empty panel: it names the zone, says which map set was looked in,
  notes that saved markers appear once it's mapped, and offers a **View on Project 1999** button
  (`map.openP99` → the zone's P99 map page in the browser) — the one place a scan is still useful,
  now that we don't ship any.
- **Sources** (`src/shared/map/map-sources.ts` + `electron/eq-maps.ts` + the titlebar's
  leftmost dropdown, hover it for the folder layout) — where maps come from. With no maps folder
  found there are **no sources**, and the window says so: there's no bundled fallback to hide behind.
  - **Game maps** — `<EverQuest>/maps/`, the ones the game ships with. Found from the log folder in
    Settings (`<EQ>/Logs`), so there's nothing extra to configure. 133 zones on the EQL install,
    including its custom ones.
  - **A pack** — any subfolder of `maps/` holding `.txt` files, discovered not hardcoded:
    unzip Brewall's into `maps/Brewall/` (568 zones, the most labels) or Goodurden's into its
    own subfolder and it shows up in the dropdown. The selection persists.

  Every source yields a `Zone[]`, so the picker, `findZone`, pins, kills and layers all work
  against one shape.

  **A zone the chosen pack hasn't got is borrowed from the game's own maps**
  ([ADR 0063](../decisions/0063-a-zone-the-pack-lacks-is-borrowed.md), `zonesFromSources`). Packs
  differ in coverage, not only detail: the game's maps ship no Blackburrow or Unrest, Brewall's ships
  no New Sebilis Expedition (an EQL zone), and on a real log that was 237 kills with no map on one
  side and 286 on the other. Each `Zone` carries the `source` that will draw it and is loaded from
  *there*; the backstop is specifically the game's `maps/`, the one folder every install has, so the
  rule is the same on every machine. Still one file per zone, still named by the folder it came from
  (0061), the pack still winning wherever both have something — and the titlebar says **· from Game
  maps** when a map was borrowed, because a map that looks unlike the rest shouldn't be a mystery.
- **Zone names** (`src/shared/map/zone-names.ts`, pure — `electron/tests/zone-names.test.ts`) —
  files are named for a zone's *short* name (`gfaydark`) and nothing in them says the long one, but
  **the packs label their exits**, so every `to The Lesser Faydark` marker names a real zone and the
  corpus is its own gazetteer — in the server's own wording, not a table typed from memory.

  Matching a harvested name to a file needs **two independent signals**, because either alone is
  confidently wrong. Spelling (`gfaydark` sits inside `greaterfaydark`) offers `sebilis` "Western
  Cabilis" and `grobb` "The Gorge of King Xorbb". **Adjacency** is the check: if this file is zone X,
  the maps that link *to* X should be zones it links back to — which refuses those two, and rescues
  `gfaydark` (spelling score 51) and `commons` → "West Commonlands" (which loses on spelling to "The
  Commonlands"). Assignment is then global, one name to one file, so the right claimant takes a name
  out from under a wrong one.

  Naming is **per pack, from that pack's own labels** — a pack is a survey, not a contribution to a
  shared one, and pooling let one folder's file take a name out from under another's
  ([ADR 0061](../decisions/0061-a-map-pack-names-its-own-zones.md)). On a real install that cost
  Brewall eight zone names its labels state outright (Unrest, Sebilis, Dalnir, Kurn's Tower, the City
  of Mist, the Akheva Ruins, Trakanon's Teeth, Neriak Commons) and rewrote seven more. The price is
  that the game's own maps, which label few exits, name 54 of 133 files rather than borrowing their
  way to more; the catalogue covers the zones that matter and the rest show their file name.

  Naming a folder is **paid once and remembered** in `userData/map-zone-names.json`, against a
  signature of the folder's file count, total bytes and newest mtime
  ([ADR 0072](../decisions/0072-a-folder-of-maps-is-named-once-and-remembered.md)). It reads every map
  in the folder — 199 MB across 1,321 files for a real install's two sources — and it used to do that
  on every launch, synchronously, the moment the map window mounted: about a second of frozen app and
  a disk storm to go with it. A first run after installing a pack still pays it, now a few files at a
  time off the main thread (`readFolderPois`, sieving `P` lines out of the raw bytes), and the picker
  is usable by file name while that's in flight. Priority is **catalogue → solved → the file's own name**: the
  curated names win because the solver is occasionally sure and wrong (it offers `neriaka` the
  Fourth Gate, which is a different file), and a zone still nameless shows as `gukbottom`, which is
  honest and selectable.
  **The catalogue is not exempt from the solver's rules** — it outranks them, which makes a wrong
  entry the one naming mistake that doesn't fail closed: it draws another zone's map under the
  right name, and every position plotted on it is somewhere else. `Qeynos Hills` was curated onto
  `qey2hh1`, whose own exit label reads `to Qeynos Hills` — the neighbour test the solver applies —
  because it is West Karana; the hills are `qeytoqrg`. So before adding an entry, read the file's
  `to …` labels: **a map that links to X is next to X.** The second half of the check, when you have
  played the zone: your own recorded positions have to fall inside that file's geometry, because you
  cannot stand outside the zone you are in.

  **A name that's merely phrased differently needs no table at all.** `resolveZone`
  (`src/shared/zones/resolve.ts`) matches against the zone list itself, so "The Castle of Mistmoore",
  "Mistmoore Castle" and "Castle Mistmoore" are one zone without anyone saying so — and because it's
  handed the candidates rather than guessing from the string alone, it can refuse when two zones fit
  ([ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)). What's left over is
  **one gazetteer with two views** (`src/shared/zones/gazetteer.ts`), because a name can still be
  wrong in two ways:
  - `CURATED_ZONES` — *which file* a zone is, for the names no pack's labels reach. Re-exported from
    `map/zones.ts`, where its readers have always found it.
  - `ZONE_ALIASES` (`src/shared/names.ts`) — *which name*, for a pair **no rule can reach**. The log
    says **Kerra Isle**, the wiki says **Kerra Island**, both packs' labels say **Kerra Ridge**, and
    454 of 463 positions recorded there sit inside `kerraridge`'s lines, so the aliases fold the other
    names onto the map's. It's part of `zoneKey`, so a kill recorded under one name and a map named the
    other are one zone to the heatmap, the kill list, mob knowledge and the wiki's drop zones alike.
    It is also the *riskier* of the two views: an alias has no candidate list to be outvoted by, so it
    is believed everywhere and forever, where a resolver match is always checked against what the
    caller has.

  Both are **derived from a supplied table** — `eql-classic-zone-maps.json`, the EQL wiki's own in-era
  Zones page mapped to EverQuest short names
  ([ADR 0076](../decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)). It earned that place by
  confirming twenty-four of the thirty-one names this repo had verified the hard way — same name, same file — including the two that cost the most
  (`qey2hh1` is West Karana, `qeytoqrg` is Qeynos Hills) and by explaining the solver's worst
  confident-wrong answer: `neriaka` is the Foreign Quarter, and the Fourth Gate it kept offering is
  `neriakd`, a file nothing had a name for. It names **83 files where we had 31**, and 76 of those now
  place in an expansion (up from 15) — which matters beyond the picker, since an unnamed zone is
  also outside the era check and the travel graph.

  **What we verified ourselves still comes first**, since a canonical name is what the expansion lookup
  and stored pins are keyed by; where the two disagree about a *file* (`tox`/`toxxulia`,
  `steamfont`/`steamfontmts`, `nro`/`northro`) the loser stays as a **candidate**, so a folder with only
  the other file is named rather than showing "Tox". The alias side is filtered — nothing under four
  characters, no label covering several maps, and **no bracketed spelling**, because the fold reads a
  trailing parenthetical as a ruleset tag and `Qeynos (North)` folds to `qeynos`, which renamed a whole
  city to one of its halves until a test caught it.

  **The game writes a ruleset two ways.** `The Steamfont Mountains 2 (Adaptive)` is the shape
  [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md) was written for; a real peer's
  observations turned out to carry the other, `Nagafen's Lair - Solo`, and left unfolded it is a second
  camp with its own thin drop rates. Both fold now (`zoneMode`, `zoneBaseName`), and the dash form is
  safe to fold because **no zone name the app ships contains " - "** — the hyphens in the corpus are all
  inside a word (`Cazic-Thule`, `Takish-Hiz`), which a test pins.

  The same peer's rows are also why three aliases are stated by hand: `The City of Guk` and
  `The Ruins of Old Guk` are EverQuest's own long names for `guktop` / `gukbottom`, where the gazetteer
  says Upper and Lower Guk, and `Temple of Cazic-Thule` is fandom's name for the zone it calls plain
  `Cazic-Thule`. All three are the wording a **log** uses, which is the wording data is stored under
  ([ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)) and therefore the
  wording that has to resolve.

  **A name a letter out needs no table either.** A pack's label says `Toxulia Forest` where the game's
  own maps and the log say `Toxxulia Forest`, which used to leave the zone in the picker **twice** —
  once with a map and once without — and hid an evening's kills behind whichever spelling you weren't
  looking at. One edit, same last character, long enough that a letter isn't most of the name, is the
  whole rule (`src/shared/zones/spelling.ts`); measured across all 361 shipped zone names it merges
  nothing real, and the picker, `findZone`, the kill query and the pooled tallies all take it
  ([ADR 0075](../decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)). Uniqueness in
  `zonesFromFiles` is judged by it too, so the losing file falls back to its own name (`Tox`) instead
  of standing in the list as a second forest.

  The three zones that stayed unresolved after that were **coverage, not naming** — and they're
  answered under **Sources** above: a zone the chosen pack hasn't got is borrowed from the game's own
  maps ([ADR 0063](../decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)), which leaves nothing
  unmapped that any folder on the machine can draw.
- **One name per map reference** (`mapZoneName`, `src/shared/map/zones.ts`) — `findZone` answers
  with a **file**, and a map reference needs a **name**: what scopes this window's pins and kills,
  what goes in the title, what the picker remembers, what the wiki link is built from. For a zone with
  no map file there is no file to name it, and every reference used to write its own fallback —
  `findZone(n, zones)?.name ?? n` — which is **the log's wording, difficulty and all**. So an unmapped
  `Blackburrow 3` was a second Blackburrow: its own pins, its own kill scope, its own broken
  `wiki.project1999.com/Blackburrow_3`, and a height window thrown away every time the difficulty
  changed under you.

  One translation now, and its floor is a **place**: the map's own name where we have a file,
  `placeName` otherwise (ADR 0083's fold, which strips the difficulty and the ruleset per
  [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md)), and never the raw name. A blank name
  stays blank, because "no zone yet" is not a place. Every reference in the window goes through it, so
  there is no per-call-site fallback left to disagree; `findZone` keeps the one question it actually
  answers, *which file do we draw*. A **difficulty change is not travel** either, so follow-me
  compares by `samePlace` rather than snapping you off the map you were studying
  ([ADR 0134](../decisions/0134-a-map-reference-resolves-to-a-place.md)).

  **The difficulty is shown, not swallowed.** It survives in the data regardless — records keep the
  log's wording (ADR 0083) — but folding the *title* would have hidden it in the one window that used
  to show it, so `zoneDifficultyLabel` (`src/shared/names.ts`) names the tier from the number (D0, and
  D1 *Awakened* through D4 *Refined*, with the log's own ruleset tag winning wherever it wrote one) and
  the titlebar carries it as its own token: **`🗺 Blackburrow · D3 Fused`**. The name says which map;
  the token says which copy of the zone.
- **A difficulty can never cost you a map** ([ADR 0139](../decisions/0139-a-difficulty-can-never-cost-a-map.md)) —
  the server publishes five tiers (D0, and D1 *Awakened* through D4 *Refined*), one geometry between
  them, and the fold has to reach **every** way one is written or the window silently draws nothing.
  [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md) covered the shapes it had guessed at; the
  tier list turned out to invite twenty more that reached no map — `Blackburrow D3`,
  `Blackburrow Fused`, `Blackburrow [Fused]`, and `Blackburrow Difficulty 3`, which folded to
  `blackburrow difficulty` and so *invented* a name.

  Two rules, and the split between them is a **measurement** over the 472 zone names the app ships:

  - **Folded by rule** (inside `zoneKey`, so kill records and drop rates fold with it): a bracketed
    tag, `D<n>`, `Difficulty <n>`, and a tier word with a number beside it. Nothing shipped ends in any
    of those, so none of them can be confused with a real name. The ornaments are peeled in a **loop**
    rather than in a fixed order, because they compose and the game commits to no order
    (`Cazic-Thule 3 - Solo`, `Blackburrow Difficulty 2 [Adaptive]`).
  - **Folded only by the resolver**: a **bare** tier word. Exactly one shipped name ends in one —
    `Crystallos, Lair of the Awakened` — so a rule doing this would rename a real zone. The resolver
    has candidates in hand and tries the name as written first, which is what makes Crystallos match
    itself; that ordering *is* the guard, and it is why the `difficulty` tier sits between `order` and
    `typo` rather than in the fold.

  The number and the name are two spellings of one fact, so each is readable from the other: `(Fused)`
  is difficulty 3, and `(D3)` is a *number* rather than a ruleset named "D3" — which the fold got right
  and the analytics half got wrong until this was measured.

  Pinned as a **property**, not as examples: `electron/tests/zone-difficulty.test.ts` crosses every
  shipped zone with every shape (~10,000 lookups), asserts the map never changes, asserts the lookup
  count so a refactor can't pass by checking nothing, and asserts that reaching all those shapes has
  not merged two zones that nobody said were one.
- **Only zones this server has** — a pack draws all 26 expansions of EverQuest, so `zonesFromSources`
  drops the ones that don't exist here (`zoneAvailable`, see
  [ADR 0065](../decisions/0065-a-zone-belongs-to-an-expansion.md)): a fetched zone → expansion table rules
  out everything past this server, and eqlwiki's live era flags close what it has but hasn't opened. The
  same function the [travel](../travel/README.md) graph excludes by, so the picker can't offer a zone a
  route would refuse. It **fails open** — a zone the table has never heard of is kept, because losing a
  real zone is worse than offering an unreachable one, and Legends' own custom zones live in that gap.
  `zonesFromFiles` deliberately doesn't filter: "what is this folder's zone called" is a different
  question, and the naming rules above lean on it.
- **A zone can be pinned to the game's own maps** (`STOCK_ONLY_ZONES`, `stockOnly`). A pack's map for a
  particular zone can be the wrong one to use — drawn for a different era, or laid out unlike what EQ
  Legends ships — and preferring your pack in general can't fix one bad file. So there's a short exception
  list, keyed by map file (`lavastorm`), and `zonesFromSources` applies it by **withholding the pack's
  file**: from there on "this zone comes from the backstop" has one cause and one code path, whether the
  pack lacked it or was overruled. The titlebar says so either way, with the reason worded for which it
  was. A zone the game's own maps haven't got keeps the pack's — drawn imperfectly beats not drawn.
- **The zone picker** (`ZonePicker`) is a **type-to-find** box, not a dropdown: 568 zones in a
  `<select>` is a scroll rather than a choice. Ranking is the app's existing `fuzzyRank` (token
  overlap plus Levenshtein), over the zone name **and its file name** — the file is what a zone we
  couldn't name is called, and what someone who knows EverQuest would type. ↑↓ and Enter work, and
  blank is always the **first row** rather than something you clear the field to get, since it's a
  real choice. What blank *means* is the caller's (`blankLabel`): here it's "Follow current", the
  default; the [Hunt tab](../overlay-ui/README.md) reuses the same picker for "All zones".
- **The EQ map format** (`src/shared/map/eqmap.ts`, pure — `electron/tests/eqmap.test.ts`):
  `L`ine and `P`oint records, parsed into geometry and labelled points. **Its coordinates are
  world coordinates** (x/y negated, the same negation `coords.ts` applies), which is why a
  file-backed zone needs **no calibration**: `vectorProjection` derives the scale and centre
  from the geometry's own world box. Layer `_1` is the points of interest and is read; layer
  `_2` is a compass and the mapmaker's credits drawn as vector text far outside the zone, so
  it isn't drawn — only its labels, shown as attribution under the map.
- **What's drawn** (the 👁 panel, `src/app/components/MapFilters.tsx`) — one place for five
  questions, in the order you'd ask them: **which heights**, **which of my pins**, **the hunt's own**,
  **which of the map's own labels**, **whose shared pins**. A busy dungeon needs them all, so each is
  its own section; the panel scrolls rather than growing, because the map is the point — up to the height its
  reader drags it to (below). Presentational — every choice is owned by the map window, so it can't
  drift out of step with the canvas.
- **Label filter** (`src/shared/map/poi-kinds.ts`) — a busy zone is mostly labels, and which ones
  matter depends on what you're there for, so each **kind** can be switched off. The choice persists.

  Kinds come from **the label's own words**, not from its color. The colors *are* categories — and
  the classifier agrees with them where the packs have a convention (zone lines red, quest givers
  blue/teal, forges purple 487 times out of 628) — but it's a convention each mapmaker keeps their
  own way: zone lines come as both `255,0,0` and `240,0,0`, merchants as `0,128,0` and `0,127,0`,
  and thousands of labels are drawn in the default black. Text is steadier. The color is still shown
  beside each toggle, since that's how you recognise them on screen — and it's the color those
  labels really are *on this map*, not one we assumed.

  **Fourteen kinds in five sections** — *Getting around* (zone lines · ports & boats · ways up &
  down), *Doors & traps*, *Who's here* (vendors & services · quests & missions · named & bosses ·
  ordinary spawns), *The zone* (ground spawns & drops · tradeskill stations · names & places), *Map
  notes* (floor markers · notes). The **section headings are themselves toggles**, because the
  gesture you usually want is a whole section off ("hide the dungeon furniture"), not one kind at a
  time. Only the kinds a given map actually contains are offered, and an empty section is dropped.

  Every vocabulary is a **tally of the real corpus** — 760 files, ~19,000 distinct labels — and the
  counts stay in the code so a rule can be argued with. A trailing parenthetical is the most
  informative shape (7,000+ labels carry one) and is read first, because only the brackets separate
  `a reanimating hand (Hunter)` (a spawn on the Hunter achievement list) from `a spell research
  merchant (Research)` (a shopkeeper). But **a bracket it can't read defers to the label's own
  words** rather than assuming a trade, which is the whole point: the old catch-all made merchants
  of 5,749 distinct labels, including every `(Hunter,Roam)` spawn and every `Locked Door (Picklock
  200+)`. `note` is the only fallback. `GS:` is *Ground Spawn*, not a quest prefix. Floor labels are
  recognised by the same test that drives the floor filter rather than a second guess at it. See
  [ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md).

  **"Names & places" stays the largest section and is deliberately ambiguous**: a proper name written
  plain (`Enraged Trueborn Lightstealer`, `Bandit Camp`) can't be told from a landmark by its words,
  and splitting it on a guess would be worse than one honest row. The hint says so.
- **Floors and heights** (`detectFloors`/`floorAt`/`inBands`/`segmentInBands`/`mapZRange` in
  `eqmap.ts`) — a vector map holds every storey at once, so RunnyEye arrives as five levels of
  corridor on top of each other.
  The floors are read from the **mapmaker's own labels** (`Level 1 (Top)`, `2nd Floor`), never
  guessed from heights: clustering z would split Greater Faydark's terrain-plus-treetops into
  fake floors, while the real floors are *joined* by their stairs. Labels that merely mention a
  level (`Water - LVL 3`, `TRAP: Fake Floor`) aren't storeys, and a map that labels its floors
  side by side at one height (Kurn's Tower, all eight at `z=1`) is drawn whole. Showing every
  floor stays the default, as in-game. See
  [ADR 0040](../decisions/0040-floors-come-from-the-mapmaker.md).

  The floors are **checkboxes**, not a dropdown: two storeys read together is a real question and one
  `<select>` could never answer it. The titlebar's **⌂** says how many are showing and opens the 👁
  panel. Picks persist; an empty or stale one falls back to every floor, because hiding every floor
  would only blank the map. A pin or ping is stamped with the floor in view **when exactly one is** —
  with several on screen there's no single storey to claim, so it belongs to the zone. The rows mark
  the floor your `/loc` height puts you on with **· you**.

  A map whose author labelled **no** storeys gets a **height window** instead — a `minZ..maxZ` pair
  of handles over the zone's own z span (`mapZRange`, read off the geometry). It's the only thing such
  a map can honestly be filtered by, and it invents no floors: a person sets it and reads it. It
  can't persist or travel, since z means a treetop in one zone and a sewer in the next, so it's held
  with its zone and dropped when you look at another.

  Both feed one **`ZBand[]`** into `MapPanel` — the drawing cares about heights, and only *some* of
  the heights it's given have a name. No bands means no filter (every band on and nothing to filter
  by are the same picture, so they're the same answer), and a stair spans two bands and shows on
  both. Markers use the same `layer` field as before, via `onLayer` against the *set* of visible
  floors; a marker stamped with a floor this map doesn't have still shows, so switching map packs
  can't lose a pin you placed.
- **Pins** (`src/shared/map/pins.ts` palette + `MapPanel`/map window) — a toolbar of
  pin kinds (Star/Danger/Camp/Loot/Note) plus a **Move** tool (drag your pins to
  reposition). Pick a kind up, then a map click **drops** it at that spot; with none
  held a click **pings** instead (a click on an existing pin hit-tests first). Each pin
  has a **title** (drawn under it on the map) and a free-text
  **note** (shown on hover); clicking your own pin opens an editor (title / note /
  Remove). Pins persist in `localStorage` (per zone — and per layer where the zone has
  them, stamped with the layer you dropped it on). The **👁 panel** toggles visibility
  by pin kind (**My pins**) **and per sharer** (**Shared by** — one toggle per peer sending
  pins). **Whether pins are shared is decided in the [peers](../peers/README.md) tab, not here** —
  the 🔗 toolbar toggle is gone, because it was a second switch for one setting
  ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)). Pins travel **two ways**, and
  they are the only kind that does ([ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md)):
  broadcast for the **live overlay** (peers' pins stream in over the room and render read-only, which
  is this window's "about now" job), *and* reported to main (`peer.setPins`) so main can hand over a
  **copy to keep** when somebody asks — which is what makes them shareable while the map is shut.
  Seeing where somebody is pointing and taking their map home are different requests. A copy arriving
  from the Peers tab is folded into your own set with fresh ids. All rendered on the overlay canvas,
  filtered to the viewed zone.
- **Hunt pins** (`src/shared/map/hunt-pins.ts` + [mob-place.ts](../../src/shared/map/mob-place.ts),
  both pure) — **the one marker the map places by itself**: every mob your hunt wants that anything
  can place in this zone ([ADR 0142](../decisions/0142-a-hunted-mob-marks-itself.md)). The hunt comes
  from `useHunt`, shared with the Hunt tab so the two can't drift.

  **A position comes from three sources, ranked and never merged** — your own kills, those pooled
  with peers', or the wiki's stated `Location:` coordinate — and the mark says which. Observation
  leads ([ADR 0025](../decisions/0025-observation-over-the-wiki.md)); the wiki answers only where no
  kill can, which is the case that matters most, since your kills can only place a mob you have
  *already* killed and a shopping list is about the one you haven't. A stated coordinate has to be
  about the zone on screen — said by the card's own `Zone:` row, or by the hunt having filed the mob
  here — and `Various`/`Unknown` are words, not places (`statesNothing`, shared with the wiki page
  view). Pages are read only for the mobs kills can't place (`unplacedHuntMobs`), so the lookups stay
  bounded.

  **Drawn loud**, because this is what the map was opened for: a bigger marker inside a ring of its
  own colour, its caption in that colour, and **the uncertainty drawn around it** — a solid ring at
  the roam spread for a measured position, a dashed one at a fixed size for a merely stated one. A
  spread tighter than the marker draws no ring, which is what a very tight measurement looks like.

  **Derived, never stored**: not in the pin store, never shared, not draggable, not editable — they
  exist while the hunt wants the mob and something can place it, so finishing an item takes its mobs
  off the map by itself. A roam centre you already starred by hand isn't marked twice. The hover says
  what it's wanted for and what the position rests on, including `roamWhy`'s hedge, because a roam
  centre is an average of where a mob *died* rather than a spawn point. Clicking one opens the 📖
  panel narrowed to that mob with its kills ringed, the same answer arriving from another window
  gives (ADR 0104). The 👁 panel switches them off — and switching off stops the wiki lookups too,
  not just the drawing — and that choice persists.
- **Peer networking** (opt-in) — the awari **connection lives in the main window**
  (`src/lib/awari/host.tsx`), not here; the main process brokers messages to every
  window (see [ADR 0012](../decisions/0012-awari-connection-owned-by-main-window.md)).
  The map is just a consumer: `src/lib/map/useAwariRoom.ts` reads the brokered stream
  (`window.eql.awari.onMessage`) into peers/pings/pins and sends its own pings via
  `awari.send`. **Kills and observations are no longer broadcast from here** — main reads them out of
  the kill log and hands them over peer-to-peer on request, so they travel whether or not this window
  is open ([ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md)); pins still broadcast, for
  the live overlay above, *as well as* being offered for copying. See
  [peers](../peers/README.md). What is left here is what this hook was always for: the things that
  are about *now*. **Every gate is in the [peers](../peers/README.md) tab** and none of them is here
  or in Settings any more ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)):
  `connectPeers` joins the room, `shareLocation` broadcasts your live `/loc`, `playerName` is who you
  appear as (blank = the log's character name, `characterFromLogFile`), and the bootstrap URL
  overrides the live service. Connected, this window shows peers' live locations (green dots) and lets
  you **ping** the map — click a spot and your name plus the **viewed** zone are broadcast and drawn
  as a gold named marker for everyone viewing that zone. A fresh ping **animates** — expanding rings
  for ~2.4s, then it settles into a plain marker so it stays findable — and your own ping is echoed
  locally, since the inbound stream excludes you and a click with no visible result reads as broken.
  Peers/pings are filtered to the viewed zone.
- **Travel** (the 🧭 toolbar panel) — how to get from one zone to another, which is the one question a
  map of a single zone can't answer. **From** is where the log says you are (with your `/loc`, so the
  walk to the first border is measured); **to** defaults to *the zone you're viewing*, so picking a map
  in the titlebar and opening this panel is one gesture. The answer is a list of borders and walks —
  never a line on the canvas — and each zone in it is a button that shows that map. Three checkboxes say
  which ports to assume, and they're `Settings.travel` rather than window state, because your class
  isn't a property of the map you're looking at. Owned by [travel](../travel/README.md); this window
  only holds the state, as it does for every other panel.
- **Mob knowledge** (the 📖 toolbar panel) — what killing things here has taught us:
  **observed drop rates** (kills-that-dropped-it over kills, dimmed until the sample is worth
  trusting — only kills that were yours count, see
  [ADR 0027](../decisions/0027-only-your-kills-count.md)) and **roam areas** (the middle of where a mob died and how far that spreads, with a
  ±button that pins it on the map — and, for a mob your list is after, a pin the map places without
  being asked: **Hunt pins** above). The rows are **read by the window, not by the panel**
  (`useZoneMobs`, which reads the pooled figure and your own share of it together), because the hunt
  pins on the canvas are drawn from the same rows — and telling your kills from a peer's is the whole
  of a position's provenance, which two separate reads could show out of step. Yours is derived from the kill log on demand;
  peers' arrives over the room and is stored separately, **keyed by contributor id rather than by
  the name they announce**, so every figure can still say how much of it you saw yourself and whose
  the rest is ([ADR 0132](../decisions/0132-a-contribution-is-keyed-by-who-made-it.md)).
  `src/shared/mob-stats.ts` does the rolling-up and the pooling, `src/shared/pooling.ts` says what
  a pooled figure is worth — whose it mostly is, and which drops your sample and the pool's plainly
  disagree about, reported rather than resolved; see
  [ADR 0024](../decisions/0024-mob-knowledge.md).

  **Both directions of the panel point at the map.** Hovering a mob rings its kills, and hovering one
  of its **drops** rings the kills of *every* mob known to give that item up — the loot table read
  backwards (`dropSources`, indexed once per zone). "Where do snake fangs come from" is one question
  with several answers, which is why an emphasis names a **set** of mobs rather than one; nothing
  else can answer it, since the wiki's `ItemSource` knows a mob and a zone but never a position, and
  only our own kills know where a thing was standing when it died. The sources are read from
  everything known here rather than from the filtered rows: narrowing the list to one mob is a
  question about the list, and it shouldn't quietly narrow the answer too. A drop off more than one
  mob says so on its row ("2 sources"), because the row sits under a single mob and can't otherwise
  admit that it's speaking for one of several.

  **A typed drop is a search, so the panel opens what it found.** The rows a drop filter matched
  expand themselves and the matching line is marked (`matchesDrop`, the same rule the filter itself
  applies — a second implementation here would highlight lines the filter didn't keep). Left closed,
  the panel answered "these four mobs" to a question that asked about one item, and finding it meant
  clicking a caret on every row. With the mob picker beside it, that's the panel's two ways in:
  **find a mob** and read what it drops, or **find a drop** and see who has it — either way, hovering
  the answer shows it on the map.
- **Kill heatmap** (the ☠ toolbar panel) — where kills happened, drawn from the recorded kill
  log (`electron/kill-log.ts`), asked for **by zone — every variant of it**. One Steamfont is drawn
  by one map file, so a kill at `The Steamfont Mountains 2 (Adaptive)` belongs on the ordinary map:
  `killLog.kills(zone)` matches through `samePlace` — *not* the loose `zoneMatches` (`commonlands`
  sits inside `east commonlands`), and not a raw string either, since the name asked with is usually a
  map pack's label rather than the log's wording and a pack that spells the forest `Toxulia` would
  answer an evening in `Toxxulia Forest` with nothing at all. **Every record keeps the log's own
  wording, and the grouping happens on the way out**
  ([ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)), so correcting a
  mapping table corrects a heatmap, a drop rate and a camp report that are already on disk. See also
  [ADR 0059](../decisions/0059-a-zone-s-variants-are-one-zone.md) and
  [ADR 0075](../decisions/0075-a-zone-s-misspelling-is-the-same-zone.md).
  Each dot fades and shrinks with **confidence**, and carries the
  marker from `src/shared/kill-confidence.ts` — the same glyph the kill list shows, so a faint
  dot and its row agree. Anything below "approximate" isn't plotted at all: it stays in the
  list, labelled, because an inferred position drawn like a measured one is worse than none.
  Right-click a marker (or use Settings) to hide the markers. Kills someone else landed are
  in the list, named and believed half as much — the position came from *your* `/loc`, and they
  were standing somewhere else.
  **Hovering a row picks its kills out on the map**: a mob's row rings every one of its kills, an
  individual row rings just that one, and everything else fades to a third rather than disappearing
  — a marker you can still see is context, one that vanishes is a lie about what's on the map. The
  ring sits *outside* the dot so the dot's own size and colour still mean what they always did
  (confidence). Leaving the list clears it outright: the rows hand the emphasis back and forth
  between a mob and one of its kills, so without that backstop, walking the cursor out of a kill row
  would leave a mob lit up for good — the 📖 panel has the same backstop, since its rows hand the
  emphasis between a mob and one of its drops. Emphasis by mob also lights **peers'** kills of the
  same mob, since "where did those die" includes what the room saw.

  **An emphasis names a set of mobs** (`KillEmphasis.mobs`), not one. A row hovers a single name, but
  a drop in the 📖 panel asks about every mob that gives it up, and that is *one* question with
  several answers: a kill matching any of them is rung, and the rest of the map fades once rather
  than once per name.

  **A peer's kill is a kill.** Shared kills go into the same list, the same mob groups and the same
  filters as your own, marked with who sent them (`sharedBy`, `sharedAsKill`) — they used to go straight
  to the canvas and appear in no list at all, so the map had markers nothing on screen explained and every
  filter applied to half the dots. `shared` in `KillFilters` takes them out again, and it's **on by
  default**: a mob dying somewhere is evidence of where it spawns whoever watched it. What travels is only
  where, what and how much to believe it — no time and no loot — so a shared kill shows a gap for its
  clock and is excluded by a drop filter, which is the right answer rather than a hole: it is no evidence
  about drops at all, for the same reason a bystander's kill in your own log isn't
  ([ADR 0027](../decisions/0027-only-your-kills-count.md)). Sharing is one-way on purpose — the broadcast
  filters `sharedBy` out, or three clients in a room would echo each other's kills round and round.

  The filter bar is **one row whose shape doesn't change**, including the shared toggle, so nothing
  reflows when a peer connects. It used to wrap onto a second line — the two selects each cap at 55% of
  the bar by default, which cannot fit — and with the panel 45% of the window tall, the map was nearly
  gone.

  **One bar heads both panels** (`KillFilterBar`). The 📖 knowledge panel used to spend a row of its own
  on "14 mobs observed in Kerra Ridge" and a button, so opening it and the ☠ list cost two rows saying two
  different things before either list started. Now each panel is headed by the same bar over the same
  `KillFilters`, so the row you spend is a row that filters — and each carries **the toolbar glyph that
  opens it** (☠ / 📖), which is the only thing distinguishing two otherwise identical rows of controls.
  Controls that mean nothing for a panel are **absent rather than inert**: the knowledge panel offers no
  time window and no position floor, because those are facts about an individual kill while it is a
  lifetime tally — see `filterMobKnowledge`, where `shared: false` drops the mobs that are *only* peers'
  rather than restating a pooled rate you helped build as your own smaller sample.

  **Two filters that can't both be answered are not left standing.** A picked mob that has never dropped
  anything and "dropped" have no common set, and the panel that resulted said only "nothing matches" while
  the mob's name still sat in the picker — so the checkbox looked like the thing that broke. Ticking the
  box now releases the mob (`withDroppedOnly`, the newer click being the newer intent), and while it's on
  the picker offers only mobs that have dropped something, so neither order of clicks reaches the dead end.
  The choices carry that fact with them (`mobChoices` → `MobChoice.dropped`), read off kills in the ☠ list
  and off the lifetime tally in the 📖 panel. Both are `kill-filters.ts`'s, not the bar's: a rule about
  which filters can coexist belongs beside the filters, and the bar is one of two rendering the same box.

  The **[Hunt tab](../overlay-ui/README.md) asks the same question from the other window**
  (`map.emphasize` → `KillEmphasis`, which is why that shape lives in shared types rather than
  beside the list). Both write one piece of state, so whichever cursor moved last is the one being
  answered. Two rules keep a hover from being a command: it **never opens the map**, and an
  emphasis that matches nothing drawn here is **ignored** rather than honoured — the Hunt tab can
  point at a mob that died in another zone or was never killed at all, and dimming every marker to
  say "no" would be worse than saying nothing. Mob names are compared through `mobKey`, since the
  name pointed at may be the wiki's ("a Gnoll Pup") while the kill log's is stripped and lowercase
  ("gnoll pup") — the same fold mob knowledge already uses.

  The panel's filters — time window, mob, what dropped, dropped-anything, confidence floor —
  come from `src/shared/kill-filters.ts` and are applied to **both** the map and the list, so
  they're always the same query. Drops are attached to kills as the loot lines arrive, which
  is what makes "only kills that dropped X" a filter rather than a search.
  The list **groups by mob** — one openable row per mob with a kill count and drop summary, so
  300 kills of the same thing read as `grikbar kobold ×300` instead of 300 identical lines;
  expand a row to see the individual kills (each still its own dot on the map).
  **Sharing your kills is decided in the [peers](../peers/README.md) tab** — the ☣ toolbar toggle is
  gone, having been a second switch for `settings.share.kills`/`.mobs`
  ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)). Both are read out of the kill log
  by main and handed over on request ([ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md)),
  which fixes what this window could not: it only ever shared *the zone on screen*, and shared
  nothing at all while closed. Peers' kills draw outlined rather than filled, and are **kept**: they're
  filed by the main process as they arrive and read back with `usePeerKills`, so the pooled half of
  the heatmap is here on a night nobody else is online, and no window has to be open to receive it
  ([ADR 0132](../decisions/0132-a-contribution-is-keyed-by-who-made-it.md)). See
  [ADR 0023](../decisions/0023-kill-heatmap.md) and
  [ADR 0024](../decisions/0024-mob-knowledge.md).
- **Connected users** (the 👥 toolbar panel, when connected) — everyone in the room,
  whether or not they share anything: presence from awari's roster, names/zones from a
  `hello` payload, plus what each is sharing (location dot, pin count) and a button to
  jump to their zone. See [ADR 0015](../decisions/0015-peer-presence-via-hello.md).

  **The one peer thing that stayed on the map, and a pure view now** — no toggles, nothing to ask
  anybody for ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)). Not because "who is
  where" is a map question, but because this window is an always-on-top overlay you read while the
  game is full-screen and the main window is hidden, which is exactly when a tab is no use. A view may
  live where the reader is; the control behind it may not. Everything configurable is in the
  [peers](../peers/README.md) tab, which its empty state names.
- **Every one of those five panels is resizable** (`ResizablePanel`, with the arithmetic in
  `src/shared/panel-size.ts`). Each opens over the map with a default share of the window — 45% for
  the 👁 floors and the 🧭 route, 40% for ☠ and 📖, 30% for the 👥 roster — and that default is a
  **ceiling, not a size**: as tall as its content until someone drags the seam under it, then exactly
  as tall as they said, scrolling whatever doesn't fit. Which of the panel and the map is "the point"
  depends on what you're doing — a forty-step route or a dungeon's five sections of label kinds want
  the window; a glance at who's connected doesn't — so the proportion is the reader's to set, and is
  remembered per panel. Bounded 6%-85%, so the map always keeps a strip of itself, and the panels
  shrink rather than overflowing when enough of them are open at once. Double-click a seam to put it
  back. See [ADR 0112](../decisions/0112-a-panel-s-height-belongs-to-its-reader.md) ·
[ADR 0134](../decisions/0134-a-map-reference-resolves-to-a-place.md) ·
[ADR 0139](../decisions/0139-a-difficulty-can-never-cost-a-map.md).

## Non-responsibilities
- No continuous position tracking: EQ only logs a location when one is emitted
  (typically when you type `/loc`), so the dot steps per loc line — the UI says so.
- **No routing *inside* a zone, and no line drawn on a map.** A map file's lines never say what's
  walkable — an `L` record is a wall in a dungeon and a contour line outdoors — so a route through the
  geometry could only ever be a guess dressed as advice. Tried once and removed: the map already shows
  you the corridor.

  Getting **between** zones is a different question on different data, and it has its own area:
  [travel](../travel/README.md) routes over the mapmakers' own `to <zone>` **labels** — the same corpus
  that names the zones above — and answers with a list of places rather than a drawn path. This window
  *hosts* that panel (🧭) and still draws nothing of it: no line, no arrow, nothing on the canvas
  ([ADR 0062](../decisions/0062-a-travel-graph-of-zone-lines.md)).
- **The floor in view is never chosen for you.** On a vector map that names its storeys, your
  `/loc` height is enough to say which one you're on — and it's *shown* (**· you** in the
  rows) rather than acted on, because auto-hiding four fifths of a map on an inference is a
  worse failure than a busy map. Nothing derived from the log is filed under a floor: only pins
  and pings, which a person placed while looking at one. The **height window** is the same rule
  from the other side: on a map with no storey labels there is nothing to name, so the app offers
  raw height for a person to set and read, and never guesses where a floor is
  ([ADR 0040](../decisions/0040-floors-come-from-the-mapmaker.md) stands).
- **A label's kind is never inferred from its colour, and never invented.** The classifier reads
  words; a shape it doesn't recognise becomes a **note**, and the biggest section ("Names & places")
  stays ambiguous on purpose rather than guessing whether a proper name is an NPC or a landmark.
  See [ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md).
- **Nothing is calibrated, and nothing can be.** A projection is read off a map's own geometry;
  there is no authored alignment to tune and no tool to tune it with. That went with the bundled
  scans ([ADR 0042](../decisions/0042-only-the-game-s-own-maps.md)) — along with the class of bug
  where a rotated or cropped image could never be made to fit.
- **Map files are read, never shipped.** The packs are other people's work, sitting in the
  user's own game install; we point at them and credit them, and bundle none of it.
- **There is no rotation in the map-file format, and none in the maths.** Checked: across all ~1,900
  files in both folders, *every* line is an `L` or a `P` — no header, no metadata, no orientation
  flag. Geometry is world coordinates and is drawn north-up, verified against the P99 scans
  (Greater Faydark matches feature for feature, and every clearly non-square zone agrees in
  orientation with its independently drawn image).

  A zone can still *look* rotated, and the reasons aren't in the vector data:
  - **A scanned image could be** — which is one of the reasons the scans are gone. `scale` +
    `center` express a size and a position and nothing else, so a rotated or differently-cropped
    scan could never be calibrated to fit. `Neriakcommons_true_north.png` carried that name because
    the standard P99 Neriak Commons map *isn't* true north; Neriak Third Gate was a landscape crop
    of a square zone.
  - **The game's own map window rotates to your heading.** Ours doesn't, so a side-by-side with the
    in-game map will disagree by however far you're facing off north.
- **Zone short names aren't guessed.** A file we can't confidently name is shown by its file
  name rather than a plausible-looking zone name — see **Sources** above for why a wrong name
  is worse than no name.

## See also
[overlay-ui](../overlay-ui/README.md) · [log-watching](../log-watching/README.md) ·
[data-model](./data-model.md) · [ADR 0010](../decisions/0010-ported-map-core.md) ·
[ADR 0011](../decisions/0011-awari-peer-location-sharing.md) ·
[ADR 0015](../decisions/0015-peer-presence-via-hello.md) ·
[ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md) ·
[ADR 0072](../decisions/0072-a-folder-of-maps-is-named-once-and-remembered.md) ·
[ADR 0112](../decisions/0112-a-panel-s-height-belongs-to-its-reader.md)
