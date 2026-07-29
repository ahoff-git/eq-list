# Todo

Open work only. Delete an item when it's done and record the outcome where it
belongs (ADR, README, or code).

_Needs a real run to confirm (built, typechecked, unit-tested, but not yet exercised
in-game):_

- **Damage meter, live.** The parser was validated against a whole real log (0 unmatched
  combat lines) and the tracker against that log's numbers, but confirm in-game: the
  Damage tab fills while fighting, "This fight" flips to "Last fight" after a lull, your
  and your pet's rows are the highlighted ones, and DPS looks sane for a long fight.
  See [ADR 0014](./decisions/0014-damage-meter-from-the-log.md).
- **Camp analytics, live.** Confirm in-game: XP/hour and **time to level** (the tile asks
  for your current XP% on first use, then keeps itself current and resets when you level),
  **downtime** looking plausible for a real session, the per-mob table ranking sensibly,
  and the per-zone table filling in as you move camps. Also the Damage tab's additions:
  the per-second sparkline, the death recap, pet share, the ★ personal-best flag, and
  **Copy**. See [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md).
- **Spell table + history, live.** Confirm the **Spells** view fills as you cast (cast
  times land in the 1–3s range, resist % rises on a resistant mob, melee shows as its own
  row and the numbers add up to your total), and that **History** lists tonight's session,
  drills into individual fights, and is still there after restarting the app. Ranked
  spells ("Shock of Lightning VI") must appear as **one** row, not two. See
  [ADR 0016](./decisions/0016-combat-history-and-spell-analytics.md).
- **Connected users, two clients.** With peer networking on, confirm the 👥 panel lists
  the other client (name from its `hello`, not a peer id), that a peer connected *without*
  location sharing still appears, that the row's zone button jumps the map there, and
  that leaving removes the row. See [ADR 0015](./decisions/0015-peer-presence-via-hello.md).
- **Ping animation + zone follow.** Confirm your own map click now shows an animated
  gold ping locally, and that actually zoning in-game clears a hand-picked zone override
  so the map follows you again.
- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region
  select → capture → Tesseract OCR accuracy → fuzzy match. First OCR downloads the
  English model (needs network); tune the crop / text cleanup if accuracy is poor.
- **Packaged build.** Run `npm run dist` and confirm the installed app works:
  Tesseract assets load from `asar.unpacked`, the renderer loads over `app://` from
  the asar, and the `eqlist://` deep link launches/focuses the app.
- **Map window, real run.** Confirm the map window opens (🗺 button), draws the zone
  image, and plots the player dot on a `/loc` line. If a P99 map doesn't line up,
  re-tune it with the in-app calibration tool (enable Debug logging in the tray).
- **Peer networking (awari), real run.** With "Connect to the peer-to-peer network"
  on, confirm two clients join via the bootstrap-service; that clicking the map pings
  the other (a gold named marker in the *viewed* zone); that "Share my location" adds
  live green dots; that the connection now lives in the **main window** and survives
  **closing the map window** (reopening the map still shows peers); and that toggling
  "Connect" off leaves the room. Needs real network + WebRTC (unavailable in the dev
  sandbox). See [ADR 0012](./decisions/0012-awari-connection-owned-by-main-window.md).

_Zones:_

- **Add maps for the zones actually being played.** A real log showed visits to East
  Commonlands, The Estate of Unrest, New Sebilis Expedition and the EQL Tutorial —
  none of which have a bundled map, so the map window falls back to the P99 link. Each
  needs an image plus hand calibration (📐), see [map](./map/README.md).

_Distribution wiring:_

- **CI build — verify first run.** `.github/workflows/build-windows.yml` auto-builds the
  installer and publishes it to the rolling `latest` release on every push to `main`
  ([ADR 0013](./decisions/0013-ci-rolling-latest-windows-build.md)). The first run failed
  at the `npm test` gate (runner was on Node 20, which doesn't expand the test glob — now
  pinned to Node 22); the gate steps all pass locally on Node 22. Still to confirm on a
  real run: `electron-builder` succeeds on the runner, the `latest` tag moves, and
  `/releases/latest` resolves to the `.exe`. Not exercisable in the dev sandbox.
- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download →
  `/releases/latest`, Launch → `eqlist://open`) and the Download target is now populated
  by CI. Remaining: **host** the static page somewhere (e.g. GitHub Pages). Optional:
  point Download straight at `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown
  publisher". Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.

_UI:_

- **Text-size +/− buttons.** Not everyone wants the same size text. `overlay.fontScale`
  (0.8–1.6) already exists in settings and is applied by the renderer — this is about
  putting +/− controls somewhere obvious (titlebar next to the opacity toggle?) instead of
  only a Settings slider.

_To discuss:_

- **OCR beyond item lookup.** The app already ships Tesseract for the screengrab item
  lookup (`electron/ocr.ts`, `electron/lookup.ts`), so reading numbers off the game UI is
  plausible — the obvious candidates are the **experience bar** (which would remove the
  one figure we have to ask the player for, see
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md)) and **HP/mana**,
  which would unlock "how close was that" and damage-per-mana. Worth a conversation first:
  it needs a user-calibrated screen region per UI layout, it's fragile across resolutions
  and UI mods, and a wrong number read confidently is worse than a blank. Decide whether
  it's opt-in calibration or not worth the fragility.
- Create a reusable feature that lets the overlay ask the user for information, then uses that info in calculations.
- Feature from EQ-Map to create a kill heatmap. Can use the above feature to request the user call /loc to record the location of the kill 