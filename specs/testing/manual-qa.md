# Manual QA checklist

Features that are **built, typechecked and unit-tested, but not yet exercised for real** — in the
game, on a Windows install, or across two clients. The dev sandbox can't run these; confirm each on
a real run. This is a *verification* list, not open work — open work lives in [../todo.md](../todo.md).

## In-game — one client

- **Damage meter, live.** The parser was validated against a whole real log (0 unmatched combat
  lines) and the tracker against that log's numbers, but confirm in-game: the Damage tab fills while
  fighting, your and your pet's rows are the highlighted ones, and DPS looks sane for a long fight.
  Crucially, confirm a **laggy/kited fight isn't split** — a lull with the mob still up keeps one
  fight (the "This fight" totals don't reset), and it's only the mob dying that starts the next one
  ([ADR 0036](../decisions/0036-a-fight-ends-on-death-not-a-lull.md)). See
  [ADR 0014](../decisions/0014-damage-meter-from-the-log.md).
- **Damage breakdown, live.** Click a Dealt row and confirm the **Melee / Spells / Special** groups
  open, Melee + Spells sum to the row's total, weapons read sensibly (Hit / Crush / Kick / Pierce
  for a beastlord), and `(Critical)` / `(Riposte)` show under Special. See `combat-stats.ts` and the
  `DamageMeter` note in [../overlay-ui/README.md](../overlay-ui/README.md).
- **Camp analytics, live.** Confirm in-game: XP/hour and **time to level** (the tile asks for your
  current XP% on first use, then keeps itself current and resets when you level), **downtime**
  looking plausible for a real session, the per-mob table ranking sensibly, and the per-zone table
  filling in as you move camps. Also the Damage tab's additions: the per-second sparkline, the death
  recap, pet share, the ★ personal-best flag, and **Copy**. See
  [ADR 0017](../decisions/0017-camp-efficiency-and-asking-the-player.md).
- **Spell table + history, live.** Confirm the **Spells** view fills as you cast (cast times land in
  the 1–3s range, resist % rises on a resistant mob, melee shows as its own row and the numbers add
  up to your total), and that **History** lists tonight's session, drills into individual fights, and
  is still there after restarting the app. Ranked spells ("Shock of Lightning VI") must appear as
  **one** row, not two. See [ADR 0016](../decisions/0016-combat-history-and-spell-analytics.md).
- **Loot tab, live.** Confirm the Loot tab shows drops that landed **before** it was opened, keeps
  them **across a restart**, and follows live ones (`electron/loot-log.ts`).
- **Ping animation + zone follow.** Confirm your own map click shows an animated gold ping locally,
  and that actually zoning in-game clears a hand-picked zone override so the map follows you again.
- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region select → capture →
  Tesseract OCR accuracy → fuzzy match. First OCR downloads the English model (needs network); tune
  the crop / text cleanup if accuracy is poor.
- **Map window, real run.** Confirm the map window opens (🗺 button), draws the zone image, and plots
  the player dot on a `/loc` line. The calibration model changed
  ([ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md)), so every bundled map's
  alignment moved by up to 2% — worth a look at a zone you know well (Greater Faydark, Crushbone)
  before trusting the dot.
- **The game's own maps, drawn (source dropdown).** Verified against the real install in the
  dev sandbox — sources discovered, every test `/loc` landing on the map — but never seen on
  screen. Confirm: the leftmost titlebar dropdown lists **Bundled images**, **Game maps** and
  **Brewall** with zone counts; hovering it explains the folders; switching redraws the zone
  and the choice survives reopening the window. Then the things only eyes can check — geometry
  looks like the zone (not mirrored or upside down: walk and confirm the dot moves the way you
  do), labels are legible without swamping the map, your dot sits where you actually are, and
  a pin dropped on a vector map lands where you clicked. Compare a zone against its bundled
  image to be sure both agree about where you are
  ([ADR 0039](../decisions/0039-render-the-game-s-own-maps.md)).
- **Drag to pan, without pinging.** Zoom in, then drag the map around: it should follow the
  cursor and stop at each edge rather than sliding off into blank space. The bit that needs a
  human is the button-sharing — with peers connected, confirm a **drag never leaves a ping**
  behind, a **plain click still does**, a drag with a pin held doesn't drop one, and Move mode
  still drags pins rather than the map. Then the case that was broken: **at fit zoom** (scrolled
  all the way out) the map can't move, and dragging it must *still* not ping.
- **The map's other window controls.** Confirm the map's **minimize** works, its **A− / A+** go
  above 100% (up to 200%) and stay legible there, and that a **vector** map keeps zooming well past
  the 6× an image stops at (30×) without the lines going to mush. The **move tool** (✥) should be
  clearly visible in the toolbar rather than black-on-black.
- **Calibrate by clicking (📐).** The two-click flow is unit-tested but has never met a real `/loc`.
  With Debug logging on, open a zone that ships **uncalibrated** (RunnyEye Citadel, Northern Desert
  of Ro — the dot won't plot at all until this is done), hit 📐, then: `/loc`, click where you are,
  walk somewhere far, `/loc`, click again. Confirm the numbered crosses land where you clicked, the
  dot snaps onto you once the second fix lands, the values in the panel look sane (EQ units per
  pixel, and a centre near the middle of the zone), and the copy button gives something that pastes
  into `zones.ts`. Then check a *known-good* zone: one fix on a calibrated map should nudge it onto
  your position without wrecking the scale.
- **Multi-layer zone, in RunnyEye.** Two forms, and both want checking:
  - **Bundled images** — confirm the zone appears **once** in the dropdown, the layer dropdown
    switches floors, a pin dropped on one floor doesn't show on the others, and zoning in from
    outside lands you on Layer 1 ([ADR 0037](../decisions/0037-one-zone-many-layers.md)).
  - **Brewall** — the floor picker should read the mapmaker's names (`Level 1 (Top)` …
    `Level 5 (Bottom)`) with **All floors** as the default. Rendering the five floors side by
    side already confirms each is a legible plan, so what's left is in-game: that **· you**
    marks the floor you're actually standing on as you descend, that stairs appear on both
    floors they join, and that a pin dropped while one floor is showing doesn't appear on the
    others ([ADR 0040](../decisions/0040-floors-come-from-the-mapmaker.md)).
- **Cast-alert overlay, over the game.** With cast alerts on, confirm the banner + flash appear
  in the **click-through overlay on top of the game** (not just the app window), that clicking where
  the banner is still clicks the game beneath it, that the **beep** fires (even as the first alert
  after launch, and while the main window is hidden to tray), and that a groupmate casting a watched
  spell stays quiet until that watch's **players** toggle is on. Turning cast alerts off should make
  the overlay window go away. See [ADR 0035](../decisions/0035-cast-alert-overlay-window.md).
- **Alert style options.** In Settings → Alert style, confirm each takes effect (Test alert):
  **colour** tints both banner border and flash; the **sound** picker's Preview plays and the chosen
  beep is what fires; **position** moves the banner (all six spots); **motion** (pulse/wiggle/float/
  none) changes it; **duration** changes how long it lingers; and on a multi-monitor rig the
  **monitor** dropdown moves the overlay to the chosen display (it recreates on change).

- **Per-alert styles, and the monitor that wouldn't move.** Give one watch its own style (🎨) and
  leave another on the defaults, then confirm each fires in its own color/position/motion/duration
  and with its own beep — including two at once landing in **different corners**. Then the bug that
  prompted it: change the **monitor** and confirm the overlay moves *immediately*, with no other
  setting touched, and that the banner is the right size on a secondary or HiDPI screen (it used to
  inherit the primary display's dimensions).
- **Fade alerts.** Tick **fades** on a watch and confirm the banner reads "X faded" with the
  re-cast hint when your spell wears off — on you, on your pet, and on a mob you cast it at (three
  different log lines). Also confirm somebody **gating out** ("Bunnyslayer fades away.") never
  fires one, and that a buff whose fade EQ words per spell ("Your strength fades.") matches a
  watch on those words.
- **Separate map scale.** Confirm the map window's A− / A+ move **only** the map and the main
  window's move only the main window (this was broken: Chromium's zoom is per-origin, so one number
  won for both — [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md)). At
  every scale below 100%, check **no gap** appears at the bottom or right of either window — the
  shells size in percentages now, and a `vh` length would come up short. Both values should survive
  a restart.
- **Maximize / restore, both windows.** Our windows are frameless *and transparent*, which is
  the combination Electron is historically twitchy about when maximized, so this wants eyes on
  Windows: the ▢ button should fill the work area **without covering the taskbar**, ❐ should
  restore to the previous size and position, and the corners/border should square off while
  maximized rather than leaving notches of desktop. Then the state-tracking: maximize by other
  means (**Win+↑**, double-clicking the titlebar, the taskbar) and confirm the glyph still
  flips; leave a window maximized, restart, and confirm it opens maximized *and* that ❐ then
  restores to a sensible size; check **Reset window position** un-maximizes. The cast-alert
  overlay must have **no** such button and stay click-through throughout.

## Peer networking — two clients

- **Connected users, two clients.** With peer networking on, confirm the 👥 panel lists the other
  client (name from its `hello`, not a peer id), that a peer connected *without* location sharing
  still appears, that the row's zone button jumps the map there, and that leaving removes the row.
  See [ADR 0015](../decisions/0015-peer-presence-via-hello.md).
- **Peer networking (awari) — run, and repaired.** Two clients were driven end to end (join,
  presence by name, pings, live location, kill positions, pooled drop rates); five bugs found and
  fixed, see [ADR 0028](../decisions/0028-peer-networking-verified-and-repaired.md). Still unverified
  by hand: that the connection survives **closing the map window** (reopening still shows peers), and
  that toggling "Connect" off leaves the room. Untested with more than two clients — the cold-start
  recovery is bounded and won't reconcile a room that splits two-and-two.

## Packaged build & distribution

- **Packaged build.** Run `npm run dist` and confirm the installed app works: Tesseract assets load
  from `asar.unpacked`, the renderer loads over `app://` from the asar, and the `eqlist://` deep link
  launches/focuses the app.
- **CI build — verify first run.** `.github/workflows/build-windows.yml` auto-builds the installer
  and publishes it to the rolling `latest` release on every push to `main`
  ([ADR 0013](../decisions/0013-ci-rolling-latest-windows-build.md)). The gate steps all pass locally
  on Node 22. Still to confirm on a real run: `electron-builder` succeeds on the runner, the `latest`
  tag moves, and `/releases/latest` resolves to the `.exe`.
- **Update notification.** On a packaged build, confirm the banner appears when `latest` has moved
  past the installed commit, **Download** opens the release page, **✕** dismisses, and the same build
  isn't flagged again while the next one still is. See
  [ADR 0034](../decisions/0034-update-notification.md).
