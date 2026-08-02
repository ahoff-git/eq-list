# Manual QA checklist

Features that are **built, typechecked and unit-tested, but not yet exercised for real** — in the
game, on a Windows install, or across two clients. The dev sandbox can't run these; confirm each on
a real run. This is a *verification* list, not open work — open work lives in [../todo.md](../todo.md).

## In-game — one client

- **Damage meter, live.** The parser was validated against a whole real log (0 unmatched combat
  lines) and the tracker against that log's numbers, but confirm in-game: the Damage tab fills while
  fighting, "This fight" flips to "Last fight" after a lull, your and your pet's rows are the
  highlighted ones, and DPS looks sane for a long fight. See
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
  the player dot on a `/loc` line. If a P99 map doesn't line up, re-tune it with the in-app
  calibration tool (enable Debug logging in the tray).
- **Cast-alert overlay, over the game.** With cast alerts on, confirm the banner + red flash appear
  in the **click-through overlay on top of the game** (not just the app window), that clicking where
  the banner is still clicks the game beneath it, that the **beep** fires (even as the first alert
  after launch, and while the main window is hidden to tray), and that a groupmate casting a watched
  spell stays quiet until that watch's **players** toggle is on. Turning cast alerts off should make
  the overlay window go away. Note the known limits: primary display only, and exclusive-fullscreen
  may hide any overlay. See [ADR 0035](../decisions/0035-cast-alert-overlay-window.md).

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
