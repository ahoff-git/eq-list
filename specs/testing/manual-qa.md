# Manual QA checklist

Features that are **built, typechecked and unit-tested, but not yet exercised for real** — in the
game, on a Windows install, or across two clients. The dev sandbox can't run these; confirm each on
a real run. This is a *verification* list, not open work — open work lives in [../todo.md](../todo.md),
features for later in [../ideas.md](../ideas.md).

## In-game — one client

- **Damage meter, live.** The parser was validated against a whole real log (0 unmatched combat
  lines) and the tracker against that log's numbers, but confirm in-game: the Damage tab fills while
  fighting, your and your pet's rows are the highlighted ones, and DPS looks sane for a long fight.
  Crucially, confirm a **laggy/kited fight isn't split** — a lull with the mob still up keeps one
  fight (the "This fight" totals don't reset), and it's only the mob dying that starts the next one
  ([ADR 0036](../decisions/0036-a-fight-ends-on-death-not-a-lull.md)). See
  [ADR 0014](../decisions/0014-damage-meter-from-the-log.md).
- **Party scoping, live — the group lines are the unverified part.** The meter now counts only
  your party's fights ([ADR 0067](../decisions/0067-the-meter-counts-your-party-s-fights.md)),
  and the roster is read off group lines whose wording this sandbox has never seen: only
  "Bunnyslayer invites you to join a group." appears in a real EQL log. So in a group, confirm
  the log's actual words for someone **joining**, **leaving**, being **removed** and the group
  **disbanding**, and that `parseParty` matches them (paste the line into
  `electron/tests/party.test.ts` if not). Then, at a **shared camp**, confirm the tab shows your
  group and your mobs and *not* the group next door, that a group-mate's row appears (it should,
  even before anyone speaks, as long as you're on the same mob), and that the Session tab's kill
  count doesn't creep while somebody else farms nearby.
- **A named pet, live — the engage line is the whole unverified part.**
  ([ADR 0077](../decisions/0077-a-pet-is-proven-not-guessed.md).) Every pet in this sandbox's sample
  log is a warder, written possessively, so **no real EQL log here contains a pet attack
  confirmation** — the wording is taken from a neighbour's parser, not observed by us. With a
  magician or necromancer pet: order it onto something and confirm the log's actual words for the
  confirmation (we expect `Garn told you, 'Attacking a coyote Master.'`, and accept `tells` too). If
  it differs, paste the line into `electron/tests/pet-registry.test.ts` and widen `PET_ENGAGE_RE`.
  Then confirm the pet's row appears **highlighted as yours** and its damage is in `yourDealt` —
  before this, a named pet's whole fight was dropped, so the symptom of a wrong pattern is a meter
  that's merely low rather than one that errors. Worth also confirming the pet's *first* swing counts
  when you send it in ahead of you, and that a **group-mate** never turns up flagged as yours.
- **Fight end reasons, live.** ([ADR 0078](../decisions/0078-a-fight-records-why-it-ended.md).) In
  History, confirm ordinary pulls carry **no** mark, a fight you died in shows ☠, and a mob that
  fled or a zone-out shows ⏱. The one to actually go and cause is the ⏱: it needs a fight nothing
  resolved, which a sandbox can only simulate.
- **The unread-line tally, on a real log.** ([ADR 0079](../decisions/0079-an-unread-line-is-counted-by-its-shape.md).)
  Turn on Debug logging, let the app replay a real evening's gap, and read `unparsed lines` in the
  debug log. Two things to check, and both are judgement calls only a real log can settle: that
  **chat is in `ignored` rather than in the shapes** (if a channel wording we don't recognise shows
  up as a shape, add it to `IGNORED`), and that the top shapes are genuinely unmodelled game
  sentences rather than a parser we broke. Anything in that list worth reading *is* a parser gap —
  file it. On the 95-line sample it reports 6 ignored and 4 shapes, all four real.
- **The spell file — format confirmed, the live pipeline is what's left.**
  ([ADR 0080](../decisions/0080-the-game-s-own-spell-file.md).) The *parse* has since been run
  against a real `EverQuest Legends` install and every assumption held — 173 columns (not the
  documented 171, and it didn't matter), 73,963 rows in ~400 ms, and mana values spot-checked
  correct against classic knowledge. See the ADR's verification note. `fixtures/spells_us_sample.txt`
  stays synthetic, since a real spell file is the player's game data and can't ship here.

  What a real install still can't tell us from outside the app is whether the **running app** picks
  it up. So, while playing:
  1. Debug logging on; confirm `read N spells from …` appears in the debug log, with N in the tens
     of thousands. Nothing at all means `findSpellFile` didn't locate the install — the likely
     cause is a Logs folder moved out of it.
  2. Cast something and confirm the **Mana** column fills in the Spells table, and **Per mana**
     with it. A `—` in Mana while the debug line says N spells means the *name* didn't match: check
     what `spellName()` produced against the file's spelling.
  3. Cast a **rank II+** spell and confirm the cost is that rank's, not the base's. Real data says
     these differ a lot — Burnout is 35 / 75 / 150 across its ranks — so a rank misread is obvious
     rather than subtle.
  4. Rename the file and confirm the graceful path: Mana falls back to the wiki's figure, and with
     no network shows `—` rather than breaking the table.
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
- **Hunt pins, in a zone you've actually farmed**
  ([ADR 0142](../decisions/0142-a-hunted-mob-marks-itself.md)). The join is unit-tested; what isn't is
  whether the result is *readable*. Put something on your list that drops in a camp you have kills in,
  open the map there, and check the ◎ rings land where you'd expect, that their captions don't turn a
  busy camp into a wall of text, and that they read as different from the pins you dropped yourself.
  Then the lifecycle, which nothing else can show: **loot the last one you needed** and confirm the
  mark goes on its own, and **mark a roam centre by hand** with the 📖 panel's ± button and confirm the
  automatic one stands aside instead of doubling it. Finally the 👁 panel's switch — off should mean
  off, and still off after reopening the window.

  The part that can only be judged in the game is the **wiki-placed** mark: put a named you have
  never killed on your list, go to the zone its page states, and see whether the dashed ring is
  actually near it. The coordinate is someone else's game and the app says so, but *how wrong* it
  tends to be is the thing no test can tell us — and it decides whether the wiki deserves to stay a
  source or should only ever be a hint in the hover.
- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region select → capture →
  Tesseract OCR accuracy → fuzzy match. First OCR downloads the English model (needs network); tune
  the crop / text cleanup if accuracy is poor. Since
  [ADR 0081](../decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md) the box may show a
  **corrected** reading, so grab an item with an `rn` in it (Morning Star) and confirm the Search box
  says "Morning Star" rather than "Moming Star" — and, the other way, that grabbing an item the wiki
  has no page for still shows what OCR actually read. The debug log prints the readings offered and
  the one chosen (`lookup` / `wiki` channels).
- **A lookup gives the screen back.** The bounds from
  [ADR 0102](../decisions/0102-a-lookup-never-holds-the-screen.md) have only been reasoned about, not
  watched. The selector no longer appears until its renderer reports in, so first check the **happy
  path still works on every monitor** (the wash should be visibly there, and a drag should select).
  Then: press the hotkey and *don't* drag — the selectors should vanish on their own (~10s) and the
  mouse work again; press Escape **with the selector focused** and again **with the game focused**
  (three routes answer that key and only the middle one is exercised by a normal press — confirm
  Escape still works normally in game once the lookup has ended); press the
  hotkey twice and confirm the second press cancels rather than stacking a second set; and on a
  **fresh install** (no `tesseract-cache`) confirm the "reading text…" overlay closes after ~6s and
  the model download still lands the name in Search when it finishes.
  The stuck-selector case itself is reproducible by breaking hydration (throw from the select page's
  effect): the window should never appear at all, and the log should say the selector never reported.
- **Overlays fail closed.** The five failure modes in
  [ADR 0131](../decisions/0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) are
  reasoned about, not watched. Each can be forced, and in every case the screen must stay clickable:
  - **Placement.** Start "place a custom spot" and then do nothing — after 30s the overlay must give
    the screen back and the button must be usable again. Repeat, pressing Escape instead (it is read
    in main, so it works even if the page is wedged), and repeat with cast alerts switched off
    mid-placement (the overlay is destroyed under it).
  - **A crashed overlay.** With alerts on, kill the alert window's renderer (DevTools → `process.crash()`,
    or Task Manager's renderer process): it must blink out and come back on the same monitor, and a
    second crash must leave it down rather than respawning for ever.
  - **A crashed main/map window.** Same, on the main window: it must lose its pin, stop eating clicks,
    and reload — coming back **pinned again** if that's how it was left.
  - **A hang.** Block the renderer (`while(true){}` in DevTools): the window must stop being on top
    and stop taking clicks, and get both back when it recovers — *without* reloading. Worth actually
    doing rather than assuming: the click-through half never came back until
    [ADR 0110](../decisions/0110-a-launched-window-is-visible-or-it-says-why.md), so a window that had
    hiccuped once stayed un-clickable for the rest of the session.
  - **A main-process crash.** Hard to force deliberately; if one ever shows up in the log, check the
    line after it says the overlays were neutralized.
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
- **📖 panel → map emphasis.** Open the knowledge panel on a zone you've camped and run the cursor
  down it: hovering a **mob row** should ring that mob's dots exactly as the ☠ list does. Open a mob
  and hover one of its **drops** — every mob known to give that item up should ring at once, not just
  the one whose row you're inside. Find a trash item two or three mobs share (Bone Chips, a fang) and
  confirm the row says "2 sources" and that hovering it lights all of them. Then the backstop: leave
  the panel from inside an open drop list and confirm the emphasis clears rather than sticking.
- **📖 panel → finding a drop.** Type part of an item into the "dropped…" box and confirm the mobs
  that drop it **open themselves**, with the matching line marked and its neighbours in the same loot
  table left plain. Clear the box and confirm the rows collapse back to whatever you had open by hand,
  and that mobs which have never dropped anything are still listed (an empty search asks nothing).
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
- **Alert style options.** Open a look's editor (🎨) and confirm each takes effect, using its own
  **▶ Preview alert** — the point being that the banner lands on the overlay *over the game*, which
  is the only place its position and size mean anything: **colour** tints both banner border and
  flash; **▶ Sound** plays the chosen beep and that's the one that fires; **position** moves the
  banner (all six spots); **motion** (pulse/wiggle/float/none) changes it; **duration** changes how
  long it lingers; and on a multi-monitor rig the **monitor** dropdown moves the overlay to the
  chosen display (it recreates on change). Then **🔔 on a rule's row**, which is the other half:
  confirm it shows *that rule's* wording and look, and that a **raw-text** rule previews as the 💬
  banner rather than a cast one.
- **Custom alert spots.** In Alerts → Alert style → Custom spots, click **Place a spot**: the
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
- **Delayed alerts — the two cues, and the death rule.**
  ([ADR 0082](../decisions/0082-an-alert-can-be-scheduled.md).) The schedule and the queue are
  unit-tested with injected timers, so what a real run adds is whether a *cue* is actually useful at
  the moment it lands. Two to set up: a watch on your own mez (include-self on) with delay **25** and
  message `RECAST MEZ`, and one on a placeholder's death — a raw-text watch on its name — with **8m**.
  Confirm the banner arrives late rather than at the match, that nothing else is late with it (the
  Damage tab counts the cast immediately, the ☠ list the kill), and that the wording is what makes the
  late banner legible: without a `message` it reads like a live alert about something that already
  happened. Then the rule that needs dying: cast the mez, **die inside 25 s**, and confirm the recast
  cue does *not* fire — then die with the 8m cue waiting and confirm it still does. Finally, turn cast
  alerts off with a cue waiting and confirm it never arrives. Typing nonsense in the box should mark
  the field red and alert immediately rather than swallowing the alert.
- **A watch as a rule — conditions, exclusions, and calling a cue off.**
  ([ADR 0084](../decisions/0084-a-watch-is-a-rule-not-a-substring.md).) The evaluator is unit-tested
  against hand-built subjects; what a real run adds is whether the *fields* carry what we think they
  do on this server's own wording, and whether the redesigned row is usable at speed. Three to build
  and then play with for an evening:
  1. **An exclusion.** A cast watch on something your own pet also casts, with `caster` `contains`
     `warder`, excluded. Confirm the mob's cast alerts and your warder's doesn't — the field the
     exclusion reads is the same log name `isNamedCaster` judges, so a pet named without the
     possessive is the case to try if you have one.
  2. **A zone condition.** Any watch plus `zone` `contains` your current zone. Confirm it fires
     here and goes quiet the moment you zone out — the zone comes from the app's own tracking, so
     this is really a test that the two agree while travelling.
  3. **A cancel.** The 25 s re-mez cue from the delayed-alerts item above, plus **stop it when**
     `line` `contains` `has been slain`. Mez, kill the mob inside 25 s, and confirm the reminder
     never arrives; then mez and let it ride, and confirm it does. Worth also setting a **repeat** of
     2 or 3 on that one to feel whether a repeating cue is helpful or maddening, since that's a
     judgement no test can make.

  Then the row itself: chips should say what each watch does without opening it, ⚟ / ⏱ / 🎨 should
  open one drawer at a time across the whole list, and a deliberately broken watch (delay `soon`, or
  a repeat with nothing to stop it) should show ⚠ with the explanation. Finally the compatibility
  claim, which is the one worth checking on **your own settings file rather than a fresh one**: every
  watch you already had must behave exactly as before, untouched.
- **Testing a rule against your own log — the replay.**
  ([ADR 0085](../decisions/0085-a-rule-can-be-tested-shared-and-borrowed.md),
  [ADR 0089](../decisions/0089-a-rule-is-checked-against-the-log-file.md).) The one that needs a
  *real* log more than anything else here, because its whole purpose is to answer "does my wording
  match what EQ actually prints". It reads the **file**, so start with the case that used to fail:
  open the app having *not* played since launch, open ✓ on a rule you know fires, and confirm it
  reports matches from an earlier session rather than "nothing logged yet". Then, with a real
  evening's log: a rule you know fires shows the lines you expect with the log's own sentence
  readable; the ⚠ / ✖ list agrees with the chip on the row; the scanned-line count is in the
  thousands (it's the last 512 KB, so a huge log doesn't slow it down — worth confirming the drawer
  opens instantly on a 15 MB one). Then **⤢ Search further back**: each press should report a bigger
  line count, the wording should switch to "in the whole log (N lines)" once it reaches the start,
  and the button should then disappear. Time the deepest step on a real 15 MB log — it reads 32 MB,
  so if that's an uncomfortable wait the ladder wants a rung removing. The real test is to write a
  rule for something you *saw* happen and find out whether your first guess at the wording matches
  it; if it doesn't, that's the feature working. Finally, with the log folder unset or wrong, confirm
  it says so rather than reporting a confident zero.
- **The library, the share string, duplicate and saved styles.** Add two or three library rules and
  confirm each behaves as its card claimed (open one afterwards — the card's chips should match the
  row's). Add one with a ✎ note and confirm it opens for editing rather than sitting there matching
  nothing. Then: **⧉** a rule and confirm the copy lands beside it, opens, and is independent.
  **Copy all**, paste into a text file, clear a rule, and paste it back — it should arrive at the
  bottom, enabled, with the same behaviour and a *different* id (check nothing was overwritten).
  Paste deliberate junk and confirm it's refused with a sentence. Finally **saved styles**: make one,
  put two rules in it, Test both (they should look identical), change the style once **from its own
  row's 🎨** and confirm both change — then delete it and confirm those rules fall back to the
  defaults rather than going silent.
- **The one-time rule conversion, on your own settings file.**
  ([ADR 0087](../decisions/0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md).) This is
  the item to do **before** anything else in this section, and it wants a settings file that predates
  the rule model — ideally a backup of one, since the interesting cases are watches with their own
  copied styles. Launch with Debug logging on and read `upgraded alert rules` in the debug log: it
  reports how many rules had `onCast` written out, how many were re-pointed at raw text, and how many
  looks were folded into shared styles. Then confirm, in Settings: every rule you had is still there
  and still ticked the same way; rules that shared a look now **wear the same saved style** (change it
  once in Saved styles and both change); a rule whose look was just the defaults shows "the defaults"
  rather than a copy; and — the claim worth actually testing — each rule still fires on what it fired
  on before. `settings.pre-schema-1.json` should be sitting beside `settings.json` in the app's data
  folder, and a second launch should log nothing at all.
- **Typing a rule, with a real log behind it.**
  ([ADR 0091](../decisions/0091-a-rule-is-typed-with-the-log-s-help.md).) The three things to feel
  rather than read. **The caret**: click into the middle of an existing trigger and type — the cursor
  must stay where you put it, letter after letter (this was the bug: it jumped to the end every
  time). **The completions**: with an evening's log, type the first few letters of a spell you know
  you saw and confirm the rest appears greyed and Tab takes it; then type a fragment from the
  *middle* of one ("sme") and confirm the dropdown finds it; then misspell one deliberately. The
  count beside the buttons says how many words it learned — if that's zero or tiny, the log slice is
  the thing to look at, not the suggestions. The judgement call only real use can settle is whether
  the fuzzy floor is right: too many wrong offers and it wants raising, too few and lowering.
  **The hit list**: run a check on a rule that fires constantly (a mob's name) and confirm you get
  *different* sentences with ×N counts rather than twenty copies of one.
- **One style editor at a time.**
  ([ADR 0090](../decisions/0090-one-style-editor-at-a-time.md).) With two or three saved styles,
  confirm the section is a **line per look** — dot, name, what it does, worn-by count — and that
  opening one 🎨 closes whatever was open, *including* a rule's own 🎨 drawer and the defaults'. The
  claim to check by eye is that there is never more than one grid of swatches on screen. Then
  **＋ New saved style**: it should appear already open for editing, and the row's summary should
  change as you edit it.
- **The three style edit paths.**
  ([ADR 0086](../decisions/0086-editing-a-shared-style-from-a-rule-forks-it.md).) The rule is that
  changing one rule's look never changes another's, and the only way to see it working is to try to
  break it. With one saved style worn by **two** rules: open the first rule's 🎨, read the note (it
  should name the style, say two rules wear it, and point at Saved styles), change the colour, and
  confirm a **new** style appeared named after the original, that this rule now wears it, that the
  other rule is untouched, and that nothing on screen jumped when it forked. Change the colour again
  and confirm **no second copy** appears. Then the sole-wearer case: a style only one rule wears
  should edit in place with no copy at all. Finally a rule on the defaults — editing it should fork
  rather than quietly restyling every other rule that follows the defaults.
- **The app's own alert sources, and their sticky looks.**
  ([ADR 0120](../decisions/0120-a-feature-s-look-is-sticky.md).) The Alerts tab should list **Personal
  bests**, **Spawn timers** and **Loot drops** above the looks, each naming the style it wears and how
  many things are armed. Arm two list rows with 🔔 and confirm the Loot drops row says **2 list rows
  armed** and the **Loot** style's own line says *worn by Loot drops* — the count is the whole point,
  since it used to read `worn by 0`. Check all three sticky looks offer a 🔒 instead of a ✕, and that
  their names are plain text rather than an editable field. Open the 🎨 on **Loot drops**, change the
  colour, and confirm the Loot style in the list below changed too (it is the same style, and there is
  still only ever one editor open). Then the fork: point a **rule** at the Loot style, open its 🎨,
  read the note (it should say the look is what Loot drops wear and that changing it here makes a
  copy), change the colour, and confirm a copy appeared and the loot banner is **still gold** — this
  is the case that used to repaint every drop on the machine. Last, the honest edge: `notify` a list
  row, delete nothing, and confirm the Records board can still point its celebration at another style
  or at the alert defaults, with the Personal bests row following what it picked.
- **Separate map scale.** Confirm the map window's A− / A+ move **only** the map and the main
  window's move only the main window (this was broken: Chromium's zoom is per-origin, so one number
  won for both — [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md)). At
  every scale below 100%, check **no gap** appears at the bottom or right of either window — the
  shells size in percentages now, and a `vh` length would come up short. Both values should survive
  a restart.
- **Click-through, both windows** ([ADR 0073](../decisions/0073-a-click-through-window-keeps-its-chrome.md)).
  The whole point is that clicks reach *the game*, which no sandbox can judge. With EQ running,
  press 👻 in the map's title bar and confirm: clicking **on the map** turns the character / attacks
  the mob under it, while the title bar, the toolbar and an open side panel still take clicks
  normally — and that 👻 itself still works, so the mode can be turned off. Then the crossings, which
  is where this can go wrong: sweep the cursor from the map onto the toolbar and click immediately
  (it should register), and start a drag on the title bar that travels **across** the map (the window
  should keep moving, not drop the drag half-way). Same again in the main window over the panel, with
  the tab bar still switching tabs. Confirm hovering an item name over the panel still pops its stat
  card while the click goes through. Leave both on, restart the app, and confirm each window comes
  back in the mode you left it — and that the mode never survives as a window you *can't* dismiss.
- **How a window was left, restored** ([ADR 0074](../decisions/0074-how-a-window-was-left-is-window-state.md)).
  Set the two windows to *different* states — the list unpinned, translucent, click-through off; the
  map pinned, ◐ solid, 👻 on — move and resize both, then quit from the tray and relaunch. Each should
  come back exactly as left, **with no flicker**: the point of applying this at creation is that
  neither window is ever briefly translucent, unpinned or clickable on its way to being right. The
  map is the one that used to be wrong, so check it specifically: it must open with *its* pin, not
  the list's. Then confirm the two stay independent (flipping the list's ◐ doesn't touch the map's)
  and that **Reset window position** recenters without unpinning anything.
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
  **To** to the map you're viewing; a zone in the route shows that zone's map; the four checkboxes
  persist (they're `Settings.travel`) and changing one re-asks for the route.

  **Ruling a place out — the ✕ per step and the *Not using* strip**
  ([ADR 0109](../decisions/0109-a-route-can-be-denied-one-place.md)). The routing side is unit-tested
  against a two-ring fixture; the panel is not. With **Druid** on, route somewhere the answer reaches by
  a ring, press the ✕ on that ring's step, and confirm three things: the route **comes back** (a
  different, longer one) rather than refusing, the ring appears as a chip under *Not using* **with its
  own name and zone** rather than an id, and the druid checkbox is **still on** — losing one port must
  not cost the network. Then press the chip and confirm the first route returns, and that both survive
  closing and reopening the window (they're `Settings.travel`). The two negative cases worth causing:
  rule out enough borders that the trip becomes impossible, and confirm the refusal *says* you've ruled
  places out and that **Allow all** puts them back; and switch **map source** with places ruled out —
  a ring's id belongs to its pack, so the entry may stop matching, and what to confirm is that it goes
  quietly inert and is still listed and clearable, never that it errors.

  **Ports, since the model changed** ([ADR 0066](../decisions/0066-a-port-is-cast-from-where-you-stand.md)):
  with **Druid** on, a route out of a zone that has *no* ring should still port — the answer should read
  "port to <somewhere>, then walk", with no leg for reaching a ring first. Worth checking against how you'd
  actually travel it, because the graph now claims any ring is reachable from anywhere, and a zone that
  forbids teleporting would make that claim wrong in a way only playing it can show. Re-run
  `npm run travel:build` first: a graph stored before the change lacks the hubs a lone ring should have.

  **Succor / pick, unmeasured against a real pack**
  ([ADR 0069](../decisions/0069-a-succor-is-a-port-inside-one-zone.md)). The reading and the routing are
  unit-tested, but **how many zones actually carry the marker is unknown** — `poiKind`'s corpus tally
  names the word, nothing has counted the points. `npm run travel:build` now prints a `succor points, in
  N zones` line: that number is the first thing to look at, and if it's near zero the toggle is correct
  and useless on this pack. Then, in a zone that has one, turn the checkbox on with a fresh `/loc` from
  the far end of the zone and confirm the route gains a `within <zone> → Succor` leg and a smaller total.
  The claim to test in game is the coordinate itself: evacuate and see whether you land where the
  mapmaker drew it. A safe point in the wrong place is a free ride to the wrong end of the zone, and it
  would look exactly like a good route here.

  **The hand-authored table, unverified in game.** `manual-links.ts` ships classic-EverQuest boat runs
  as a starting point, never checked on EQ Legends, and **no translocator gnomes at all** — nothing
  about a Legends-only NPC can be read off a map or reasonably guessed, so that section is empty on
  purpose (with both shapes to copy from in a comment: a border if anyone can walk up to it, a `gnome`
  -mode link if it needs a class, a faction or a fee). `npm run travel:manual` prints which entries
  found a real label, which named a zone this pack has no map for, and which are malformed — that's the
  list to work through. The same run prints the destinations no map file answered to and the zones with
  no way in or out, which is where the graph is actually thin.

- **A mob's page, saying what you've killed** ([ADR 0025](../decisions/0025-observation-over-the-wiki.md),
  `MobKills`). Open a mob you've farmed and confirm the block under its loot list: one row per zone,
  the kill count matching the ☠ list's for that camp, observed rates dimmed by sample size, and the
  coin-per-kill figure agreeing with the camp report's. Then the two map paths, which is the part with
  nothing behind it in the sandbox: the **zone name** opens the map there, and the **±N** button opens
  it *and* drops a marker at the roam centre — the same gesture a wiki `Location:` coordinate already
  had. With the map already open, hovering the block should ring that mob's kills; with it closed,
  hovering must not open a window. A mob you've never killed should say so rather than showing an empty
  block.

- **The zone migration, run from inside the app.** ([ADR 0083](../decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md),
  `electron/migrations.ts`.) It has already been **run against the author's real store** — 338 of 2947
  records placed, 0 left, no other field touched, 140 ms for a 15 MB log, and 2609 records that already
  had a zone agreed with the log's timeline exactly. What that run *didn't* exercise is the in-app path:
  it was driven directly rather than from `main.ts`. So the store is now stamped `schema: 2` and won't
  run again — to confirm the startup path, restore `kill-log.pre-schema-2.json` over `kill-log.json`
  (or delete its `schema` field) with the app closed, then start it with Debug logging on and confirm
  `filled in zones the log stated` appears in the debug log, the app doesn't stutter at launch, and the
  Session tab's per-zone table gains the kills (Blackburrow was the big one: 130 → 244).

- **The zone picker, now that 83 files have names**
  ([ADR 0076](../decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)). A supplied gazetteer
  replaced the 31 hand-verified names, so most of the picker is names nobody here has seen against a
  real folder. The check that matters is the one the whole table can't fail closed on: **pick a few
  newly-named zones and confirm the map drawn is the zone the name claims** — `Lower Guk` (`gukbottom`),
  `Nagafen's Lair` (`soldungb`), `Solusek's Eye` (`soldunga`), `The Ruins of Old Paineel` (`hole`),
  `West Commonlands` (`commons`) and `Neriak Palace` (`neriakd`) are the ones worth opening, since a
  wrong file draws another zone under the right name. Also confirm the `tutorial` / `tutoriala` pair:
  the table lists a "Tutorial Zone" and this server's own is "EverQuest Legends Tutorial", and if both
  files exist they may be one place shown twice.

- **The zone picker, with two packs and a misspelling**
  ([ADR 0075](../decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)). The measured case is
  `Toxxulia Forest` / `Toxulia Forest`, which used to be two rows. Confirm the picker now lists each
  place **once**, that the row draws a real map, and that the kills you recorded there appear whichever
  pack is selected — that last one is the whole point, and it needs a real `userData` kill log plus two
  map folders to show. Worth scanning the picker for any *other* pair the eye reads as one place: the
  rule is one edit wide on purpose, so a two-letter difference (`Kithicor Forest` / `Kithikor Woods`)
  is still two rows and would want an entry in `ZONE_ALIASES` instead.

- **The ☠ list with a peer sharing, unseen.** The filter bar is now one row and shared kills are rows in
  it, but neither has been looked at — the sandbox is headless and this needs two clients. To confirm: the
  bar stays on **one line** (it wrapped before, which with a 40%-tall panel left almost no map) and
  doesn't reflow when a peer connects; a peer's kills appear in the same mob groups as yours, marked
  "from <name>", with "N shared" on the group heading and in the tally; unticking **shared** removes them
  from the list *and the map together*, which is the thing that was broken. Also worth watching with three
  clients: kills must not multiply — the broadcast filters shared ones out, so nobody relays anybody
  else's, but an echo would show up as a count that climbs on its own.

  With **both** panels open, check there are now exactly **two rows of chrome, both of them filters** —
  one headed ☠, one headed 📖 — where there used to be a filter row plus a "14 mobs observed" row. The
  filters are shared, so typing a mob in one narrows the other; that's intended, and worth confirming it
  reads as helpful rather than surprising.

- **A zone pinned to the game's own maps, unseen.** `STOCK_ONLY_ZONES` currently holds **Lavastorm
  Mountains**. With a pack selected that *has* its own lavastorm map, the map window should draw the
  game's, mark "· from Game maps" in the titlebar, and its hover should say the zone is *always* drawn
  from there — not the "your pack hasn't got it" wording. The zone must appear exactly once in the picker.
  Note the travel graph still harvests that zone's exit labels from the **chosen pack's** file, so a route
  through Lavastorm and the map you're looking at can disagree until the graph borrows too (see todo).

  The layout is what to look at hardest, because it's what was reported wrong and the fix was reasoned
  from the CSS rather than seen: a zone picker's dropdown must open **over the map**, not be clipped at
  the panel's edge, and must not run off the left of the window; the From/To row must **stay put** while
  a long route scrolls under it; and the panel must take about 45% of the window at **any** map font
  scale, including above 100% (that was a `vh` unit being scaled by the root `zoom` — the same trap
  `.app` documents). Worth resizing the window narrow and wide with a long route showing.

- **Recorded data — the flag, and the thing it must never do.** Settings → **Recorded data**
  ([ADR 0096](../decisions/0096-stored-data-says-which-rules-wrote-it.md)). On an install with history,
  **Recorded fights** and **Personal bests** should read *needs updating* and say why (ADR 0095's DoT
  fix); everything else should read *up to date* or *nothing recorded*. On a **fresh** install the whole
  list must be *nothing recorded* with **no** badge — a first run opening with a list of chores is the
  failure this is most likely to have.
  **Cross-check the file names against the data folder**, because nothing else can: a concern whose
  `file` is misspelled reads *nothing recorded* for ever and looks like an honest answer. (That happened
  once already — `zone-names.json` for what is really `map-zone-names.json` — and it was only caught by
  running the report against a real folder.) Any row saying *nothing recorded* whose file plainly exists
  in `%APPDATA%/eq-list` is that bug and not a state.
  Then the round trip, which is the only part a test can't reach: play for a minute so a store writes,
  and confirm the row's timestamp updates and its state stays *up to date* — that proves the stamp is
  being written by the live path and not only by the test's saver. Click **Digest a log…** on the fights
  row and confirm the row goes current afterwards. Cancel the picker and confirm it says "Nothing
  digested" rather than reading like a failure.
  The one to check deliberately, because getting it wrong destroys data: open `combat-history.json`,
  hand-edit `provenance.revision` to a number **higher** than the app's, and confirm the row reads
  *from a newer build*, explains itself, and offers **no** button at all.
- **Your DoT ticks now count — check the meter, not just the parser.**
  [ADR 0095](../decisions/0095-your-own-dot-tick-is-yours.md) is pinned by tests against verbatim log
  lines and verified by replaying a real 230,000-line log (1,737 tick lines, 0 left unread), but that
  proves the *parser*, not the meter. In game, cast a DoT and watch **Damage → Abilities**: the DoT
  should appear as its own source and **keep growing after the cast lands**, which is the thing that
  used to be missing — its ticks are most of a DoT's damage. Three specific checks: the ticks land on
  **your** row and not on a phantom row named after the spell (that's ADR 0071's failure, and a
  regression here would look identical); a **critical tick** shows up under `Biggest Critical` on the
  scoreboard as well as `Biggest DoT tick`; and a **group-mate DoTing with the same spell** does not
  take your ticks off you — the "your" wording states the caster, so `dot-attribution` must leave it
  alone. Worth comparing a fight's total before and after a build if you have one banked, remembering
  ADR 0095 is forward-only: **stored fights keep their old, lower figures**, so a difference there is
  correct and a difference in a *new* fight's is the fix working.
- **High scores — the four rules, in the order you'll meet them.** The logic is a black box
  (`high-scores.test.ts`) and every rule in [ADR
  0093](../decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md) is about *when a banner
  appears*, which only a real evening exercises. Take them in order:

  **Launch, before playing.** Open **Damage → 🏆 Records**. If you have recorded fights, the board
  should already be populated — that's the seeding — and its header should say so. Crucially, the
  replayed log gap at startup must produce **no banners at all**, however many records it sets: this is
  the failure that would make the feature unusable, and it's the one thing a single launch tells you.
  Confirm the three live-only categories are named at the bottom rather than silently absent.

  **Then play.** The first live record should raise a banner over the game — the figure leading, the
  category naming it, and the hint saying what it beat. It has to be readable **mid-fight without
  looking away**, which is the whole point; if it isn't, that's the position or the duration, both on
  the same style controls a cast alert uses. Check the row on the board is flagged as the fresh one.

  **The streak.** Kill steadily past the floor (5) and confirm exactly **one** banner at the crossing
  and silence after it, while the board's kill-streak figure keeps climbing. Then die, and confirm the
  live streak resets to 0 and the *next* crossing announces again. Worth doing at a **busy camp**
  specifically: the streak asks the meter's own `countsKill`, so other groups' kills in earshot must
  not tick it up — that gate is the difference between a record and a number.

  **Eating a log.** Digest one of your own older logs and confirm its fights land on the board with
  **no banners**, and that a log belonging to a *different character* lands nothing at all.

  Then the surrounding controls: turning celebrations off stops banners while the board keeps filling;
  the 🔔 shows a sample wearing whatever look is picked; picking a saved style changes it; and with
  alerts switched off the panel warns rather than going quiet. Finally **Reset** — it should forget
  this character's records, leave another character's alone, and **not** re-seed itself from history on
  the next look.

- **"Check my setup", against a real install.** ([ADR 0100](../decisions/0100-a-setup-check-is-a-chain.md).)
  The chain and its probes are unit-tested against temp folders, so what's unverified is whether the
  **wording matches a real Windows install** and whether the checks say the right thing at the moments
  they exist for. On a working setup, first confirm the boring case: press it while playing and every
  row is green, with "The log we're following" naming the character you're actually on and "The game's
  own map files" naming a real path. Then cause each fault in turn and confirm exactly **one** red row
  with the rest patient: point the log folder at somewhere that doesn't exist; point it at a real
  folder with no `eqlog_*` in it; pin a "Specific log file" that isn't there — and, the other way, pin a log you copied in
  under some name of your own and confirm it's **accepted** rather than reported missing; and — the one this
  feature was built for — **type `/log off` in game**, play for ten minutes, and confirm the check
  says the log is stale and names `/log on` rather than reporting everything fine. Finally, pull the
  network and confirm the wiki row goes amber while the log rows stay green, and that **Copy report**
  produces text worth pasting into an issue.

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
- **Sharing, peer to peer — never run at all.** Everything in
  [ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md) is unit-tested as pure rules and has
  never had two real clients pointed at it, and the interesting half is the half no unit test can
  reach: the **direct route**. Confirm, with two clients and Debug logging on:
  - a catalogue arrives — the Peers tab lists the other client with its offered kinds and counts,
    and a kind switched *off* on the far side is absent rather than shown as zero;
  - a toggle shows up within a few seconds (`OFFER_DEBOUNCE_MS`), and an untouched catalogue
    re-publishes on the slow tick without churning;
  - **an ask reaches one peer and nobody else.** With three clients this is the whole point of the
    change: ask A for its watches and confirm B's log shows no `give`. `peer` routing is the thing
    that has never been exercised — every message this app has ever sent went to the room.
  - a `give` of each authored kind lands in the tray and **applies nothing** until clicked, that
    copied watches and styles arrive with fresh ids (add one twice, confirm two rows), that a copied
    list entry arrives at `obtained: 0`, and that "Add to map" opens the map and folds the pins in;
  - **a peer with no route** — one behind a NAT the relay can't traverse — is listed as *not
    reachable* rather than offering buttons that silently do nothing;
  - observations still pool: with `mobs`/`kills` on, confirm the far side's rates move without
    anybody clicking, and that a client running a build from *before* this ADR still contributes
    (the bare-broadcast path is kept for exactly that);
  - **the two de-dupes, which need a real shared camp.** Two clients at one spawn should show *one*
    countdown row crediting both; one player marking it up should take the row over from the
    better-evidenced clock. And a buff board should name *people* — if you see your own name on
    somebody else's Spirit of Wolf, the target resolution has failed and that is the bug the unit
    tests exist to catch early.
- **The offer notice, and its one action.** Never run. With two clients, switch a share kind on
  from a peer and confirm the other side raises **one** toast naming them (not "Someone (3f9a)" —
  if you see that, the `hello`/offer race beat `NOTICE_DEBOUNCE_MS`), that switching six on is still
  one toast, and that **View** lands on the Peers tab with that peer's row striped. Then the noise
  rules, which are the half that decides whether this feature is liveable
  ([ADR 0143](../decisions/0143-a-notice-may-point-at-where-to-answer-it.md)): kill things on the far
  side and confirm their growing tally raises **nothing**; toggle a kind off and on and confirm the
  second announcement never comes; pull the far side's network until the room re-joins under a fresh
  peer id and confirm you are *not* told about them again. Finally confirm no notice ever appears
  with `connectPeers` off.
- **Nothing peer-shaped left in Settings or on the map toolbar.** The consolidation
  ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)) is the kind of change a compiler
  cannot check: confirm Settings has no connect switch, no player name and no bootstrap field, that
  the map toolbar has no ☣ and no 🔗, and that everything they used to do is reachable in the Peers
  tab and takes effect — flip *Kill positions* there and confirm a peer still receives them with the
  map window shut. Then the one thing kept on the map: the 👥 panel still lists the room, still has
  no toggles, and its empty state names the Peers tab.
- **Presence in a panel that opens late.** The bug two real clients found first
  ([ADR 0144](../decisions/0144-state-is-asked-for-as-well-as-pushed.md)): connect both, wait for
  them to see each other, and *then* open the Peers tab and the map's 👥 panel. Both must list the
  other person immediately — a zero here means the seeding read is not happening and only the events
  are. Then the states either side of it: with `connectPeers` on but the network down, the light
  beside "Who's here" stays grey and the text says *not in the room yet*; once joined and alone it
  goes gold and the text says *connected, and nobody else is in the room yet*.
- **A room with the game closed.** The requirement ADR 0145 wrote down, never run: quit EverQuest
  entirely (or never start it), launch EQ List, and confirm both clients still join, see each other,
  and can ask and answer. Confirm the name is still right — it comes off the *filename* of the newest
  log in the folder, not off anything the game is doing. Then the fresh-install case: point `logDir`
  at an empty folder and confirm the Peers tab says peers will see a short id until you name yourself,
  that typing a name in *Your connection* fixes it, and that the other side picks the new name up
  within a minute (the catalogue carries it, not just `hello`).
- **The tick, which is the half nobody watches.** Leave two clients connected and idle for ten
  minutes with Debug logging on. Nothing should reconnect while they can see each other, and the pool
  should stay current: kill something on one side, wait a minute without touching anything, and
  confirm the other side's rates move (the reconcile pass, not an offer). Then force the drift the
  reconcile exists for — stop one client mid-conversation and restart it — and confirm it catches up
  on the next tick rather than waiting for the far side to kill something.
- **The split room, which now checks rather than guesses**
  ([ADR 0162](../decisions/0162-a-room-of-one-is-checked-not-guessed-at.md)). Every rule is unit
  tested (`room-watch.test.ts`), so what needs two real clients is only the part no fake can supply:
  **that the probe reaches a real leader over a real transport.** Launch both clients at the same
  instant, repeatedly, until they settle in separate rooms (both connected, both alone — the light
  gold, the roster empty), with Debug logging on. Expect, within about twenty seconds and with nobody
  touching anything, **exactly one** of them to log `we are not in the room everybody else is in - it
  has N - re-joining`, and the other to log `room of one confirmed` and stay put. Both must then see
  each other. If *both* re-join, the probe is failing to reach the leader and the split can re-race —
  that is the bug to report. **Retry connection** must still do it immediately on either side
  (`re-joining on request`, then `peer joined:`).
- **A solitary player is never re-joined.** The other half of ADR 0162, and the one a wrong fix
  breaks silently. Run **one** client, connected, alone, for half an hour with Debug logging on.
  Expect `room of one confirmed` on a lengthening cadence (20s, 45s, 90s, 3m, then every 5m, each
  jittered) and **no re-join at all** — no `joined awari room` after the first, no roster churn. A
  second `joined awari room` line here means the probe is reading our own hint as somebody else.
- **Surviving a drop, and leaving cleanly.** The room now re-joins itself when awari reports it
  unreachable ([ADR 0070](../decisions/0070-a-dropped-room-rejoins-itself.md)), and no unit test can
  reach this — it needs two clients and a *real* drop, which is the hard part to stage. The cheapest
  staging is the network, not the app: with two clients in the room and Debug logging on, pull one
  machine's network (or block the PeerJS broker) long enough for awari to exhaust its own recovery.
  Expect, on the disconnected client, `dropped out of the awari room:` naming a reason, the 👥 panel
  **emptying** rather than keeping ghosts, and a `re-joining in Nms` line — then, once the network is
  back, the room reforming on its own with **no toggling of Connect**, names and pings working again.
  Confirm the backoff holds at a minute rather than spinning if you leave it down. Then the failed
  join: point `bootstrapUrl` at something dead, toggle Connect on, and confirm it keeps retrying with
  backoff (it used to give up for good) and picks up when the URL is corrected. Finally the graceful
  leave — with three clients, have the one that joined **first** (most likely the leader) quit, and
  confirm the other two keep seeing each other's pings without a stall; that handoff is what
  `leaveRoom()` buys and what a bare `close()` cost everyone else.
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

## Spawn timers (ADRs 0092, 0094, 0097, 0098)

Built, tested end to end against a replayed log, and **never run in the game**. What a real evening
would settle that a fixture can't:

- **Does the article test hold against real EQL mob names?** Everything rests on it. The flow tests
  cover a player dying, a pet dying and a named killed by someone else — but EQL is not classic EQ
  and a name shaped in a way we haven't imagined would put a wrong row on the board.
- **Is `ERRATIC_RATIO` (1.5) set anywhere near right?** It's a judgement call, not a measurement.
  A placeholder camp is what would tell you: if the warning fires on every mob, it's too tight.
- **Does `MIN_RESPAWN_SECONDS` (90) throw away anything real?** A genuinely fast placeholder would
  be silently discarded, and the symptom is a blank figure rather than an error.

To exercise it without playing:

```
npm run sim -- --from fixtures/spawn-camp-eqlog.txt --relative
```

**`--relative` is not optional here.** The default stamps every line "now", which collapses the gaps
the timers are learned from and makes the tab look broken — see the flag's note in
`scripts/replay-log.mjs`.

## A tracked item's banner (ADR 0105)

Built, unit-tested through the router, and **never seen over the game**. The rules are covered by
`electron/tests/alert-router.test.ts` (an unarmed row is silent, a replayed drop is silent, the
completing line says `done` and the ones after it say nothing); what a real camp would settle:

- **Is the built-in `Loot` look right over the game?** Gold at top-right for 5s with `levelup` is a
  judgement, and the thing it competes with is EQ's own loot window — which is on screen at exactly
  that moment, in roughly that corner. A camp is what says whether it wants a different spot.
- **Does the completing line reliably say `done`?** It rests on `applyLoot` having already credited
  the count when the router is called, so the arithmetic is `obtained - qty`. A stack that completes
  an entry (`You looted 2 Bone Chips` on a row needing 5 with 4 held) is the case to watch.
- **Is one row's worth of noise the right unit?** Arming a row you then farm for an evening is the
  test of "off by default, per entry" — if the honest answer is a cooldown, that is the open question
  in [decisions/README.md](../decisions/README.md) and this is its second caller.

To exercise it without playing: arm a row for an item in the fixture, then

```
npm run sim -- --from fixtures/sample-eqlog.txt
```

The default "stamp every line now" is what you want here (unlike the spawn timers): the liveness rule
means a backdated loot line raises nothing at all.

## The add confirmation (ADR 0106)

The arithmetic and the wording are pinned (`electron/tests/list-add.test.ts`), so what's left is
whether it *reads* right in a window nobody has looked at yet:

- **Does the toast land where it can be read and nowhere it's in the way?** Bottom-right, over the
  status bar, at 60% interface scale as well as 100% — and with a loot banner up at the same time,
  which it must sit under rather than beside.
- **Is ~3s the right life?** Long enough to read two lines while still typing the next search, short
  enough that a burst of adds (a quest, then three of its components) doesn't build a wall. Three at
  once is the cap; adding ten items one after another is the case to watch. A **second press on the
  same row** replaces its card in place rather than stacking — confirm that reads as an update and not
  as a flicker, since the card remounts to restart its life.
- **Does the button's tick fight the row it's in?** It's the same button width plus a glyph, so a
  narrow window may reflow the result row for a second. Worth a look at a long item name.
- **The clipboard's notice, both ways.** `Copy rule` (Alerts) and `Copy` (Damage) now go through
  `lib/clipboard.ts`. Confirm the success card, and — the half that has never run — that a **refused**
  copy says so: the failure branch is only reachable where `navigator.clipboard` is absent or rejects,
  which this sandbox can't produce.
- **The map window's notices.** It mounts its own host with no caller yet, so all that needs
  confirming is that a notice raised there lands inside *that* window, bottom-right, and doesn't sit
  under the toolbar or a side panel.

## Launching the app (ADR 0110)

The reported symptom — *windows in the taskbar that never open anything* — is a window with no renderer,
which on a transparent frameless window looks exactly like nothing. Everything here is Electron window
lifecycle, so none of it is unit-tested; the two pure rules under it are pinned in
`electron/tests/window-launch.test.ts`. What matters is that each failure now **shows or says** something.

- **A missing renderer build.** Rename `out/index.html` and start the built app. Expected: two 404
  warnings in the log for `app://local/index.html`, one `already tried reviving once — showing the
  failure page instead`, an `no exported renderer at …` error at the top, and — the point of it — a
  **visible dark notice** in the window naming the tray's *Open debug log* and *Quit*. It must **not**
  reload in a loop (that was the first version of this fix), and the map and alert windows, whose own
  documents still exist, must come up normally.
- **A dev server that isn't there.** `npm run dev:electron` alone, with no `next dev`: expected is a
  two-minute sweep and then a line per port saying what each answered — *not* a silent timeout. For the
  window half, kill `next dev` *after* the app is up and reload a window: the same
  one-retry-then-notice path, on a connection error rather than a 404.
- **A dev server on the wrong port.** The condition that prompted all of this: occupy 3000 (`npx
  http-server -p 3000`, or leave a stale `next dev` running) and `npm run dev`. Expected: Next moves up,
  the launcher **says** 3000 is held and by what, finds the renderer on 3001, and the app launches
  against it. Then check the reverse — that with 3000 free it still takes 3000 and says so.
- **An orphaned dev tree.** How that condition arises, and worth knowing on sight: if the Electron half
  of `npm run dev` dies at startup, `concurrently -k` has been seen to leave the Next half running, and
  it then holds 3000 for every later run. If dev ever misbehaves, look for a `next dev` older than the
  session (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`) before looking anywhere else.
- **A slow first load.** Nothing to force — but on a cold launch watch whether any window appears
  *empty* for a moment. The reveal deadline is 3s, so a first load slower than that now shows an empty
  frame that fills in. If that ever reads as a broken window rather than a loading one, the deadline is
  the number to revisit.
- **A window shown at the wrong size.** The mixed-DPI case: leave the app on a 125%-scaled secondary
  monitor, quit, relaunch. It must come back the size it was left, not 1.25× bigger — this used to grow
  on every launch, and the re-assert it depends on now hangs off the load as well as the paint.
- **A second launch mid-boot.** Double-click the launcher twice in quick succession, before the first
  window appears. Expected: one app, one set of windows, and no extra window that never loads.
- **A launch that can't start at all.** Force it by corrupting `settings.json` into something that makes
  a store throw (a truncated file is repaired, so this needs real garbage). Expected: an error dialog
  naming the debug log, and the process **exits** — not an interface-less process left in Task Manager.
  Restore the file afterwards.
- **`ELECTRON_RUN_AS_NODE` in the environment.** `set ELECTRON_RUN_AS_NODE=1` then `npm run app`: it must
  still launch. Unstripped it starts Electron as bare Node and dies on
  `registerSchemesAsPrivileged`, which is the version of this bug that produces no window at all.
- **A saved opacity of 0.** Put `"opacity": 0` in `settings.json` under `overlay` and launch: the window
  must open at the 20% floor and be *visible*, and the Settings slider must read the clamped value.

## Resizing a panel (ADR 0112)

The arithmetic is pinned in `electron/tests/panel-size.test.ts`; the **gesture** can't be — a pointer
drag over a CSS `zoom`, against percentages that resolve on a real window, is exactly what a unit test
can't see. In the map window, with the 👁 / 🧭 / 📖 / ☠ / 👥 panels:

- **The seam is grabbable, and grabbing it does nothing else.** Hover the bottom border of an open
  panel: the cursor becomes ↕ and the line lights up. Drag down and up — the panel follows the pointer
  1:1 and the map takes the rest. Confirm the drag doesn't select text in the panel, doesn't move the
  *window* (the panel isn't the drag handle, but check anyway), and that a click on the bottom row of
  content still reaches the content rather than starting a resize.
- **Content behaves at both extremes.** Shrink the ☠ list to its smallest: the filter bar stays put and
  the rows scroll under it. Grow the 🧭 route to its largest: only the answer scrolls, the From/To boxes
  stay on screen, and — the specific thing to check — a **zone picker's dropdown still opens over the
  edge of the panel** rather than being clipped or growing a scrollbar (the bug ADR 0109's panel notes).
- **The bounds hold.** Drag as far down as it goes: the map keeps a visible strip (85% cap). As far up:
  the panel stops at a readable sliver, never at just the handle (6% floor).
- **Double-click a seam** and the panel returns to its default share.
- **The handle is a control.** Tab to it (it's a `separator`, focusable) and confirm ArrowUp/ArrowDown
  move the boundary 2% a press.
- **Several panels at once.** Open all five, then drag two of them tall. Nothing may run off the bottom
  of the window: the panels shrink to fit and the toolbar and titlebar stay reachable.
- **Interface scale — the reason a height is a share.** Size a panel, then step the map's A− / A+ (60%
  → 100%). The panel must stay the *same fraction* of the window at every scale, and dragging at 60%
  must still track the pointer 1:1 rather than at 0.6× or 1.67×.
- **It's remembered, per panel and per window.** Size the ☠ list, close it with its toolbar button,
  reopen it: same height. Quit and relaunch: same height. Then confirm the 📖 panel beside it kept its
  *own* height rather than adopting the other's.
- **A maximize doesn't distort it.** Maximize the map window: every panel keeps its share, so a panel
  sized to a third of a small window is a third of a large one.

## The hover card's placement (ADR 0123)

Verified in Electron over a real results list, at 100% / 80% / 60% — but by measurement, not by
looking at it. What a measurement can't judge is whether the result *reads* right.

- **Beside the name, at every scale.** In Search, type something with several hits and run the cursor
  down the results. The stat card must appear **beside** each name — never on it — and it must stay
  beside it as you step the interface scale from 100% down to 60% (Settings, A− / A+). Sliding onto
  the word as the interface shrinks is the bug this fixed, so that's the one to watch for.
- **A narrowed card is still a card.** Hover a long item name in a narrow window (drag the overlay in
  towards its 340px minimum). The card gets slimmer rather than jumping below the name — confirm it's
  still readable at that width, and that a name long enough to leave no room either side drops below
  as a last resort rather than squeezing to a column of single words.
- **What it's allowed to cover.** It will overlap the era badge and + Add button of the rows either
  side, and the tail of a long neighbouring name. Confirm that reads as acceptable — if it doesn't,
  the fix is to spend the slack pushing the card to the window's right edge (see the ADR).
- **Everywhere, not just Search.** The same card is behind every item name: a kill group's drops, a
  mob's knowledge, a wiki page's prose, and over the map window. Hover one in each and confirm the
  placement holds — prose in particular, where a name can wrap across two lines.
- **The map's cursor tip.** In the map window, step its scale up to 200% and hover a pin, a kill and a
  peer. The tip must appear at the cursor, not out at twice its distance from the corner.

## Asking Lucy (ADR 0124)

The client, the parser and the era verdict are unit-tested against real captured pages, and the whole
chain has been driven end to end against the live site from a script — search, single-hit redirect,
item fetch, era verdict, cache, negative cache. What that can't judge is how it **reads** in the app,
and one thing it can't test at all is the polite behaviour over a long session.

- **The third heading appears only when it should.** Search a name eqlwiki knows (`Bone Chips`): no
  Lucy heading at all, and no request. Search something in your bags the wiki hasn't got: your own
  log's heading, and still no Lucy. Search a name neither has — an item off someone else's corpse, or
  a tooltip you screenshotted — and the Lucy heading appears *after* the other two have given up.
- **A Lucy row opens rather than adds.** Confirm there is no `+ Add` on those rows, that clicking the
  name shows a brief load and then the item's page with the Lucy block on it, and that the page's own
  `+ Add` works from there.
- **The era badge is legible without the ADR.** Most rows will read `era ?`. Confirm that reads as
  "not checked yet" rather than as a fault, that the hover explains it, and that opening a row settles
  it to `in era?` or `out of era` — visibly, on a repeat of the same search.
- **`Hide out of era` behaves.** With it on, a known-out Lucy row disappears and an `era ?` row
  **stays**. That's deliberate (hiding what you couldn't judge is how a filter starts lying) — confirm
  it reads that way rather than as the toggle not working.
- **`Ask Lucy` off means silent.** Untick it, search a name nothing knows: no heading, no request, and
  the previously-fetched Lucy blocks stop appearing on item pages too.
- **A card-less wiki page gains one.** Find an eqlwiki item page that is a stub (no stat card) for an
  item you have already opened through Lucy, and confirm Lucy's card appears beneath it — and that a
  wiki page *with* a card never mentions Lucy at all.
- **The zone links go somewhere.** In the Lucy block, a placeable zone should open the map at our name
  for it (`The Hole`, not `Ruins of Old Paineel 2.0`); an unplaceable one should be plain text.
- **↗ Lucy is on every item, and lands.** Beside ↗ eqlwiki on both item page headers, and as `↗L` on
  every shopping-list row — but **not** on a mob row or a quest group's header. Click one for an item
  the app has never fetched: the browser should land on the *item's page*, not a results list, for any
  exactly-named item. Confirm too that the row's own click-to-expand doesn't fire when you hit the
  button. Then untick **Ask Lucy** and confirm every one of those buttons disappears.
- **A name Lucy hasn't got.** Click ↗L on something this build invented (a `+2` item, or anything the
  app only knows from your log). Landing on Lucy's "0 found" is the correct outcome — confirm the
  hover text prepared you for it rather than it reading as a broken link.
- **It stays polite over an evening.** The thing no test covers: play with the app open, search a good
  number of unknown names, and confirm the app never feels like it is queueing behind Lucy — and that
  `userData/lucy-cache` is filling up rather than the same pages being re-fetched. A second run of the
  same searches should hit the network **not at all**.

## A control on the alert overlay (ADR 0147)

The tracker is renderer logic and typechecks, but the thing it is really claiming — that a
`focusable: false`, always-on-top, click-through window will deliver a click to a button without
taking focus off EverQuest — is an OS-level promise nothing here can exercise. All of this wants a
full-screen (windowed or borderless) game running behind it.

- **The ✕ dismisses.** Let a tracked buff lapse so a reminder is drawn, then click its ✕. The row
  should go, and **the game must not take the click** — nothing swung at, no target changed.
- **Focus stays in the game.** After that click, type a movement key without clicking anything else.
  If the character moves, the overlay took no focus, which is the whole point.
- **The row itself is still glass.** Click the buff's *name*, an inch from the ✕. That click belongs
  to the game — confirm it lands there.
- **Everything off an island is glass.** With a reminder up, click across the rest of the display:
  the banner area, a pinned countdown, empty overlay. Every one of those should reach the game.
- **Leaving ends it.** Park the cursor on a ✕, then move it away and click. The click goes to the
  game, immediately — not after a wiggle.
- **Placing a spot still works.** Settings → Alert style → *Place a spot*, with a buff reminder on
  screen. The whole overlay should be solid for that moment, the click should place, and Esc should
  cancel — the tracker must not turn the catcher back into glass under the pointer.
- **And afterwards the overlay is glass again.** Place a spot, then click somewhere the reminder is
  not: it must reach the game.

## A look edited where it is worn (ADR 0148)

- **Every wearer has a 🎨.** A spawn timer with 🔔 on, a tracked buff with Notify on, the Records
  board's celebration, and the shopping list once a row is armed. In each: the picker names a look,
  🎨 opens the drawer under the row, and the line above the controls says who else wears it.
- **The shared edit is shared.** Open a buff's 🎨, change the colour, and confirm the *Alerts* tab's
  list shows the same look changed — and that a second buff wearing it changed too.
- **The fork is not.** Pick *＋ New style from this one…* on one timer. It should get a new named
  style, open it, and leave every other timer alone.
- **The blank is the built-in.** A spawn timer's picker should show "Spawn timer (default)" and
  **not** also list "Spawn timer" by name; 🎨 with the blank chosen must edit that same look.
- **The preview lands.** ▶ Preview alert inside one of these drawers should put a sample banner on
  the overlay wearing the look being edited.

## A debuff is only yours (ADR 0149)

The gate is unit-tested; what isn't is which real log lines reach it. Wants a session where things
are casting at you.

- **A debuff cast at you leaves no trace.** Get crippled, slowed or snared by a mob, let it wear off,
  and confirm the Buffs tab grows **no row** for it — not a silenced one, none — and that nothing
  appears on the overlay.
- **Your own still works.** Snare or root something, let it wear off mid-fight: the banner should be
  immediate, the standing row should appear, and both should go when the fight ends.
- **And it says whose it is.** That spell's row under *Spells* should read **yours**, not "cast on
  you", and carry the `debuff` tag.
- **It survives the gap between cast and fade.** Snare something, zone, come back, let it wear off —
  the row should still appear. (`pending` is cleared at a zone line and must not be what answers this.)
- **Old rows are gone once.** If a `buffs.json` from an earlier build has debuff rows for things cast
  at you, they should be absent after one launch and the file rewritten — and your own debuffs should
  come back on the next cast-and-fade rather than staying missing.

## Zoning ends a debuff (ADR 0150)

- **A debuff does not follow you.** Snare something, let it wear off so the standing row appears,
  then zone. The row should be gone the moment you land.
- **Your buffs do.** With buffs up, zone: *Up now* should be unchanged, holding the same "up for"
  figures rather than restarting them.
- **A debuff on you goes too.** Get slowed or crippled, zone before it wears off, and confirm nothing
  about it appears afterwards — EQ strips it at the line, so there is nothing to report.
- **The spell keeps its row.** After all of the above, the *Spells* list should still hold Snare with
  its ticks as you left them.

## A timer built from a kill (ADR 0151)

Everything here is unit-tested and was verified by replaying a real store (4,559 kill records) through
the tracker; what has not been done is the clicking. Wants an evening at a camp.

- **The picker offers what you killed.** Spawn tab → *Add a timer* → the *From a recent kill* box.
  It should list the mobs you have actually killed, newest first, each with its place and how long ago
  — including ones the article test hasn't settled, and including the mob you killed a minute ago.
- **Picking fills the form and says Mob.** Name, place and the **Mob** toggle should all be set from
  the kill, without typing. The hint under the form should name the kill it will count from.
- **The countdown starts from the kill, not the click.** Pick something you killed a few minutes ago,
  give it an interval, Add — the row under *Coming up* should already be that few minutes in. This is
  the one thing to actually watch: a full interval on the clock means the moment isn't reaching
  `markDead`.
- **A stale kill sets the figure and no clock.** Pick something you killed days ago. The hint should
  say so, and the result should be a row under *What we've learned* carrying the figure with **nothing**
  under *Coming up* — then killing it should start the clock.
- **A learned camp keeps its history.** Pick a camp that already has measured gaps and give it a
  figure. Its gaps, sightings and padding should all survive, and it should **not** gain a *Remove*
  button — only *Not a named…*.
- **A blank row says why it's blank.** A named you have killed once should read *not timed yet* with
  "Killed once…" under it. One whose gaps all spanned a difficulty change should say that instead —
  worth checking after an evening of switching instance difficulty, which is where it came from.

## Searching items by what they are (ADR 0152)

Every rule is unit-tested and the parser was run over the whole real page cache (290 items, 269 with
numeric stats, and the facets it derives — 18 slots, 16 classes, 122 zones, 9 flags — all read
correctly). What has not been done is the clicking, in a real window at a real width.

- **The tab opens onto the whole catalogue.** Items tab → a table of everything you've opened, sorted
  by name, with the card's own numbers in the Stats column. The line beside *Value weights* should
  say how many of how many, and it should be the number of item pages you've actually visited.
- **A criterion only ever cuts.** Tick a slot; the count falls. Tick a second slot in the same
  dropdown; it rises again but stays under the unfiltered total. Add a class, then a stat floor —
  each one should only ever take rows away, and `Clear (n)` should count them.
- **The weight sheet is the ranking.** Open *Value weights*, put 2 against INT and 1 against WIS,
  sort by Value: an item with 5 INT should sit level with one with 10 WIS. Clear the weights and the
  Value column should go back to `—` rather than to some default order.
- **Less-is-better needs a sign.** Put `-0.5` against Weight and confirm the heaviest items sink.
  The boxes for Delay and Weight show a `−` placeholder; check the hover says why.
- **A stat floor cuts the silent card.** Set `INT ≥ 5`. Quest items with no stats at all must
  *disappear*, not sit at the bottom with a zero — that's the rule the whole filter rests on.
- **The columns follow the question.** With no weights and no floors there should be one Stats
  column of text; weight a stat and it should become its own sortable column, in card order.
- **It fits a narrow window.** Drag the window in to about half width: the criteria row should wrap
  rather than push controls off the edge, and a facet menu opened near the right edge should still be
  readable. Worth checking at 90% and 130% interface scale too.
- **The joins still work from here.** An item name should hover for its card and open its page
  (landing on the Search tab); **+ Add** should put it on the list and raise the usual toast; a Lucy
  row should be badged and should never outrank the wiki's copy of the same name.
- **It comes back as you left it.** Set some criteria and weights, switch to List, come back — all
  of it should still be there, and still be there after restarting the app.

## Filling the item catalogue (ADR 0153)

The schedule is unit-tested with injected fakes, and a real 12-second run against the live wiki was
watched end to end: roster 11,136, nine pages fetched at the 1s pace, cards parsed, checkpoint
written, and a resume that picked up at 9 rather than starting over. What has not been done is the
**long** run, or the clicking.

- **It says what it will cost before it starts.** Items tab → the strip on top should read
  "N items cached" with the pace picker beside it. Pick a pace and confirm the label is in hours.
- **It runs, visibly.** Press *Fill the catalogue*: the bar should move, the note should name the page
  in flight, and the ETA should count down. Leave the tab and come back — it should still be running,
  because the run lives in main, not in the panel.
- **Stop keeps the place.** Press Stop mid-run: it should finish the page in flight, say
  "Stopped at N of 11,136", and the button should become *Resume filling*. Resume and confirm it
  carries on rather than starting from the top.
- **It survives a restart.** Stop, quit the app, reopen it, go to Items — the strip should offer
  *Resume filling* from where it was.
- **A second run is cheap.** Once filled, press *Check for new items*: it should race through the
  roster (no gap on cached pages) and finish in seconds with a large "already held" count.
- **The catalogue actually grew.** After a run, the count in the strip and the total in the filter
  line should both be in the thousands, and a stat search (say `AC ≥ 20`, slot CHEST) should return
  far more than it did before. Sorting by value should now be over the whole wiki, not your history.
- **The long run, for real.** The one thing only time can test: leave it going for the full ~3 hours
  and confirm it finishes, that memory doesn't climb, that the app stays responsive while it runs,
  and that the failed count stays small. Note what the failures were — a handful is expected, a
  hundred means something changed.
- **It is gentle.** Worth one look at the wiki from a browser while it runs: the site should feel
  entirely normal.

## Lucy's mirrored name list (ADR 0154)

Verified live: the 1.6 MB file downloads, parses to 134,079 names, and `Dragon Dirk` finds
`Dragoon Dirk` in ~45ms where Lucy's own search finds nothing. Not yet exercised through the UI.

- **A misspelling finds it.** Search tab, with `askLucy` on, for a name neither eqlwiki nor your log
  knows — misspelled. Lucy's heading should offer sensible hits, where before it offered none.
- **The first search is the slow one.** On a fresh install the first Lucy search goes over the wire
  and the mirror downloads behind it; the next should be instant. Confirm nothing blocks visibly.
- **Turning Lucy off means off.** With `askLucy` unchecked, confirm no mirror download happens and
  no Lucy results appear.

## A camp arms its own alert (ADR 0152)

Unit-tested and replayed against a real store; the clicking is what's left. Wants an evening at a camp.

- **Two kills, and it speaks.** Sit at a named and kill it twice without touching anything. The row
  should tick **Notify** by itself and show `· camping` beside it, and the next pop should raise a
  banner you never asked for.
- **One kill stays quiet.** Kill a named once on the way past. No tick, no `· camping`, no banner.
- **Off means off.** Untick a camp you're sitting at, then keep killing it. It must never re-arm, and
  the `· camping` note should go the moment you touch the box either way.
- **A login resets the tally.** Kill a named, log out and back in, kill it once more — that is two
  sittings, so it should still be silent. (Restarting EQ-List does the same.)
- **A camp with no figure still arms.** A named whose gaps all spanned a difficulty change starts no
  countdown, but killing it twice should still tick Notify — you are just as much camping it.
- **First launch after this build**: a camp you had previously switched off may arm itself once, since
  the old file couldn't tell "off" from "never asked". Turn it off again and it stays off.

## A gap stops teaching after three hours (ADR 0152)

- **An overnight gap teaches nothing.** Kill a named, sleep, kill it in the morning: its figure must
  not move, and the sample count must not grow.
- **But it's still "last killed".** That same row's *last killed* should read this morning, and the
  kill should still be on the map — old kills keep informing location and last-seen.
- **A long timer is still reachable by hand.** Type 6h on a camp, then mark it **up** five hours after
  it died: the sighting must be accepted and the figure tighten to 5h. This is the case the two
  different ceilings exist for — if it's refused, the gap rule has leaked into observations.

## Buff tracking, after the log-replay pass (ADRs 0155–0159)

All five were found by replaying a real 372,004-line log through the real tracker and are covered by
unit tests. What a replay cannot judge is how the board reads while you play.

- **Your own buffs come down.** The big one (ADR 0155). Get a buff on you, let it wear off, and
  confirm the row leaves *Up now* and appears as a standing lapse — for a spell that fades with
  flavour text ("The spirit of wolf leaves you"), not just one that names itself.
- **A pet buff is one row.** Buff your pet, let it drop, and confirm it does not appear in *Up now*
  and the missing list at the same time under two names.
- **A group-mate's pet is still theirs.** Buff someone else's pet: it should get its own row under
  the pet's name, not merge into yours.
- **Heals are absent.** Heal a group-mate several times and confirm no `Light Healing` row appears
  anywhere — and that a heal-over-time you actually maintain still does.
- **Gate and bind are absent.** Gate, bind, feign: none should enrol.
- **Nothing nags about a debuff on your side.** Get your pet rooted or yourself snared; when it wears
  off there should be no banner and no standing row.
- **`seen up N×` is believable.** Stand next to a bard for a while, then check the *Spells* list: the
  songs should read in the tens, not the thousands, and the buffs you maintain should not be buried
  beneath them.

## A room filling the catalogue between it (ADR 0160)

Every rule is unit-tested with injected fakes — the sharding, the planner, the claims, the inbound
page reader — and the solo harvest was watched against the live wiki. What has **not** happened is
two real clients in a room, which is the only way to test the half that matters.

- **Two clients, one room, from empty.** On both: Peers tab → switch on *Item pages*. Then press
  *Fill the catalogue* on both within a few seconds of each other. Watch the strip: they should be
  fetching **different** pages, and each one's "from peers" count should start climbing. The wiki's
  total across the pair should end up near 11,136 rather than near 22,000 — worth confirming from the
  debug log, which names every page fetched.
- **A newcomer catches up in minutes.** With one client filled, start a *third* install (or clear the
  other's cache) and open the Items tab. Before pressing anything, the strip should show a pale room
  bar near full behind an empty solid one, and say peers already hold most of it. Press Fill: it
  should be almost all "from peers", and finish in minutes rather than hours.
- **Nothing is duplicated.** While one is mid-shard, the other's note should never name a page the
  first is currently on. If both idle with "waiting", that is correct behaviour when the only gaps
  left are claimed — one should pick up within a few minutes.
- **A peer dropping doesn't strand its shard.** Kill one client mid-run. The other should take over
  the abandoned shard within ~3 minutes (`CLAIM_TTL_MS`) rather than waiting for ever.
- **The toggle is real.** With *Item pages* off on the holder, the other client should get nothing
  from them and fall back to the wiki — no pages should cross.
- **Pages that arrive are usable.** After taking shards from a peer, search the Items tab by a stat
  and confirm the peer-sourced items appear with full cards, hover correctly, and open their wiki page.
- **It is still gentle.** Two clients filling at once is still one request per second *each*; worth
  one look at eqlwiki in a browser while both run.

## Five spawn-tracking fixes (ADR 0153)

All five were found by replaying a real log and are covered by tests; what wants confirming in game is
that the log lines really do read as expected on this server.

- **No pets on the board.** After an evening with a pet class in the group, the Timers tab should hold
  no row ending in "pet" — and the pet's *owner* should still be there in its own right.
- **Considering a rare named counts as seeing it.** With a countdown running, target the named and
  consider it. The row should flip to ALIVE, and its figure should become *seen* with the gap since it
  died. This is the one to watch: it silently did nothing before.
- **Restart, then change difficulty.** Start a countdown, restart EQ-List, then change instance
  difficulty. Every mob countdown for that place must go. (Before, it survived.)
- **Nip out and come back on another difficulty.** Start a countdown, zone to town, then zone back at a
  *different* difficulty. The countdowns must go. Come back at the **same** difficulty and they must
  stay.
- **A timer you made survives a repop.** With both a mob countdown and a plain timer running in one
  zone, change difficulty: the mob's goes, yours keeps running.
- **A hand-added camp reads honestly.** Add a mob you have never killed, with no interval. The row
  should say *"Not killed yet"*, not *"Killed once"*.

## Freshness, and refreshing a page by hand (ADR 0161)

Verified against the live wiki: a cached read is ~6ms against a ~300ms fetch, ↻ produces a new
timestamp on an already-fresh page, a page 20 days old is **refused** past the 14-day TTL, and a
1-day-old shared page keeps the sender's age rather than being stamped "now". Not yet clicked.

- **The age is shown, and the button replaces it.** Open any item page: the header should read a
  relative age (e.g. "3 days ago") beside a ↻. Press ↻ — it should show "…" briefly and the age
  should reset to "just now".
- **It refreshes even when the page is fresh.** That is the point of the button: a page fetched an
  hour ago must still be re-fetched when asked.
- **The TTL is real.** Settings → *Keep wiki pages for* → set it to 1 day. Open an item you fetched
  more than a day ago; it should re-fetch (slower, and the age resets). Set it back to 14.
- **Changing the TTL takes effect immediately**, including mid-harvest — it is read per check, not
  captured at startup.
- **Item pages share without being switched on.** On a fresh install, Peers tab → *Item pages* should
  already be ticked, and every other share toggle unticked. Untick it and confirm it *stays* unticked
  across a restart — an explicit no must survive.
- **Two clients, ages preserved.** Fill on one, take shards on the other, then check an item's page
  age on the receiver: it should show roughly when the *sender* fetched it, not "just now". This is
  what stops a room's cache from becoming immortal, and it is the one thing only two clients can show.

## Selecting all of a facet

Pinned in unit tests, and the counts checked against the filled catalogue (11,171 items, 154 zones,
4,560 of them naming no zone). Not yet clicked.

- **All ticks everything.** Items tab → the Zone picker → *All 154*. The count under the criteria
  should fall to 6,611 — **not** stay at 11,171, because items with no zone are cut. The note in the
  menu should say so before you wonder why.
- **Filter, then All, ticks only what matched.** Type `karana` in the picker's filter box: the button
  should read *All 8 shown*, and pressing it should tick the eight Karana zones and nothing else.
- **It adds rather than replaces.** Filter `karana`, press All; clear the filter, type `freeport`,
  press All. Both sets should be ticked — the second press must not discard the first.
- **Clear still clears everything**, including values hidden by the current filter.
- **It works the same on the other five pickers** (slot, class, race, source, flag) — the button is
  generic, and only the numbers in the note differ.
- **(none) reaches what no value can.** The Zone picker should list *(none) · 4,560* above the zones,
  separated by a rule. Tick only that: the results should be the 4,560 items with no zone — quest
  rewards and crafted goods — which nothing else in the picker can show you.
- **The halves add up.** *All 154* → 6,611. *(none)* alone → 4,560. Both → 11,171, i.e. no filter at
  all. If those three don't agree with the catalogue's own total, the facet is lying somewhere.
- **It ors, it doesn't replace.** Tick `Blackburrow` and *(none)*: you should get Blackburrow's items
  *plus* the unsourced ones, not one or the other.
- **The note points at the fix.** With zones ticked and *(none)* not, the menu should say how many are
  hidden and to tick *(none)* for them — and that note should disappear once you do.
- **Nothing ever shows the sentinel.** The button, its hover, and the chips should read "(none)" or
  "no zone" — never a stray control character.

## An item's level (ADR 0163)

Derivation is unit-tested and measured against the filled catalogue: with only 226 mob pages held,
56% of 11,171 items already get a level (572 from a mob, 190 from a quest, 5,467 from a zone, 4,942
unplaced). What has not been done is the second harvest that turns most of those estimates into
facts, or the clicking.

- **The column reads, and says where it got it.** Items tab → a Level column. Hover a row: it should
  name the evidence — "a festering hag is level 28–30 — from the mob that drops it". A zone-derived
  one should be **dim italics** and say so; an unplaced one shows "—".
- **The band cuts to what you can use.** Set Level 1–20: high-end items should disappear, and so
  should everything with no level at all. Sorting by Level ascending should lead with the low ones and
  put the unplaceable at the bottom, not the top.
- **It overlaps rather than contains.** An item off a mob spanning 21–23 should survive a band of
  1–22 — it is a level-22 character's item.
- **The second run is where this pays off.** Press *Check for new items* after a completed harvest:
  the roster should grow from ~11,136 to ~12,900 (the **zones** and quests items name — not the 4,214
  mobs), and when it finishes the Level column should be mostly mob-derived rather than zone-derived.
  **This is the run worth actually doing** — the difference between a column of guesses and one of
  facts, for about half an hour more.
- **Zone pages are doing the work.** Watch the run: it should fetch zone names, not mob names. If you
  see it fetching thousands of individual mobs, the roster is wrong.
- **The pace picker tells the truth about the size.** Its hours are computed from what is left to
  fetch, so on a fresh install it should read ~3–4h at Gentle and much less once mostly filled.
- **Zone and quest pages share too.** In a room, a peer should be able to hand over shards containing
  zone pages — check a level shows as mob-derived on a client that never fetched that zone itself.
  A zone page is the biggest thing that crosses (Kael Drakkel lists 508 NPCs), so it is the one to
  watch if a shard transfer ever misbehaves.

## Effect dropdowns and the fuzzy effect search

Parsing is pinned against verbatim card lines and measured on the filled catalogue: 796 distinct
effect names — 21 worn, 485 click, 275 proc, 81 focus — including **17** with "Haste" in the name,
which is what the fuzzy search exists for. Not yet clicked.

- **Four pickers, on their own row.** Items tab → *Effects* → Worn / Click / Proc / Focus. Each should
  offer only effects reached that way; a worn haste must not appear under Click.
- **The fuzzy search is the point.** Open *Focus* and type `haste`: it should reach `Spell Haste I`,
  `Summoning Haste II`, `Brittle Haste III` and the rest. Then type it **misspelt** (`hsate`) — the
  literal pass will find nothing and the fuzzy pass should still offer them.
- **Literal hits lead.** Type `spell` in Focus: the ones actually containing "spell" should be at the
  top, with fuzzy near-matches under them rather than interleaved.
- **It helps the other pickers too.** In Zone, type `Feerot` — The Feerrott should still come up.
- **Kinds are not interchangeable.** Tick a Worn effect and confirm the results are items that have it
  *worn*; the same name under Click should give a different set.

## The newest copy in the room (ADR 0164)

Unit-tested against a temp cache; the two-client half is untested.

- **A peer's re-pull reaches you.** With two clients holding the same page, refresh it on one (↻), then
  let the other take that shard. The second should end up showing the *newer* age on the item page —
  not its own older one, and not "just now".
- **An older copy can't overwrite a newer one.** The reverse of the above should change nothing.
- **Expiry routes through the room first.** Set the TTL to 1 day, let a page expire on one client, and
  watch it fill: it should come from the peer rather than from eqlwiki. Only with no peer holding it
  should the wiki be asked.

## The Items tab, for speed

Measured rather than guessed, against the real 11,519-file cache: the catalogue builds in ~400ms once
(yielding every 100 files, worst event-loop stall 12ms rather than one 400ms block), later reads are
0ms, `items.status()` went 327ms → 0ms, and what crosses to a window is 4.3 MB of prebuilt rows
instead of 11.3 MB of pages. Two real launches confirmed exactly one build. What's left is the feel.

- **Opening Items is instant**, both the first time (main warms it ~4s after launch) and every time
  after. If the first open ever shows "Reading the item cache…" for more than a blink, the warm-up
  didn't run.
- **Nothing else stutters while it builds.** On a cold start, open Items immediately and watch the
  overlay and map: they should stay responsive. A frozen map for half a second means the yield broke.
- **Switching away and back is free** — no flicker, no "Reading…", the same rows and the same scroll.
- **Typing in the name box is immediate** on 11k rows, as are the facet pickers and the level band.
- **After a harvest finishes** the catalogue re-reads once and the count grows; it should not re-read
  on every page fetched *during* the run.

## The level cap slider

Measured on the real catalogue: cap 10 → 6,919 of 11,125 shown, 20 → 7,487, 40 → 9,297, 60 → 11,122,
off → 11,125. 22 items carry a level stated on the card; 4,911 have no known level at all.

- **Dragging it shrinks the list.** Items tab → the slider beside the Level floor. Drag it down and
  the count should fall smoothly; the read-out beside it shows the cap, `60+` at the far right.
- **The far right means no cap.** At maximum the ✕ disappears and nothing is filtered.
- **It hides what you can't use.** At cap 20, `Baton of the Sky` (a card that says "Required Level:
  49") should be gone; hover a surviving row's Level to see which rung placed it.
- **It does not hide what it can't judge.** The note beside the slider names how many items have no
  known level, and those stay visible at every cap — a cap that hid them would drop 44% of the list.
- **An effect's level is not a requirement.** `Sabertooth Short Bow` has a level-15 proc and no wear
  requirement; it should survive a cap of 5.

## The packed catalogue (the Items tab's launch cost)

Measured in-process against the real 11,519-file cache: **cold 636ms** (walk + build + pack), **warm
26ms** (a fresh client reading the pack), in-memory 0ms, worst event-loop stall on the warm path 0ms.
The packed rows carry everything — 22 card-stated levels, 579 mob, 190 quest, 5,455 zone; 154 zones
and 491 click effects in the facets. Not yet watched through two real launches.

- **The first launch after this change is the slow one.** No pack exists, so it walks (~700ms) and
  writes `wiki-cache/catalogue.pack` (~4.3 MB). The debug log says `catalogue: N rows built in …`.
- **Every launch after that is fast.** The log should say `catalogue: N rows from the pack`, and the
  Items tab should open with no perceptible wait.
- **A harvest invalidates it.** After fetching pages, the next Items open rebuilds and re-packs — one
  slow open, then fast again.
- **Deleting the pack is safe.** Remove `catalogue.pack` while the app is closed; it should rebuild
  silently on the next open.
- **A corrupt pack is safe.** Write junk into it; the signature check should reject it and rebuild
  rather than showing a broken or empty list.
- **Populating does not freeze the app.** The one that actually mattered: with the tab open and the
  rows arriving, the mouse must stay live. Move it continuously while the list populates — any stall
  over a frame or two means something large is crossing `contextBridge` as objects again rather than
  as text. This was ten seconds of unusable input, and no measurement taken in main showed it.

## Launch, as an antimalware scanner sees it

Counted rather than timed, because the cost lands in somebody else's process: a relaunch now opens
**21 files** where it used to open **11,541** (the peer room's coverage was walking the whole page
cache for a list of titles). Verified against the real 11,521-file cache.

- **Launch should not spike the antimalware service.** Watch Task Manager's *Antimalware Service
  Executable* while starting the app. A brief flicker is normal; sustained CPU for seconds means
  something is walking the cache again.
- **The first launch after this change is still a cold one** — it walks once to build the pack, so
  expect one slow start, then quiet ones.
- **A harvest is the other burst** — it writes a page a second for hours. If the scanner is a problem
  during one, an exclusion for `%APPDATA%\eq-list\wiki-cache` is the blunt fix.
