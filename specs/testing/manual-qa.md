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
- **Money, live — the one to check line-by-line.** Coin is now counted in two ledgers
  ([ADR 0047](../decisions/0047-money-is-copper-in-two-ledgers.md)) and the grammar came from a real
  log this sandbox can't re-read, so the first real session is the verification. Confirm, in order:
  the Session tab's **From corpses** matches the coin you actually picked up (add the "You receive …
  from the corpse" lines by hand for one camp), **From sales** matches the auto-sells, and neither
  is double the other — a doubled **From sales** means the "from that item" line is being counted
  alongside the loot line, which is the specific failure this design guards against. Then the camp
  report's per-mob **Coin** column: it should credit the mob you were looting, so kill two different
  mobs, loot one, and check the coin didn't land on the other. Finally the Loot tab's **What it
  sells for** table — a stack's "Each" must be the line price divided by the stack, not the line
  price. Coin/hour on the Session tab is only as good as those two totals.
- **Ping animation + zone follow.** Confirm your own map click shows an animated gold ping locally,
  and that actually zoning in-game clears a hand-picked zone override so the map follows you again.
- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region select → capture →
  Tesseract OCR accuracy → fuzzy match. First OCR downloads the English model (needs network); tune
  the crop / text cleanup if accuracy is poor.
- **Map window, real run.** Confirm the map window opens (🗺 button), draws the zone, and plots the
  player dot on a `/loc` line.
- **The game's own maps, drawn (source dropdown).** Verified against the real install in the
  dev sandbox — sources discovered, every test `/loc` landing on the map — but never seen on
  screen. Confirm: the leftmost titlebar dropdown lists **Game maps** and **Brewall** with zone
  counts (and *nothing* if no EverQuest install is found, with the window
  saying so); hovering it explains the folders; switching redraws the zone and the choice survives
  reopening the window. Then the things only eyes can check — geometry
  looks like the zone (not mirrored or upside down: walk and confirm the dot moves the way you
  do), labels are legible without swamping the map, your dot sits where you actually are, and
  a pin dropped on a vector map lands where you clicked. Compare a zone against its bundled
  ([ADR 0039](../decisions/0039-render-the-game-s-own-maps.md)). There's no bundled image to
  compare against any more ([ADR 0042](../decisions/0042-only-the-game-s-own-maps.md)), so the
  in-game map is the reference — remembering that the game's own window may be rotated to your
  heading while ours is always north-up.
- **Drag to pan, without pinging.** Zoom in, then drag the map around: it should follow the
  cursor and stop at each edge rather than sliding off into blank space. The bit that needs a
  human is the button-sharing — with peers connected, confirm a **drag never leaves a ping**
  behind, a **plain click still does**, a drag with a pin held doesn't drop one, and Move mode
  still drags pins rather than the map. Then the case that was broken: **at fit zoom** (scrolled
  all the way out) the map can't move, and dragging it must *still* not ping.
- **Zone names and the type-to-find picker.** The names are solved from the maps' own exit labels
  and spot-checked in the sandbox (87 of the game's 133 zones, every one I could verify correct),
  but only a player knows whether they read right — check a few against the zone you're standing in,
  and that the picker's file-name column matches. Then the box itself: typing narrows, ↑↓ and Enter
  pick, Escape closes, **Follow current** is the first row and still works, and a zone that couldn't
  be named is findable by typing its file name (`gukbottom`). Names arrive a beat after the window
  opens — confirm the list relabels itself rather than staying on file names.
- **Hovering and clicking the map's markers.** The pick logic is unit-tested but has never met a
  cursor. Confirm a tooltip appears for each kind — a **kill** (mob, time, drops, and how much to
  trust the position), the **player dot**, a **peer**, a **ping**, a **map label**, a **pin** — and
  that it follows the cursor without flicker. Then the crowded case: stand where a pin sits on top of
  a kill dot and confirm the **pin** wins, and that a marker plainly nearer the cursor wins
  regardless. Clicking a kill should open the ☠ list filtered to that mob (and narrow the heatmap to
  it); clicking any marker must **not** leave a ping behind, while clicking empty map still does.
- **Kill list → map emphasis.** Open the ☠ list and run the cursor down it: hovering a **mob row**
  should ring all of that mob's dots on the map (and dim the rest), hovering an **individual kill**
  should ring only that one, and moving between them should swap cleanly without flicker. Then the
  case that needed a backstop: leave the list from *inside* an expanded kill row and confirm the
  emphasis clears rather than sticking. On a camp with hundreds of kills, check the ring still reads
  at a glance and that the dimming doesn't make the heatmap look empty.
- **Hunt tab → map emphasis** (two windows). With the map open on a zone you've camped, run the
  cursor down the Hunt tab's mob rows: a mob you've killed here should ring its dots. Then the three
  cases that must do **nothing at all** — a mob from another zone, a mob you've never killed, and
  the map window closed (it must not open). Confirm nothing dims in those cases, since a map that
  greys out to say "no" is worse than one that ignores you. Check a mob the wiki names with an
  article ("a gnoll pup") still rings the kill log's own spelling. Finally the backstop: hover a row,
  switch tabs without leaving the row, and confirm the map clears rather than staying lit.
- **Map label filter (👁).** On a busy zone (Greater Faydark, a Brewall dungeon) confirm each kind
  switches off and on, that a **section heading** switches its whole group and shows a dash when only
  part of it is on, that the counts match what's drawn, that the swatch beside each row is the color
  those labels actually are on screen, and that the choice survives reopening the window. The
  classification is unit-tested against the whole corpus but the *sections* aren't: check the panel
  reads top-to-bottom without scrolling past what you came for, and that turning off *Doors & traps*
  or *Who's here* leaves a map you'd actually navigate by
  ([ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md)).
- **The map's other window controls.** Confirm the map's **minimize** works, its **A− / A+** go
  above 100% (up to 200%) and stay legible there, and that a **vector** map keeps zooming well past
  the 6× an image stops at (30×) without the lines going to mush. The **move tool** (✥) should be
  clearly visible in the toolbar rather than black-on-black.
- **Multi-floor zone, in RunnyEye.** The 👁 panel's **Floors** section should read the mapmaker's
    names (`Level 1 (Top)` … `Level 5 (Bottom)`) with all five checked by default, and the titlebar's
    **⌂** should say `all` / `2/5`. Rendering the five floors side by side already confirms each is a
    legible plan, so what's left is in-game: that **· you** marks the floor you're actually standing
    on as you descend, that stairs appear on both floors they join, that a pin dropped while **one**
    floor is showing doesn't appear on the others, and that a pin dropped with **several** showing
    appears on all of them (there's no one storey it could belong to)
    ([ADR 0040](../decisions/0040-floors-come-from-the-mapmaker.md),
    [ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md)). Two non-adjacent floors
    checked (1 and 3) should leave the middle one out rather than filling the gap.
- **Height window, on a zone with no labelled floors.** Most maps have none, so the 👁 panel offers
    **Height** instead — two handles over the zone's own z span. In a zone with real vertical
    structure (a tower, a zone with caves under it) confirm dragging them isolates a level you'd
    recognise, that the readout matches your `/loc` z, that **all** restores the whole map, and that
    travelling to another zone drops the window rather than carrying a meaningless height across
    ([ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md)).
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
- **Custom alert spots.** In Settings → Alert style → Custom spots, click **Place a spot**: the
  overlay should dim, show "Click where alerts should appear", and a preview banner should track the
  cursor on the chosen monitor. A click adds a named spot (Esc cancels); it then appears in the
  **Position** dropdown (defaults and per-watch). Pick it and Test — the banner lands where you
  placed it. Deleting the spot while a watch still references it should fall that alert back to the
  top, not drop it. See [ADR 0045](../decisions/0045-place-a-custom-alert-spot.md).

- **Per-alert styles, and the monitor that wouldn't move.** Give one watch its own style (🎨) and
  leave another on the defaults, then confirm each fires in its own color/position/motion/duration
  and with its own beep — including two at once landing in **different corners**. Then the bug that
  prompted it: change the **monitor** and confirm the overlay moves *immediately*, with no other
  setting touched, and that the banner is the right size on a secondary or HiDPI screen (it used to
  inherit the primary display's dimensions).
- **Windows reopen the size you left them.** Size and place the main window (and the map), quit via
  the tray, relaunch, and confirm both come back **exactly** as they were. Worth repeating three or
  four times on a **mixed-DPI** desktop with the window on the scaled monitor: the size used to be
  multiplied by that monitor's scale factor on every launch, so the window grew until it filled the
  screen. Also check a window left **maximized** reopens maximized, and restores down to the size it
  had before — not to some default.
- **Fade alerts.** Tick **fades** on a watch and confirm the banner reads "X faded" with the
  re-cast hint when your spell wears off — on you, on your pet, and on a mob you cast it at (three
  different log lines). Also confirm somebody **gating out** ("Bunnyslayer fades away.") never
  fires one, and that a buff whose fade EQ words per spell ("Your strength fades.") matches a
  watch on those words.
- **Line alerts.** Add the **Party invite** suggestion (or tick **line** on a watch reading "invites
  you"), have someone invite you, and confirm the banner shows the game's own sentence with the 💬
  icon and no "dispel!" hint. The *matching* is already settled — a real log was replayed through
  `matchLine` and every phrase in the "Said to you" chips hits what it should and nothing else
  ([ADR 0050](../decisions/0050-a-watch-can-read-a-whole-log-line.md)) — so what's left is the
  banner on screen, over the game, at the moment the invite arrives. `npm run sim` fires one from
  the fixture if nobody's around to invite you. Also worth feeling out the practical cost of a broad
  watch: **tells you** fired 123 times in two weeks of real play, which is a beep and a banner each
  — check whether that's welcome or wants a cooldown (still open in that ADR).
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
- **Startup state — launch the app while already playing.** Log in, camp somewhere, type `/loc`,
  *then* start the app: it should open already knowing the zone (map drawn, "here" panels scoped)
  and showing your last position, with **no** phantom kills, experience, loot matches or cast alerts
  from the backlog ([ADR 0043](../decisions/0043-state-is-not-news-either.md)). Verified against a
  real 4.9MB log outside the app (recovered `Blackburrow 2 (Adaptive)` and the last `/loc`, zero
  other events); what's unverified in-game is the *renderer* end — including a map window opened
  after startup, which reads the state over `zone:get`/`loc:get` rather than from a live event.
  Also worth trying with two characters: switch to one who was logged in before the app started and
  confirm the zone follows them.
- **Nothing is lost while the app is closed.** The behaviour that makes state independent of launch
  order ([ADR 0044](../decisions/0044-the-log-position-outlives-the-app.md)), and the one thing here
  that a real run can judge better than a test: **does the catch-up feel right, or does it feel like
  the app is inventing things?** Quit the app mid-camp, keep playing for a few pulls, reopen it, and
  confirm those kills, drops and experience gains are all there **once** — the ☠ list and the heatmap
  count them, the Loot tab shows them, "into level" has moved — and that **no cast alerts** fire for
  the fights you had while it was closed. Then the meter's own rule: reopening within a few minutes
  should **keep** the session's running totals, while reopening the next evening should start a fresh
  session with last night's fights in **History** instead. Worth checking the numbers add up rather
  than double: kill counts and a drop rate you already know are the places a repeat would show.
  Finally, delete `log-cursors.json` from userData and confirm the next start simply anchors at the
  end of the log (missing the gap) rather than eating the whole thing.

- **Travel — the 🧭 panel, unseen.** The graph, the routing and the refusals are unit-tested and the
  main-process path was exercised directly (build, cache, all four refusals, the druid toggle changing
  the answer), but **nothing about the panel has been looked at** — the dev sandbox is headless. To
  confirm: it opens from the map toolbar and remembers being open; **From** defaults to your zone and
  **To** to the map you're viewing; a zone in the route shows that zone's map; the three checkboxes
  persist (they're `Settings.travel`) and changing one re-asks for the route.

  The layout is what to look at hardest, because it's what was reported wrong and the fix was reasoned
  from the CSS rather than seen: a zone picker's dropdown must open **over the map**, not be clipped at
  the panel's edge, and must not run off the left of the window; the From/To row must **stay put** while
  a long route scrolls under it; and the panel must take about 45% of the window at **any** map font
  scale, including above 100% (that was a `vh` unit being scaled by the root `zoom` — the same trap
  `.app` documents). Worth resizing the window narrow and wide with a long route showing.

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
- **Our own ICE servers.** We now pass Google STUN + Open Relay TURN instead of PeerJS's defaults
  ([ADR 0046](../decisions/0046-our-own-ice-servers-not-peerjs-defaults.md)). Nothing about this can
  be unit-tested — ICE only means anything against real WebRTC between two real peers. To confirm:
  with Debug logging on, the awari log names the providers in use; two clients still join and share;
  and the WebRTC log no longer shows `net::ERR_NAME_NOT_RESOLVED` for `*.turn.peerjs.com`. The part
  that actually needs *two networks* (not two processes on one machine) is whether the relay carries
  peers behind **symmetric NAT** — that's the whole reason Open Relay is in the list, and it's the
  one claim a single-machine run can't check. Open Relay is best-effort and rate-limited, so if it
  is down, expect symmetric-NAT peers to fail while LAN peers are fine.

## Packaged build & distribution

- **Packaged build.** Run `npm run dist` and confirm the installed app works: Tesseract assets load
  from `asar.unpacked`, the renderer loads over `app://` from the asar, and the `eqlist://` deep link
  launches/focuses the app.
- **CI build — verify first run.** `.github/workflows/build-windows.yml` auto-builds the installer
  and publishes it to the rolling `latest` release on every push to `main`
  ([ADR 0013](../decisions/0013-ci-rolling-latest-windows-build.md)). The gate steps all pass locally
  on Node 22. Still to confirm on a real run: `electron-builder` succeeds on the runner, the `latest`
  tag moves, and `/releases/latest` resolves to the `.exe`.
- **Build number — verify first run.** Each run stamps `0.1.<run number>` before packaging
  ([ADR 0064](../decisions/0064-every-build-has-a-number.md)). On a real run, confirm the installer's
  filename carries that version, the release body's `version:` line matches it, the installed app's
  `app.getVersion()` agrees, and the *next* run's number is higher.
- **Update notification.** On a packaged build, confirm the banner names a version higher than the
  installed one, **Download** opens the release page, **✕** dismisses, and the same build isn't
  flagged again while the next one still is. The case worth staging deliberately: install a build,
  then publish (or hand-edit a test release to announce) a *lower* version — nothing should appear.
  See [ADR 0064](../decisions/0064-every-build-has-a-number.md).
