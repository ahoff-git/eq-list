# Map

## Purpose
Show the current zone's map with the player's live location (and a short movement
trail) plotted on it, in a sibling window opened from the main window's 🗺 button.

## Responsibilities
- **Geometry core** (`src/shared/map/`, ported from the eq-map project — see
  [ADR 0010](../decisions/0010-ported-map-core.md)), pure and DOM-free so it's unit
  tested (`electron/tests/map-coords.test.ts`):
  - `types.ts` — `Loc {y,x}` (EQ order), `Point {x,y}`, `CanvasSize`, `Zone`
    (`size` + `centerOffset` calibration, `mapImg`/`mapKeyImg`).
  - `coords.ts` — `eqToCanvasCoords` / `canvasToEqCoords`, exact inverses; return
    `undefined` for an uncalibrated zone. Math derived in [data-model.md](./data-model.md).
  - `zones.ts` — `baseZones` (P99 classic maps, image paths retargeted to `/maps/…`),
    `findZone` (case/leading-"the "-insensitive, matches the log's zone strings),
    `sortZones`.
- **Drawing** (`src/lib/map/draw.ts`, renderer-only — uses canvas): `drawImageScaled`
  (fit + centre, returns on-screen dims), `drawLine`, `drawCircle`, `clearCanvas`.
- **Location feed** — a `/loc` line (`Your Location is Y, X, Z`) becomes a `LocEvent`
  via `parseLocLine` (`src/shared/log-parser.ts`) and flows through the same
  main→IPC→renderer pipeline as the `zone` event (`watcher.onLoc` → `currentLoc` →
  `CH.locChanged` broadcast → `usePlayerLoc` / `usePlayerTrail`). The **trail** (the line
  between logged positions) is owned by the map window so the toolbar's **∿** button can
  clear it; it also clears itself when you zone, since a `LocEvent` carries no zone and
  the old path would otherwise be drawn across the new map.
- **UI** — `MapPanel` (`src/app/components/MapPanel.tsx`) stacks two square canvases
  (static map + moving overlay), sized to the window via a `ResizeObserver`. A **zoom/
  pan view** (scroll wheel zooms toward the cursor, clamped 1–`MAX_ZOOM`) is layered on
  top of the pure coord math and inverted for the cursor→EQ **readout** and hit-testing.
  The map **window** (`src/app/map/page.tsx`, route `/map`) follows the current zone by
  default with a dropdown to view any mapped zone (and `map.openAt(zone)` / the
  `mapViewZone` event let a clickable location elsewhere point it at a zone — with a
  coordinate it also drops a marker pin there); created on
  demand by `createMapWindow`. A hand-picked zone is an **override** that persists —
  but only until the log says you actually **zoned**, which clears it so the map goes
  back to following you (otherwise one dropdown pick silently stops it forever). The
  **follow** checkbox beside the dropdown governs that, on by default; turn it off to
  keep studying one map while you travel. The
  title bar carries a **pin** (per-window always-on-top, via the shared `PinButton`), a
  **key** toggle (the zone's `mapKeyImg` beside the map, **zoomable** — `MapKey`: scroll
  to zoom toward the cursor, drag to pan, double-click to reset, since the key scans are
  unreadable at sidebar width), and — with Debug logging on — the 📐 calibration toggle. A zone with
  **no configured map** (most of eqlwiki's ~117 zones — only ~14 are bundled + calibrated)
  shows a clear empty panel: it names the zone, notes saved markers appear once it's
  mapped, and offers a **View on Project 1999** button (`map.openP99` → the zone's P99 map
  page in the browser). Such zones stay selectable in the dropdown, flagged "(no map)".
- **Calibration** (dev-only) — `src/shared/map/calibration.ts` (pure: `nudgeZone`,
  `nextStep`, `calibrationValues`) + `src/lib/map/useCalibration.ts` (keyboard hook).
  With the tray's **Debug logging** on, a **📐 toggle** appears in the map titlebar;
  clicking it enters calibration mode: a **coordinate grid** (dots at fixed EQ coords,
  origin highlighted) overlays the map, W/A/S/D resize, I/J/K/L offset the centre, −/=
  change the step (shown in the panel); the live zone mutates so the grid/dot slides as
  you tune, and the panel shows the paste-ready `size`/`centerOffset` for `zones.ts`.
  This is how you align a P99 map to an EQL zone or add a new one.
- **Pins** (`src/shared/map/pins.ts` palette + `MapPanel`/map window) — a toolbar of
  pin kinds (Star/Danger/Camp/Loot/Note) plus a **Move** tool (drag your pins to
  reposition). Pick a kind up, then a map click **drops** it at that spot; with none
  held a click **pings** instead (a click on an existing pin hit-tests first). Each pin
  has a **title** (drawn under it on the map) and a free-text
  **note** (shown on hover); clicking your own pin opens an editor (title / note /
  Remove). Pins persist in `localStorage` (per zone). The **👁 menu** toggles visibility
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
- P99↔EQL map alignment isn't guaranteed; the calibration values are a starting set.
  Re-tuning is done in-app via the dev-only calibration tool (above), then the values
  are hand-copied into `zones.ts` — the tool doesn't persist them itself.
- The map window doesn't own zone/loc state — it reads the same store/broadcasts as
  the main window.
- Maps are **not bulk-downloaded** for the missing ~100 zones: P99's per-zone image
  naming is inconsistent (no reliable map+key pair to auto-pick) and, more importantly,
  a bundled image is useless without hand-tuned calibration. So unmapped zones link out
  to P99 instead; adding a zone is a deliberate step (grab its image → calibrate).

## See also
[overlay-ui](../overlay-ui/README.md) · [log-watching](../log-watching/README.md) ·
[data-model](./data-model.md) · [ADR 0010](../decisions/0010-ported-map-core.md) ·
[ADR 0011](../decisions/0011-awari-peer-location-sharing.md) ·
[ADR 0015](../decisions/0015-peer-presence-via-hello.md)
