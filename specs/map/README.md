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
  - `zones.ts` — `CURATED_ZONES` (the few names the solver gets wrong or can't reach, see
    **Zone names**),
    `findZone` (the log's wording resolves through `resolveZone` — case, a leading "the", the
    apostrophe the maps and the log write differently, a difficulty number and the ruleset tag beside
    it ("The Steamfont Mountains 2 (Adaptive)") all wash out and a harder zone still gets its map,
    see [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md) — plus **word order**, so "The
    Castle of Mistmoore" finds "Mistmoore Castle". It takes only the resolver's two strict tiers: a
    wrong file draws a different zone under the right name, so no map beats the wrong map, see
    [ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)), `sortZones`,
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
  coordinate it also drops a marker pin there); created on
  demand by `createMapWindow`. A hand-picked zone is an **override** that persists —
  but only until the log says you actually **zoned**, which clears it so the map goes
  back to following you (otherwise one dropdown pick silently stops it forever). The
  **follow** checkbox beside the dropdown governs that, on by default; turn it off to
  keep studying one map while you travel. The
  title bar carries its own **A− / A+** (`overlay.mapFontScale`, a *separate* value from the main
  window's and one that may go **above 100%** — `MAP_UI_SCALE`, since a map is a picture you lean
  into rather than an overlay to shrink; see
  [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md)), **minimize**,
  **maximize/restore**, a **pin** (per-window always-on-top, via the shared `PinButton`) and a
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
  way to more; the catalogue covers the zones that matter and the rest show their file name. It runs
  on demand per pack (~1s for 568 files) and the picker relabels itself when it lands, so nothing
  waits on it. Priority is **catalogue → solved → the file's own name**: the
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
  **two tables**, because a name can still be wrong in two ways:
  - `CURATED_ZONES` (`src/shared/map/zones.ts`) — *which file* a zone is, for the names no pack's
    labels reach. A real log's zones drove the current set: `kerraridge`, `qeynos2`, `qeynos`, `qrg`,
    `freporte`, `erudsxing`, `erudnext`, `butcher`, `oot`, each identified by its exits (and
    `butcher` by a recorded position), lifting a real install from **15 of 30 zones resolving to 27**.
  - `ZONE_ALIASES` (`src/shared/names.ts`) — *which name*, for a pair **no rule can reach**. The log
    says **Kerra Isle**; both packs' labels say **Kerra Ridge**, and 454 of 463 positions recorded
    there sit inside `kerraridge`'s lines, so the alias folds the log's name onto the map's. It's
    part of `zoneKey`, so a kill recorded under one name and a map named the other are one zone to
    the heatmap, the kill list, mob knowledge and the wiki's drop zones alike. It is also the
    *riskier* of the two tables: an alias has no candidate list to be outvoted by, so it is believed
    everywhere and forever, where a resolver match is always checked against what the caller has.

  The three zones that stayed unresolved after that were **coverage, not naming** — and they're
  answered under **Sources** above: a zone the chosen pack hasn't got is borrowed from the game's own
  maps ([ADR 0063](../decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)), which leaves nothing
  unmapped that any folder on the machine can draw.
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
- **What's drawn** (the 👁 panel, `src/app/components/MapFilters.tsx`) — one place for four
  questions, in the order you'd ask them: **which heights**, **which of my pins**, **which of the
  map's own labels**, **whose shared pins**. A busy dungeon needs all four, so each is its own
  section; the panel scrolls rather than growing, because the map is the point. Presentational —
  every choice is owned by the map window, so it can't drift out of step with the canvas.
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
  pins). When connected, the
  **🔗 toggle** shares your pins to peers (broadcast via awari, incl. title/note; peers'
  pins render read-only). All rendered on the overlay canvas, filtered to the viewed zone.
- **Peer networking** (opt-in) — the awari **connection lives in the main window**
  (`src/lib/awari/host.tsx`), not here; the main process brokers messages to every
  window (see [ADR 0012](../decisions/0012-awari-connection-owned-by-main-window.md)).
  The map is just a consumer: `src/lib/map/useAwariRoom.ts` reads the brokered stream
  (`window.eql.awari.onMessage`) into peers/pings/pins and sends its own via
  `awari.send`. Two Settings gates (both default off): **`connectPeers`** joins the
  room — you then see peers' live locations (green dots) and can **ping** the map (click
  a spot → your `playerName` + the **viewed** zone are broadcast and drawn as a gold
  named marker for everyone viewing that zone). A fresh ping **animates** — expanding
  rings for ~2.4s, then it settles into a plain marker so it stays findable — and your
  own ping is echoed locally, since the inbound stream excludes you and a click with no
  visible result reads as broken. **`shareLocation`** additionally
  broadcasts your own live `/loc` (disabled in the UI until connected). `playerName`
  defaults to the log's character name (`characterFromLogFile`). Peers/pings are
  filtered to the viewed zone. Bootstrap URL defaults to the live service, overridable
  in Settings.
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
  ±button that pins it on the map). Yours is derived from the kill log on demand;
  peers' arrives over the room and is stored separately, so every figure can still say how much
  of it you saw yourself. `src/shared/mob-stats.ts` does the rolling-up and the pooling; see
  [ADR 0024](../decisions/0024-mob-knowledge.md).
- **Kill heatmap** (the ☠ toolbar panel) — where kills happened, drawn from the recorded kill
  log (`electron/kill-log.ts`), asked for **by zone — every variant of it**. One Steamfont is drawn
  by one map file, so a kill at `The Steamfont Mountains 2 (Adaptive)` belongs on the ordinary map:
  `killLog.kills(zone)` matches through `sameZone` (exact after folding, *not* the loose
  `zoneMatches` — `commonlands` sits inside `east commonlands`), and mob observations tally under
  the same folded key. See [ADR 0059](../decisions/0059-a-zone-s-variants-are-one-zone.md).
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
  would leave a mob lit up for good. Emphasis by mob also lights **peers'** kills of the same mob,
  since "where did those die" includes what the room saw.

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
  The **☣ toggle** shares your placed kills with the room (conclusion only: zone, position,
  mob, confidence) **and** your mob observations (counts, so pooled rates are just addition) —
  one intent, one switch. Peers' kills draw outlined rather than filled. See
  [ADR 0023](../decisions/0023-kill-heatmap.md) and
  [ADR 0024](../decisions/0024-mob-knowledge.md).
- **Connected users** (the 👥 toolbar panel, when connected) — everyone in the room,
  whether or not they share anything: presence from awari's roster, names/zones from a
  `hello` payload, plus what each is sharing (location dot, pin count) and a button to
  jump to their zone. See [ADR 0015](../decisions/0015-peer-presence-via-hello.md).

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
[ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)
