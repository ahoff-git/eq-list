# Map

## Purpose
Show the current zone's map with the player's live location (and a short movement
trail) plotted on it, in a sibling window opened from the main window's 🗺 button.
Maps come either from **the game's own map files** (every zone, self-locating) or from the
**bundled images** (a handful of hand-calibrated P99 scans) — the player chooses, see
**Sources** below and [ADR 0039](../decisions/0039-render-the-game-s-own-maps.md).

## Responsibilities
- **Geometry core** (`src/shared/map/`, ported from the eq-map project — see
  [ADR 0010](../decisions/0010-ported-map-core.md)), pure and DOM-free so it's unit
  tested (`electron/tests/map-coords.test.ts`):
  - `types.ts` — `Loc {y,x}` (EQ order), `Point {x,y}`, `CanvasSize`, `MapRect`, `MapView`,
    `Zone` (`scale` + `center` calibration, `mapImg`/`mapKeyImg`, optional `layer`).
  - `coords.ts` — `fitRect` (where the image lands on the canvas — the one definition the
    drawing and the maths share), `eqToCanvasCoords` / `canvasToEqCoords`, exact inverses
    that return `undefined` for an uncalibrated zone, and `canvasToImagePx` /
    `imagePxToCanvas` for calibration fixes. Math derived in
    [data-model.md](./data-model.md), decided in
    [ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md).
  - `zones.ts` — `baseZones` (P99 classic maps, image paths retargeted to `/maps/…`),
    `findZone` (case/leading-"the "-insensitive, matches the log's zone strings, plus an
    optional layer), `sortZones`, and the layer helpers `zoneLayers` / `collapseLayers` /
    `onLayer` / `layerLabel` (`electron/tests/map-zones.test.ts`).
- **Drawing** (`src/lib/map/draw.ts`, renderer-only — uses canvas): `drawImageScaled`
  (draws into `fitRect`'s rectangle and returns it), `drawLine`, `drawCircle`, `clearCanvas`.
  Vector geometry is drawn by `MapPanel` onto the same static lower canvas, batched into one
  `Path2D` per colour (the biggest zones carry 20k segments) with hairline strokes that
  survive zoom. A segment whose file colour is pure black gets the panel's default line
  colour — black meant "no colour given", and a black line on a dark panel is no map at all.
  Points of interest are drawn on the *overlay* canvas instead, so their labels stay a
  constant size as you zoom, like every other marker and like the game's own map.
- **Location feed** — a `/loc` line (`Your Location is Y, X, Z`) becomes a `LocEvent`
  via `parseLocLine` (`src/shared/log-parser.ts`) and flows through the same
  main→IPC→renderer pipeline as the `zone` event (`watcher.onLoc` → `currentLoc` →
  `CH.locChanged` broadcast → `usePlayerLoc` / `usePlayerTrail`). The **trail** (the line
  between logged positions) is owned by the map window so the toolbar's **∿** button can
  clear it; it also clears itself when you zone, since a `LocEvent` carries no zone and
  the old path would otherwise be drawn across the new map.
- **UI** — `MapPanel` (`src/app/components/MapPanel.tsx`) stacks two square canvases
  (static map + moving overlay), sized to the window via a `ResizeObserver`. A **zoom/
  pan view** (scroll wheel zooms toward the cursor; **drag to pan** once zoomed in) is layered on
  top of the pure coord math and inverted for the cursor→EQ
  **readout** and hit-testing. `clampPan` keeps the map covering the canvas, so it can't be
  dragged off into blank space, and there's nothing to pan at fit. Panning shares the left
  button with pinging, so **a press that travels more than `DRAG_SLOP` becomes a drag and
  the click it ends with is swallowed** — otherwise looking around the map would ping the
  room on every glance. That's the drag *attempt*, not a successful pan: at fit zoom there's
  nowhere to go, and a drag that visibly did nothing must still not ping. Move mode's pin drag
  wins over panning, which is its whole job.

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
  **maximize/restore**, a **pin** (per-window always-on-top, via the shared `PinButton`), a
  **layer** dropdown (only when the zone has more than one map — see **Layers** below), a
  **key** toggle (the zone's `mapKeyImg` beside the map, **zoomable** — `MapKey`: scroll
  to zoom toward the cursor, drag to pan, double-click to reset, since the key scans are
  unreadable at sidebar width), and — with Debug logging on — the 📐 calibration toggle. A zone with
  **no configured map** (most of eqlwiki's ~117 zones — 20 are bundled, 15 calibrated)
  shows a clear empty panel: it names the zone, notes saved markers appear once it's
  mapped, and offers a **View on Project 1999** button (`map.openP99` → the zone's P99 map
  page in the browser). Such zones stay selectable in the dropdown, flagged "(no map)".
- **Calibration** (dev-only) — a map needs two numbers: `scale` (EQ units per image pixel)
  and `center` (the EQ coordinate at the image's centre). Both come from **clicking**.
  `src/shared/map/calibration.ts` is pure (`solveCalibration`, `centerFrom`,
  `nudgeCalibration`, `nextStep`, `calibrationValues`); `src/lib/map/useCalibration.ts`
  owns the fixes and the keyboard.
  With the tray's **Debug logging** on, a **📐 toggle** appears in the map titlebar for any
  zone that has an image — *including one with no calibration yet*, which is the case it
  exists for. In calibration mode a **coordinate grid** (dots at nice EQ coords across the
  image, origin highlighted) overlays the map, and a click records a **fix**: stand
  somewhere, `/loc`, click that spot. One fix places the map; a second one far away sets its
  scale too, which is the whole calibration — the EQ distance between two fixes over the
  pixel distance *is* EQ units per pixel. Fixes draw as numbered crosses (in image pixels,
  so they survive a resize) and can be cleared. Fine-tuning stays on the keyboard: I/J/K/L
  move the centre by the step, W/S scale ±1%, −/= change the step. The live zone mutates so
  the dot slides as you tune, and the panel shows the paste-ready `scale`/`center` with a
  copy button. See [ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md).
- **Sources** (`src/shared/map/map-sources.ts` + `electron/eq-maps.ts` + the titlebar's
  leftmost dropdown, hover it for the folder layout) — where maps come from:
  - **Bundled images** — the P99 scans in `public/maps/`, needing hand calibration. ~15 zones.
  - **Game maps** — `<EverQuest>/maps/`, the `.txt` maps the game itself draws. Found from the
    log folder in Settings (`<EQ>/Logs`), so there's nothing extra to configure. 133 zones on
    the EQL install, including its custom ones and far more geometry than the P99 scans.
  - **A pack** — any subfolder of `maps/` holding `.txt` files, discovered not hardcoded:
    unzip Brewall's into `maps/Brewall/` (568 zones, the most labels) or Goodurden's into its
    own subfolder and it shows up in the dropdown. The selection persists.

  Every source yields a `Zone[]`, so the picker, `findZone`, pins, kills and layers all work
  against one shape. **Naming is the hard part**: files are named for a zone's *short* name
  (`gfaydark`) and the log only says the long one, so `map-sources.ts` maps them with an alias
  table for the zones we ship images for plus two conservative rules — and shows the file's
  own name (`gukbottom`) for the rest, which stays selectable. It deliberately does not guess:
  looser rules map "Qeynos Hills" onto `qeynos` and "East Commonlands" onto `commonlands`.
- **The EQ map format** (`src/shared/map/eqmap.ts`, pure — `electron/tests/eqmap.test.ts`):
  `L`ine and `P`oint records, parsed into geometry and labelled points. **Its coordinates are
  world coordinates** (x/y negated, the same negation `coords.ts` applies), which is why a
  file-backed zone needs **no calibration**: `vectorProjection` derives the scale and centre
  from the geometry's own world box. Layer `_1` is the points of interest and is read; layer
  `_2` is a compass and the mapmaker's credits drawn as vector text far outside the zone, so
  it isn't drawn — only its labels, shown as attribution under the map.
- **Label filter** (`src/shared/map/poi-kinds.ts` + the 👁 panel's **Map labels** section) — a busy
  zone is mostly labels (Greater Faydark has 144, 85 of them merchants), and which ones matter
  depends on what you're there for, so each **kind** can be switched off. The choice persists.

  Kinds come from **the label's own words**, not from its color. The colors *are* categories — and
  the classifier agrees with them where the packs have a convention (zone lines red, quest givers
  blue/teal, forges purple 487 times out of 628) — but it's a convention each mapmaker keeps their
  own way: zone lines come as both `255,0,0` and `240,0,0`, merchants as `0,128,0` and `0,127,0`,
  and thousands of labels are drawn in the default black. Text is steadier. The color is still shown
  beside each toggle, since that's how you recognise them on screen — and it's the color those
  labels really are *on this map*, not one we assumed.

  A trailing parenthetical is the strongest signal in the corpus and is read before the article,
  because only the brackets separate Brewall's `a reanimating hand (Hunter)` (a spawn on the Hunter
  achievement list) from `a spell research merchant (Research)` (a shopkeeper). Floor labels are
  their own kind, recognised by the same test that drives the floor picker rather than a second
  guess at the same thing. The rows offered are only the kinds a given map actually contains.
- **Floors** (`detectFloors`/`floorAt`/`segmentOnFloor` in `eqmap.ts`) — a vector map holds
  every storey at once, so RunnyEye arrives as five levels of corridor on top of each other.
  The floors are read from the **mapmaker's own labels** (`Level 1 (Top)`, `2nd Floor`), never
  guessed from heights: clustering z would split Greater Faydark's terrain-plus-treetops into
  fake floors, while the real floors are *joined* by their stairs. Labels that merely mention a
  level (`Water - LVL 3`, `TRAP: Fake Floor`) aren't storeys, and a map that labels its floors
  side by side at one height (Kurn's Tower, all eight at `z=1`) is drawn whole. Showing every
  floor stays the default, as in-game; picking one filters geometry and labels, stamps pins and
  pings via the same `layer` field as image layers, and the picker marks the floor your `/loc`
  height puts you on with **· you**. See
  [ADR 0040](../decisions/0040-floors-come-from-the-mapmaker.md).
- **Layers** — some zones only exist as several floor images (RunnyEye Citadel's four). Those
  are several `Zone`s **sharing a `name`**, differing by `key` + `layer`, so the picker lists
  the place **once** (`collapseLayers`) and the layer is a second dropdown beside it. The log
  never says which floor you're on, so a layer is only ever a *choice*: `findZone` defaults to
  the lowest, and markers are layer-scoped **only where a person picked the layer** — pins and
  pings carry one, while your position, peers, kills and roam areas stay zone-wide and draw on
  every layer (`onLayer` treats an unstamped marker as zone-wide, which is also what pins from
  before this shipped are). See [ADR 0037](../decisions/0037-one-zone-many-layers.md).
- **Pins** (`src/shared/map/pins.ts` palette + `MapPanel`/map window) — a toolbar of
  pin kinds (Star/Danger/Camp/Loot/Note) plus a **Move** tool (drag your pins to
  reposition). Pick a kind up, then a map click **drops** it at that spot; with none
  held a click **pings** instead (a click on an existing pin hit-tests first). Each pin
  has a **title** (drawn under it on the map) and a free-text
  **note** (shown on hover); clicking your own pin opens an editor (title / note /
  Remove). Pins persist in `localStorage` (per zone — and per layer where the zone has
  them, stamped with the layer you dropped it on). The **👁 menu** toggles visibility
  by pin kind **and per sharer** (one toggle per peer sending pins). When connected, the
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
- **Mob knowledge** (the 📖 toolbar panel) — what killing things here has taught us:
  **observed drop rates** (kills-that-dropped-it over kills, dimmed until the sample is worth
  trusting — only kills that were yours count, see
  [ADR 0027](../decisions/0027-only-your-kills-count.md)) and **roam areas** (the middle of where a mob died and how far that spreads, with a
  ±button that pins it on the map). Yours is derived from the kill log on demand;
  peers' arrives over the room and is stored separately, so every figure can still say how much
  of it you saw yourself. `src/shared/mob-stats.ts` does the rolling-up and the pooling; see
  [ADR 0024](../decisions/0024-mob-knowledge.md).
- **Kill heatmap** (the ☠ toolbar panel) — where kills happened, drawn from the recorded kill
  log (`electron/kill-log.ts`). Each dot fades and shrinks with **confidence**, and carries the
  marker from `src/shared/kill-confidence.ts` — the same glyph the kill list shows, so a faint
  dot and its row agree. Anything below "approximate" isn't plotted at all: it stays in the
  list, labelled, because an inferred position drawn like a measured one is worse than none.
  Right-click a marker (or use Settings) to hide the markers. Kills someone else landed are
  in the list, named and believed half as much — the position came from *your* `/loc`, and they
  were standing somewhere else.
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
- **The floor in view is never chosen for you.** On a vector map that names its storeys, your
  `/loc` height is enough to say which one you're on — and it's *shown* (**· you** in the
  picker) rather than acted on, because auto-hiding four fifths of a map on an inference is a
  worse failure than a busy map. Nothing derived from the log is filed under a floor: only pins
  and pings, which a person placed while looking at one.
- P99↔EQL map alignment isn't guaranteed; the calibration values are a starting set.
  Re-tuning is done in-app via the dev-only calibration tool (above), then the values
  are hand-copied into `zones.ts` — the tool doesn't persist them itself, deliberately, so
  a map's calibration stays reviewable in git rather than living in one user's store.
- **A map's pixel dimensions are never authored.** They're read off the loaded image, so the
  only hand-written numbers are the two that can't be derived (`scale`, `center`). Five
  bundled zones once carried their image's dimensions in place of a calibration; that's the
  mistake this rules out (see [ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md)).
- The map window doesn't own zone/loc state — it reads the same store/broadcasts as
  the main window.
- **Images** are not bulk-downloaded for the zones they miss: P99's per-zone image naming is
  inconsistent (no reliable map+key pair to auto-pick) and a scan is useless without
  hand-tuned calibration. That's what the **Game maps** source is for — the zones are already
  drawn, on the player's disk. An image zone with no map still links out to P99.
- **Map files are read, never shipped.** The packs are other people's work, sitting in the
  user's own game install; we point at them and credit them, and bundle none of it.
- **Zone short names aren't guessed.** A file we can't confidently name is shown by its file
  name rather than a plausible-looking zone name — see **Sources** above for why a wrong name
  is worse than no name.

## See also
[overlay-ui](../overlay-ui/README.md) · [log-watching](../log-watching/README.md) ·
[data-model](./data-model.md) · [ADR 0010](../decisions/0010-ported-map-core.md) ·
[ADR 0011](../decisions/0011-awari-peer-location-sharing.md) ·
[ADR 0015](../decisions/0015-peer-presence-via-hello.md)
