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
