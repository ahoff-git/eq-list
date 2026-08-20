# Overlay UI

## Purpose
Give the player **one** window: a frameless, translucent, always-on-top float (the
"overlay" look) that sits over the game, lights up on drops, and holds everything —
list, hunt, search, damage, session, settings.

## Responsibilities
- **Window shell** (`src/app/page.tsx`, `.app.glass`): frameless, transparent,
  resizable, translucent. The **title bar** (`Titlebar`) is the drag handle — it snaps at the
  screen edges and maximizes on a double-click, see **Dragging and snapping** below — and carries the
  window controls — an **opacity toggle** (◐, flip between 100% and the settings slider value),
  **pin** (always-on-top — the shared `PinButton`, gray off / red on, same as the map window),
  **click-through** (👻, below), **minimize**,
  **interface scale** (the shared `ScaleButtons`: A− / A+, stepping `overlay.fontScale` over
  `UI_SCALE` — 60%–100%, the same value the Settings slider holds), **maximize/restore** (the
  shared `MaximizeButton`, see below) and **hide-to-tray** (`win.hide()`).
  **Pin, ◐ and 👻 are not settings**: they're *how this window was left*, so they live beside its
  bounds in `window-state.json` (`WindowToggles`), are applied by the main process when it **creates**
  the window, and are read back by the renderer through one `useWindowToggle` —
  [ADR 0074](../decisions/0074-how-a-window-was-left-is-window-state.md). The two windows therefore
  hold independent answers to all three. The interface **scale** is a setting, and is applied by each window's *own renderer*, as a
  CSS `zoom` on the document root (`useUiScale`) — see
  [ADR 0026](../decisions/0026-interface-scale-only-shrinks.md) for why 100% is the ceiling and
  [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md) for why it can't be
  Chromium's `setZoomFactor` (per *origin*, and every window shares one, so two windows could never
  hold two scales). **The map window scales separately** (`overlay.mapFontScale`, its own A− / A+):
  one window is a column of text you shrink to reclaim desk space, the other is a picture you
  enlarge to read. A shell inside a scaled window must size with **percentages, not `vh`** — a `vh`
  length is scaled by the zoom and comes up short. **Opacity** splits differently again:
  `overlay.opacity` is one setting for every window (one look for the app), while the **◐ override is
  window state** — the shared `OpacityButton` sits in both title bars and each flips only its own
  window, so you can read the map through clear glass without clearing the list. The two meet in
  `windowOpacity(opaque, saved)`, the one rule both ends use: main opens the window at that value
  (constructor, so no flash) and its **renderer** owns it thereafter (`useWindowOpacity`), which is
  the only end that knows both halves.
  **Click-through** (the 👻 toggle, `ClickThroughButton` + `useClickThrough`, in both title bars and
  remembered per window) hands the window's clicks to the game — but only over **one region**: the
  list's `.panel` and the map's `.map-body`, marked by spreading `PASS_THROUGH` onto them. The chrome
  around it — title bar, tab bar, toolbar, status bar, any open side panel — stays a window, which is
  what keeps the mode escapable, since the button that ends it is in the title bar. Electron's
  `setIgnoreMouseEvents(…, { forward: true })` still delivers mouse *moves* to a window that can't be
  clicked, so the renderer sees the cursor reach a control and asks for the window back at the
  crossing; a held button holds the window, so a drag off the title bar isn't dropped mid-gesture. The
  wheel is **not** forwarded, so the region is a glance and not a surface: no scrolling, no zooming,
  no clicking a row — hover, and therefore every stat card and tooltip, still works. See
  [ADR 0073](../decisions/0073-a-click-through-window-keeps-its-chrome.md).
  Show/hide also works from the
  global hotkey `Ctrl/Cmd+Shift+O` (`OVERLAY_HOTKEY`, registered in `main.ts`) and the
  tray. One window, styled once; see [ADR 0009](../decisions/0009-single-window-with-tray.md).
- **Dragging and snapping** (`Titlebar` + `useWindowDrag`, `electron/window-drag.ts`,
  `shared/window-snap.ts`): the title bar drags the window **with Windows-style snapping** — drag to
  the top edge to maximize, to a side for a half, into a side's top/bottom quarter-band for a quarter,
  with a translucent preview of where it will land; drag a maximized or snapped window and it is
  **pulled loose under the pointer** at the size it had before; **double-click** the bar to
  maximize/restore; **Escape** mid-drag puts the window back exactly where the press found it. This is
  *not* `-webkit-app-region: drag`, which is Chromium's own move loop and can only ever move the
  window — the whole reason none of the above used to work
  ([ADR 0108](../decisions/0108-a-frameless-window-snaps-like-a-framed-one.md)). The split: the
  **renderer owns the gesture** (`dragStart` / `dragMove` / `dragEnd(how)`), **main owns the window**,
  and **no coordinate crosses** — `dragMove` is a pulse and main reads
  `screen.getCursorScreenPoint()`, so a window's CSS `zoom` and a mixed-DPI desktop can't skew the
  drag. The geometry is pure and tested without a screen (`window-snap.ts`); the **cursor** decides
  the zone, not the window's edges, and a press only becomes a drag once it leaves the spot it landed
  in. `no-drag` on a control still means what it always did — it's now the class `useWindowDrag` looks
  for rather than a CSS property — so **every control in a title bar must carry it**.
- **Maximize / restore** (`MaximizeButton` + `useMaximized`): a frameless window draws its own
  titlebar, so it has to be given what the OS would normally provide. The button asks main to
  `maximize()`/`unmaximize()`, and main reports the window's `maximize`/`unmaximize` events
  back — so the glyph (▢ / ❐) follows the window even when something else maximizes it
  (a **double-click on the title bar**, a drag to the top edge, `Win+↑`, the taskbar), and is
  re-announced on every load so a reloaded renderer can't start out wrong. The button is the
  *display* of that state, never a second copy of it, which is why the double-click and the snap both
  simply call the same `win.toggleMaximize()`. Maximizing **squares the window's corners and hides
  its border** (`.maximized`): the rounded float look would otherwise leave four notches of
  desktop showing. The state persists per window in `window-state.json` beside — not instead
  of — the bounds, which stay the size to restore *to*; "Reset window position" clears it, since
  a window lost behind a maximized frame is what that button is for. Both the main and map
  windows have it; the **cast-alert overlay does not**, being click-through and
  `maximizable: false`, which is also why the main process can just ask `isMaximizable()`
  rather than track which window is the exception.
- **Launch order** (`main.ts`, `afterLoad`): the control window is created first and on its own; the
  **cast-alert overlay** and the **restored map window** follow once it has loaded (or at a 4s deadline,
  since a window that fails to load never reports one and no overlay means no alerts). Each of the three
  is a whole Chromium renderer parsing the app bundle, and creating them in the same tick spiked every
  core at once — a launch stutter you could feel in the mouse — for nothing, since none of them can show
  anything until it has loaded anyway.
- **System tray** (`main.ts`): show/hide plus the **dev-only** options kept out of the
  UI — Debug logging, Open debug log, Open developer tools (on the focused/main
  window), Reset window position, and Quit. The tray is the only way to fully exit
  (✕ hides to tray; the app stays resident).
- **In-app navigation** (`src/lib/nav.tsx`, `NavProvider`/`useNav`): a shared page
  history. Every item / mob / quest name is an `ItemLink` (`components/ItemLink.tsx`) —
  clicking it calls `openPage(title)`, opening that page on the **Search tab in-app**,
  never the browser; hovering it shows the wiki's item **stat card** (`WikiPage.card`
  via `useItemCard`, fetched lazily and cached, positioned `fixed` so the scrolling panel can't
  clip it). The card goes **beside the name, never over it** — `src/shared/tooltip.ts`
  (`placeTooltip`, pure + tested) picks the side: **right of the words, then left**, top-aligned with
  the name and slid up only as far as the window's foot demands. Below/above is the fallback for a
  window too narrow for either side, and that flip is measured from the name's *top* edge — doing it
  relative to the bottom is what used to land the card on the word you were pointing at. A card
  above is pinned by its own bottom edge, so a late-loading icon grows away from the name rather
  than back over it.
  Browser-style **back/forward** walks the stack: mouse thumb buttons (forwarded from
  main as `app-command` on `CH.navCommand`) and **Alt+←/→**. Only the explicit
  "↗ eqlwiki" button leaves the app. See [ADR 0008](../decisions/0008-in-app-page-navigation.md).
  **"Every name" means every name**: the mob a kill row is about, the mob a knowledge row tallies, the
  corpse a drop came off, the zone a hunt points at, and the mob and zone in the camp report are all
  `ItemLink`s too — they were plain text, so the same word was a link in one panel and inert in the one
  beside it. A click on a name **stops there** (`stopPropagation`): these sit inside rows that are
  themselves clickable, and a click that both opened the page and toggled the row would do the second
  thing to whatever the first thing scrolled into view. Several names on one line — what a kill
  dropped, who drops an item in a zone — are a `NameList`, so the comma between them is written once.
- **A page carries the evidence, not just the claim** (`components/WikiPageView.tsx`). A wiki page is
  someone else's sample of an older build ([ADR 0025](../decisions/0025-observation-over-the-wiki.md)),
  so a **mob's** page ends with `MobKills`: what your own kills taught, one block per zone you've
  killed it in — the count, how much of it was yours, coin per kill, the observed rates dimmed by
  sample size (`rateWhy`, shared with the map's 📖 panel so the same kills can't be described two
  ways), and the roam area. It's the map panel's data asked the other way round — **by mob** rather
  than by zone (`useMobZones`), which is the question a page raises and the panel can't answer.
  Every other page — an **item**, and a spell page, which is its scroll — ends with `ItemDrops`, the
  same tally read from the item's end ([ADR 0101](../decisions/0101-an-item-page-says-who-dropped-it.md)):
  who has dropped it, one row per mob with the camps beneath it, badged **not on the wiki** where no
  source on the page names that mob and **unseen in N** where the page names one our kills keep
  failing to confirm — plus what it has vendored for. It renders nothing when nothing is known, and
  only a page the wiki *says* drops gets a "you haven't seen this yet" note.
- **An add says what it did** (`src/lib/addToList.ts`, `src/lib/toast.ts`, `components/Toasts.tsx`).
  Every **+ Add** in the app — a search result, a result from your own log, a page's buttons, a
  component row — goes through one module that reads the list before and after itself and raises a
  brief notice naming what landed and **how many you now need in total**: the same parenthetical
  figure the row on the List tab shows, computed from the same `grouping.ts` functions, so a repeat
  press reads "+2 · 6 needed in total", a whole quest reads "2 items · 14 to collect in all", and an
  add that changed nothing says so instead of claiming success. The arithmetic and the wording are
  pure (`src/shared/list-add.ts`, tested without a window); the toast is bottom-right, ~3s,
  dismissable, capped at three, mounted by the **window shell** so it outlives the tab that raised it,
  and drawn **under the alert banners** — a confirmation must never cover *your item just dropped*.
  **One notice per thing**: each add carries a key (the item, or the page), and a second press
  replaces the card already up for it, in place and with its life restarted — never two cards
  disagreeing about how many you need. The notice machinery itself is general; see the next bullet.
  The button's own tick fires on click rather than on the reply, because "did it hear me" and "what
  did it do" are different questions. See
  [ADR 0106](../decisions/0106-an-add-says-what-it-did.md).
- **Brief notices, for anything that would otherwise be silent** (`src/shared/toasts.ts`,
  `src/lib/toast.ts`, `components/Toasts.tsx`). A **toast** is the smallest answer to *did that do
  anything?* — a title, optionally a detail, one of four tones (`info` / `good` / `warn` / `bad`,
  which colour only the left stripe so a notice keeps the same shape as everything else), gone by
  itself. **To use it: call `showToast({ title, … })`.** It's a plain function over a module-level bus,
  not a hook or a context, which is the whole point — it can be called from a component, a handler, or
  a plain module several layers under one (`addToList.ts`, `clipboard.ts`), none of which has a parent
  to thread a callback down from, and the panel that raised it may well be unmounted before it fades.
  The only requirement is that the window mounted **`<Toasts />` once**; both `page.tsx`es do, each
  with its own bus, so a notice appears in the window that raised it. Optional `key` (a second notice
  about the same thing replaces the first, in place, with its life restarted) and `ms` (clamped — a
  card that leaves before it has arrived reads as a flicker). Three invariants make it safe to reach
  for: a toast is **read, never acted on** (anything with a decision in it is a panel), it **always
  goes away by itself**, and it is **never the only place** something important is said — a failure
  that matters belongs in the log and on the panel that owns it
  ([ADR 0052](../decisions/0052-an-error-goes-to-the-log-not-the-screen.md)), and a toast raised in a
  window with no host is simply dropped. Callers today: every **+ Add**
  ([ADR 0106](../decisions/0106-an-add-says-what-it-did.md)) and every **copy to the clipboard**
  (`lib/clipboard.ts` — the share code and the meter's summary line, both of which used to fire a
  promise nobody awaited, so a copy that never happened looked exactly like one that did).
- **Every position on a page opens the map, and the observed ones say what they are.** A stat card's
  `Zone:` views that zone (`api().map.openAt`), an embedded `(y, x)` opens it *and* drops a marker
  there, and a mob's observed roam centre is **printed as `y, x ±spread`** — a figure to read and type,
  not just a control — which opens the map there *and* brings up the 📖 panel narrowed to that mob and
  drop, with its kills ringed
  ([ADR 0104](../decisions/0104-a-position-is-read-and-arrives-with-its-evidence.md)); the wording under
  every such figure is one shared sentence (`roamWhy`), and the coordinate one shared `locText` — a page is text, and where a thing lives is
  the one part of it that belongs on a map. Hovering a `MobKills` block rings that mob's kills on a map
  that's **already open** (`map.emphasize`, the Hunt tab's gesture); it never opens one, since a window
  that appears because the cursor crossed a name is a window nobody asked for.
- **One way to say "show me on the map."** Every click that opens the map goes through `MapLink`
  (`components/MapLink.tsx`) and every ask that only *rings* kills goes through `src/lib/showOnMap.ts`
  — `showOnMap(target)`, `ringMob(mob | null)`, `ringOnHover(mob)`, `openMapWindow()`. Five lists had
  each grown their own copy and drifted: two spellings of the tooltip, three of the coordinate, and a
  `focus` only the newest ones passed. The target is one shared shape (`MapTarget`: zone, optional
  spot, optional label, optional `MapFocus`), so a caller says as much as it knows and no more, and
  the difference that matters is stated once — **a click opens the map, a hover never does**. Three
  shapes over it: `ZoneLink` (a zone name), `MapLink` with a `loc` (a spot — a wiki `Location:`
  coordinate), and `RoamLink` (an observed roam centre: the coordinate *printed* with its `±spread`,
  worded by `roamWhy`). Any list that knows a place can add a map click in one element —
  [ADR 0104](../decisions/0104-a-position-is-read-and-arrives-with-its-evidence.md).
- **Shared presentational bits** (`components/ui.tsx`, no app knowledge in it): `StatTile` (a figure
  with its name under it, and a hover saying where the figure came from), `segCls` (a segmented
  control's button), `CheckField` (a checkbox and its label — including the "some of this group" state
  the map's label filter needs), `PickField` (a filter dropdown with its "any mob" / "any corpse" choice
  at the top), `Caret` / `caretGlyph` (which way an openable row's ▾ / ▸ points), `AddButton` (a "+ Add" that
  swaps to a tick and pops the instant it's pressed — see *an add says what it did* above) and `Empty` (a panel
  with nothing in it yet: what's missing, and **what would fill it in** — a blank panel that doesn't say
  what feeds it looks broken). Each of these existed anywhere from six to a dozen times over, with
  per-panel spacing baked into inline styles; spacing is now the stylesheet's (`.check-field`, and a more
  specific rule where a panel really does want its own). The strings panels count things with are shared
  too — `count` / `countOf` in `src/shared/format.ts`, so "1 kill" / "12 of 340 drops" is one rule rather
  than one per tally.
- **Tab bar** (`components/TabBar.tsx`): the row of tab buttons. When the window is too
  narrow to show them all, the ones that don't fit collapse into a **» menu** (a
  dropdown) instead of shrinking their labels off the edge — so every tab stays reachable
  without resizing. It measures natural tab widths from an off-screen ghost row and
  re-fits on resize (`ResizeObserver`) and when a label changes (the List count).
- **Tabs** (all wrapped in `NavProvider`):
  - `ListPanel` — the shopping list **grouped by the quest/recipe that added each
    item** (collapsible sub-bullets; standalone items fall into "Other"). Grouping is
    `src/shared/grouping.ts` (`groupByOrigin`). Entries are keyed by **name + origin**, so
    the same item can appear under **several headings** (e.g. rat ears wanted by a recipe
    *and* a quest); each entry reads **"5 of 3 (10)"** — you have 5, this group wants 3,
    and 10 are wanted across every group (shown only when it differs). A drop credits
    *every* group that wants the item, so the combined figure is the one that says whether
    you can stop farming — and **hovering the count breaks it down**, naming each
    quest/recipe behind the total and what it wants (with "×N runs" where that's why).
    `itemDemands` produces that breakdown and `itemTotals` sums it, so the number and its
    explanation come from one place. The entry's **+/− adjust
    how many you've acquired** (`obtained`); `needed` comes from the turn-in qty × runs.
    Entries flash on match; the name navigates in-app, and an ↗ button opens its eqlwiki
    page (`wiki.openInBrowser`, host-validated in main). A row can also be **armed** — the 🔔/🔕
    toggle (`notify`) raises a banner on the alert overlay the moment a loot line satisfies it
    ([ADR 0105](../decisions/0105-a-tracked-item-says-so-when-it-drops.md)), wearing the built-in
    **Loot** look; off by default, never offered on a mob, and silent once the entry is met. A quest/recipe group has a
    **×N runs** control (`list.setRuns`) — running a quest twice doubles every turn-in's
    needed count. `effectiveNeeded(entry, runs)` is the one source of truth for "how many
    you actually need". A quest/recipe group header also has an **↗ eqlwiki** button and a
    ✕ to remove the whole group. Each entry expands (▸) to a lazy-loaded **"where to get it"** —
    drop mobs grouped by zone (current zone first via `splitDropsByCurrentZone`) plus
    color-coded non-drop sources (`otherSources`); mob/source names are in-app links.
  - `SpawnOverlay` — pinned countdowns drawn **over the game**, on the same `/alert` window as the
    cast banner ([ADR 0099](../decisions/0099-a-countdown-can-stay-on-screen.md)). A banner answers
    "it's up now" once; this answers "how long left", which is what a camper asks constantly and
    could previously only read by alt-tabbing to the tab. Opt-in per timer, inert until one is
    pinned, `pointer-events: none` so a read-only list never takes a click back from the game, and
    it carries its own dark backdrop because it floats on a transparent body over whatever the game
    is showing. Each countdown appears **where its own alert would** — the same style and position,
    custom placed spots included — which is why `alertPlacement` and the `.overlay-at` position
    rules are shared with `CastAlerts` rather than copied.
  - `SpawnPanel` — the **Timers tab**: respawn countdowns for the nameds you kill, learned
    from the gaps between your own kills ([ADR 0092](../decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)).
    Two lists, answering different questions: **Due** is what's running, soonest-first, read at a
    glance mid-camp; **What we've learned** is the per-named figure, read while deciding where to
    sit. The rules are `src/shared/spawn-timers.ts` (pure + tested — the shortest-gap rule, the
    plausibility bounds, the window, the wording); the countdowns themselves belong to
    `electron/spawn-tracker.ts`, which persists a **due time** so a timer survives a restart and
    raises the pop as an ordinary alert (`event: "spawn"`) through the same overlay as everything
    else. **No figure is ever printed bare**: a learned interval is an *upper bound* from a sample,
    so `describeRespawn` words it as one ("at most 22m, from 3 gaps"), the same way a drop rate
    carries its kill count — and when the gaps **disagree** the range leads instead
    ("15m–45m, from 3 gaps") with a caveat naming the likely causes, since a lone figure gets camped
    to ([ADR 0094](../decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md)). A timer runs to a
    **window** rather than an instant: `pad` sets how early to be told, per mob, because a
    placeholder cycle and a mob that wanders are things the log can't measure and the player can —
    so the lower bound is theirs to set and is never inferred. With no padding (the default) the
    window never opens and the row behaves as a plain countdown. The player can also type their own
    interval (which nothing observed overwrites), **relearn** a mob to throw away what was measured,
    or say something isn't a named at all. **Mark UP** is the important one
    ([ADR 0097](../decisions/0097-a-sighting-is-the-tightest-evidence-there-is.md)): it ends the
    countdown *and* records `R ≤ now − killedAt`, which is the tightest bound the app can get,
    because unlike a kill gap it excludes the time spent reaching and killing the mob. Such a row
    reads **ALIVE** rather than a clock and outranks the countdown in both directions — you saw it,
    the estimate only guessed. **Notify** is a per-mob checkbox, **off by default**: tracking is
    automatic and camping is deliberate, so a timer runs and shows silently until you ask it to
    speak. **Killed it** is the mirror of Mark UP and the way to seed a clock the log couldn't —
    the app wasn't running, or the camp changed hands — and doubles as the undo for a mis-clicked
    sighting. Everything here is reversible on purpose: an editor holding a value offers **Clear**,
    and a mob you dismissed is listed under **Not tracked (n)** with a way back, because the button
    that dismissed it took its own undo off the screen. An **Evidence** line under each row says what
    each source claims — gaps, sightings, what you typed — with a ✕ per source, so one wonky figure
    is fixed where it came from instead of by throwing the camp's history away. The gap summary
    **opens** into the individual gaps, shortest first with the one *in force* marked, each of which
    can be thrown out or put back — the finest correction there is, and the only one that keeps
    everything else a camp taught. **＋ Add a timer** puts a row on by hand, with the **same type-ahead the alert rules use**
    (`SuggestField` over `useLogVocabulary`, on the `target` kind — kill lines already file a mob
    name there, so it completes the nameds you have actually fought) and the **map's own
    `ZonePicker`** for where — same `fuzzyRank` matching, same file-name search, same zone table, so
    there is one idea of what picking a zone is like; blank means *anywhere* here rather than the
    map's *follow the log*, which is the only thing that differs —
    a named you haven't killed twice, or anything else worth a countdown; the zone is optional and
    defaults to where you are, and a label no kill line matches just never re-arms itself, which is
    what lets one form serve both. A line above the rows says how mobs arrive, since "why isn't that
    named here?" is not guessable from an empty list. Each row also picks **which saved style** its
    banner wears (the Alerts tab's looks — a timer never grows an editor of its own) and can be kept
    **on screen**, which is a separate question from Notify on purpose: one is a moment, the other a
    dial ([ADR 0099](../decisions/0099-a-countdown-can-stay-on-screen.md)). Those last two **destroy something and therefore ask
    first**, inline and worded as what it costs ("Forget all 6 gaps measured…"), with the two
    answers as outcomes rather than yes/no — the `ForgetData` pattern from Settings, and for its
    reason: no native `confirm()` over an always-on-top window. They're also visually separated from
    the two that merely open a text box, since a row of identical links that ranges from "edit a
    field" to "discard an evening of measurements" is a trap. **Not tracked** lists the mobs you've
    dismissed with a way back, because dismissing one removes its row and the only control that
    could undo it lived there. Sits beside Hunt because `TabBar` collapses from the *end* and a
    timer you can't see is worse than no timer.
  - `HuntPanel` — the **Hunt tab**: inverts "how do I get each needed item" into
    "where do I go to farm what's left" — plus the mobs you put on the list to kill for their own
    sake ([ADR 0098](../decisions/0098-a-mob-is-a-thing-you-hunt.md)). A **target** is placed by
    *your own kills*, since a mob's wiki page carries no sources at all, and leads its zone because
    you named it explicitly; one you've never killed is listed under an unknown zone rather than
    dropped. `useEntrySources` fetches each still-needed
    item's sources (`wiki.getPage`, cached) and `src/shared/hunt.ts`
    (`neededEntries` → `huntInputsFor` → `buildHunt`, pure + tested) builds
    zones → mobs → the needed items they drop. Zones/mobs sort by how much of your
    list they cover; the current zone (`useCurrentZone`) floats to the top.

    **A `By zone` / `By item` toggle turns the page round**
    ([ADR 0125](../decisions/0125-a-hunt-is-two-questions.md)), because a hunt is two questions:
    *what does a trip to Lower Guk get me* and *where is this thing likeliest to drop*. By item is
    the **same built hunt inverted** (`huntByItem`), so every rule `buildHunt` applies holds in
    both. **The filter follows the grouping, in one control**: the zone picker (plus *follow*) by
    zone, and the same picker turned into a **search over the items on your list** by item — where
    the view deliberately looks everywhere, a zone narrowing being meaningless in a view whose whole
    answer is *which zone*. The item pick is transient rather than persisted: an item you finish
    leaves the list, and a filter that outlived it would open on an empty page.
    Each item lists everywhere it drops, **best rate first, then zone** —
    zone breaking the tie because two mobs in one zone is one trip — with an unmeasured place
    **last** and shown as a dimmed `—`, never as 0%. Items themselves are in name order, since a
    rate moves as you kill and a self-reshuffling list has to be re-read from the top. A mob you
    named keeps a section of its own, having no item to sit under. The choice persists per window
    (`STORAGE_KEYS.huntGrouping`) and defaults to by-zone. Each zone
    header carries **what level the wiki says its monsters are** (`zones/levels.ts`,
    [ADR 0122](../decisions/0122-a-zone-wears-its-levels.md)) — the question "go here"
    raises and the list itself can't answer. It's eqlwiki's own wording, bands and all
    (`1-20, 35`), never squeezed into a span; the hover says it's the zone's page rather
    than your kills, and a zone the wiki states nothing for (the cities) shows nothing.
    The **zone
    control is the map's** — a type-to-find [`ZonePicker`](../map/README.md) plus a
    **follow** checkbox — so picking a zone and tracking the one you're in are both one
    gesture away instead of one of them being a trip to Settings. Its options are only the
    zones your list actually drops in (`sourceZones`), blank means *all zones*, and
    `zoneMatches` does the filtering. Follow is still the `overlay.followZone` setting, so
    the checkbox and the Settings toggle are one value and can't disagree; naming a zone by
    hand turns follow off rather than being overridden the moment you travel. The picked
    zone is owned by the parent (`page.tsx`) so it survives tab switches — and turning
    follow off returns you to it. Each item shows its **drop rate** for that mob (`useMobLoot` fetches the
    hunt mobs' loot pages, since the rate lives there, not on the item) — reconciled against
    **your own kills**: past ~15 kills your observed rate leads and is badged `✓`, below that
    the wiki's figure shows (dimmed), and a wiki claim that hasn't appeared in 25+ kills is
    flagged "unseen in N". The hover always says which source is speaking and why. The wiki
    describes an older build, so this is the app correcting it in place —
    [ADR 0025](../decisions/0025-observation-over-the-wiki.md). Items with no known drop are
    called out separately. Names navigate in-app.

    **Pointing at a mob rings its kills on the [map](../map/README.md)** (`map.emphasize` →
    the map window's own emphasis, the same one its ☠ list drives). The hunt says what to kill;
    where you found it last time is the next question, and only the map can answer it. It's a
    hover hint, so it **never opens the map** — a window that appears because the cursor crossed
    a name is one nobody asked for — and an ask that picks out nothing (map closed, showing
    another zone, no kills of that mob) is dropped rather than fading every marker to say "no".
    The whole row is the target, items included, and leaving the tab clears the ask, since
    switching tabs fires no `mouseleave`.
  - `SearchPanel` — fuzzy-search eqlwiki (typo-tolerant, ↑↓/Enter keyboard nav) with
    two modes: **By name** (any item/quest/recipe) and **By zone** (fuzzy-pick a zone,
    then list its quests). A name search **also reads your own log**: what the wiki's index can't
    answer is offered beneath its results under *"From your own log · not on the wiki"*, ranked by the
    same scorer from what you have actually held, and opening one gets `ObservedItemView` — a page
    made of your own evidence, with the **+ Add** the search was for
    ([ADR 0103](../decisions/0103-search-can-answer-from-your-own-log.md)). Both lists share one
    keyboard cursor, and the local half needs no debounce, so it answers while the wiki lookup is
    still in flight. The open page is whatever `nav.current` points at; a result
    name/row, each **"How to get it"** source, and each component are all in-app links,
    with ← / → history buttons in the page header. **Adding is kind-aware and the same
    from a result row's "+ Add" or the open page** (the result button fetches the page to
    learn the kind): a **quest**/**recipe** pulls all its turn-ins/ingredients in under
    that quest/recipe heading, an **item** adds itself, and a mob/NPC page offers **"Add
    all N loot"** to queue its Known Loot — each entry tagged with the origin so it groups.
    A recipe also offers **"Add just the crafted item"**. A quest reward
    that's a single item is itself an in-app link (hover for its card); on a mob's stat
    card its **zone** is clickable (opens the map there) and any **coordinate** in its
    Location (e.g. "(1555, -2410)", EQ y,x) opens the map at that zone and drops a marker
    pin (`map.openAt` with a loc). Out-of-era results are badged, with a "hide out of era" toggle.
  - `DamagePanel` — the **damage meter** (from `combat-stats.ts` / `combat-history.ts`;
    see [ADR 0014](../decisions/0014-damage-meter-from-the-log.md) and
    [ADR 0016](../decisions/0016-combat-history-and-spell-analytics.md)). Two axes:
    **scope** (this/last fight · session · **history**) and **view** (**targets** · dealers ·
    **spells**). **Targets is the default**: a fight's first question is what we damaged, not
    which of us was in the room — opening on the dealer list showed a column of party members
    where the enemy belongs. Tiles above are the same either way, on purpose. A stored fight
    renders through the same views as a live one, so "dig into last night" and "how's this pull
    going" are one screen. Everything it shows is **your party's fights** — another group's pull
    at the same camp never reaches the tab
    ([ADR 0067](../decisions/0067-the-meter-counts-your-party-s-fights.md)).
    - `DamageMeter` — bars scaled to the top row so relative contribution reads without
      arithmetic, with total, share and DPS; your rows (you + your pet) are tinted, and
      hover gives max hit, accuracy, crits, healing, active time, and — for your own rows —
      **melee split by stance**, since stances change the multipliers. Click a row to **drill
      into it**, four levels deep, each level captioned with what it splits by and carrying its
      own total, hits, ticks, misses, crit rate, hit rate and biggest hit. Hovering a level also
      gives its damage against **four fixed denominators** — of all damage on that victim, of that
      attacker's damage on it, of the whole fight, and of that attacker's whole fight — because
      "of the level above" moves with the depth and can't answer "how much of that mob was me".
      **The fight excludes damage on your own side** (sides are read off who hit whom, so a
      group-mate's kill still counts and a duel does too); see
      [ADR 0053](../decisions/0053-damage-is-cells-rolled-up.md):

      | view | the row | then | then | then |
      | --- | --- | --- | --- | --- |
      | **Targets** (default) | what took damage | **from** whom | **how** — Melee / Spell / Other | **with** what — skill, spell, DoT, shield |
      | **Dealers** | who dealt it | **on** whom | **how** | **with** what |
      | **Abilities** | who dealt it | **how** | **with** what | **on** whom |

      All three are roll-ups of the same (victim, attacker, kind, source) cells along different
      axes (`DamagePanel`'s `LAYOUTS` → `damage-tree.ts`,
      [ADR 0053](../decisions/0053-damage-is-cells-rolled-up.md)), so a new question is a row in
      that table rather than a new component. **Abilities** exists for area spells: the log writes
      Firestorm as one line per target, so any victim-first order splits one cast four ways before
      you can see what the cast was worth — putting the ability above the target adds it back up
      and still says which mobs it landed on. Every level sums exactly to the one above it, so no
      two views can disagree about a total. Qualifiers
      the log wrote (Critical, Riposte, Flurry…, not a fixed list) sit at the bottom as an
      explicit **"of these hits"** line, because they overlap the sources instead of
      partitioning them — a critical slash is already counted under Melee → Slash, and adding
      them as a fourth group is what used to make the numbers not add up. A fight stored before
      the cells existed keeps only its dealer-side kind/source split; its Dealers view falls back
      to that, and its Targets view says so rather than inventing attribution.
    - `SpellTable` — where your damage came from, spell by spell: casts, damage, healing,
      average **measured** cast time, **dmg/s cast** (the efficiency column — a slow nuke
      and a fast one that hit the same are not equally good), **mana** and **dmg/mana**
      (cost comes from the spell's wiki page — the log never states it), **resist %** (red
      past 25%) and failed casts. **Click a row for its breakdown** — grouped by the question it
      answers, and each group hidden when it has nothing to report, so a plain nuke shows two
      lines and a complicated one shows six. It holds the landing figures, the **over-time
      split** (how many ticks, what they did, the biggest, and what share of the spell's total
      they are — on a DoT that share is nearly all of it,
      [ADR 0071](../decisions/0071-a-dot-tick-belongs-to-whoever-cast-it.md)), what the failed
      casts cost and who resisted, the healing, the wiki's *stated* cast time next to the measured
      one (which is how a mispaired cast gives itself away), and the row's **per-invocation
      split** — the same spell can hit for 2.3× as much and cast faster under a different
      invocation, so the blended row is a starting point, not an answer. See
      [ADR 0020](../decisions/0020-split-by-stance-and-invocation.md). Sortable by any of those
      (`SortHeader` + `src/shared/sorting.ts` — click a column to sort, click again to flip; the same
      module orders a filter dropdown's names, `distinctSorted`); melee is a synthetic row so the pie adds
      up. Cast times come from the log's one-second resolution — trust the averages, not a
      single reading.
    - `DamageHistory` — **play sessions** (newest first) → their fights → pick one to break it
      down. A session is a **sitting**, bounded by the log's own `Welcome to EverQuest Legends!`
      line rather than by app runs (which turned 12 real evenings into 38 "sessions"), and a fight
      is named after **what your side damaged most** — not the group-mate out-damaging you, which
      is how an evening came to be titled `BunnySlayer` throughout. Labels are recomputed on read,
      so fights already stored get the current rule. See
      [ADR 0054](../decisions/0054-a-sitting-is-a-login.md). The session list **scrolls inside
      itself** (`.hist-list`): it's an index, and a fortnight of it otherwise pushed the metrics
      for the fight you picked off the bottom of the tab. "Clear history" forgets all of it.
      A **search box cuts across sessions**: a term replaces the tree with the matching fights
      themselves (day, mob, zone, damage), because "where did I fight those minotaurs" is a
      question about the whole history and opening a fortnight of sittings one at a time is no
      answer. Matching is `shared/fight-search.ts` — every word must appear in the fight's **mob
      name or zone**, the two things a player remembers — and it runs in **main**, which is what
      holds every fight (the tree only ever loads the session you opened). Results are capped at
      the newest 100 and the tally says how many matched, since a fight carries its whole
      breakdown and a truncated list that reads like the whole answer is a wrong conclusion.
    - `HighScoreBoard` — the **🏆 Records** scope: your **personal bests**, the one question the
      other three scopes can't answer (they hold a fight, a session and a list; none is a bar to
      clear). Grouped by *hits* / *survival* / *fights* / *streaks*, each row leading with the figure
      because that's what you want at a glance, and trailing off into what it was against, when,
      where, and what it beat by. The **categories are a catalog** (`shared/high-scores.ts`), with two
      **families** rather than fixed rows — one per melee skill you use and one per hit qualifier the
      log writes — since no character has six melee skills and a fixed qualifier list would be a
      guess. Beating one raises a banner on the **cast-alert overlay** (`event: "record"`), wearing a
      saved style or the alert defaults; toggled here, styled in the Alerts tab, and *needing alerts
      on*, which the panel says rather than going quiet. Four rules make it a record rather than a
      maximum: a **floor** per category, a **first score that sets the bar silently**, **replayed and
      eaten history filed but never announced**, and a **kill streak that announces its crossing then
      climbs quietly**. The board is **per character** and **seeded from your recorded fights**, so it
      opens populated instead of as a page of blanks — the three categories only a live line can state
      (biggest heal, and any qualifier row) are named as such — read from the catalog's own `liveOnly`
      flag rather than listed in the panel, since that list has already changed once
      ([ADR 0095](../decisions/0095-your-own-dot-tick-is-yours.md) made biggest DoT tick seedable). Its own **Reset**
      forgets this character's records and nothing else's, and doesn't re-seed itself afterwards. See
      [ADR 0093](../decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md).
    - `Sparkline` — your damage per second across the fight, because a steady grind and a
      burst that fell off a cliff can share a DPS number but never a silhouette.
    - **Deaths** — what killed you, and what was landing in the 15s before it. The log
      names a killer but never a reason; the run-up is the reason. Each is shown as a share
      of your **inferred** health (`hp-estimate.ts`, see
      [ADR 0018](../decisions/0018-inferred-max-hit-points.md)) — a range with its evidence
      on hover, correctable through the same `AskValue` control.
    Tiles above show your damage, your DPS, all damage, how long the window was *in
    combat*, and your pet's share when it fought. A **★ best DPS** flag appears when the
    fight beats your recorded best against that opponent, and **Copy** puts a one-line
    summary on the clipboard for guild chat. "This fight" flips to "Last fight" on its own
    once the log has been quiet for 10s; **Reset** clears the live meter and keeps history.
  - `SessionPanel` — the **camp screen**: is this spot worth it? XP/hour (over elapsed
    time, so it's a forecast), **time to level**, **downtime** (elapsed minus time in
    combat — the biggest lever on a night's real rate), level, and the session's XP-gain
    and kill counters — all from the one session tracker (`combat-stats.ts`, see
    [ADR 0019](../decisions/0019-parse-once-and-one-tracker.md)). Below, `CampReport` gives **per mob** for this
    session (kills, time-to-kill, XP, XP/min *fighting*) and **per zone** across all
    recorded history, so tonight's camp can be compared with last week's. See
    [ADR 0017](../decisions/0017-camp-efficiency-and-asking-the-player.md).
    - Time to level needs the one thing the log never states — how far into the level you
      are — so it **asks**: `AskValue` turns the gap into the control (hover for why,
      click to fill in). After that `xp-progress.ts` keeps it current from XP gains and
      zeroes it on level-up, so it's asked at most once per level. Reuse `AskValue` for any
      future figure the log can't supply.
  - `LootPanel` — the **Loot tab**: the persisted drop ledger (`electron/loot-log.ts`), which
    reaches back through previous runs rather than describing this session. **Two segmented views**
    like the damage tab's scopes, because stacking them meant a few hundred rows of ledger pushed
    the prices off the bottom of the screen: **Drops** (time · fate · qty · item · corpse · where it
    went) and **Sells for** (each · sold · earned · last sold — the item half of the money question,
    [ADR 0047](../decisions/0047-money-is-copper-in-two-ledgers.md)). Both are tables with
    **sortable columns** (`SortHeader` + `src/shared/sorting.ts`; click to sort, click again to
    flip), and the drops view has **filters** — fate, item name, which corpse, and "on my list"
    (`src/shared/loot-filters.ts`, pure + tested). Rows on your shopping list are highlighted, which
    is still the only highlight rule: it's free and it can't cry wolf. Names are `ItemLink`s. The
    header's tallies count the rows **on screen**, so they describe what you filtered to. See
    [ADR 0058](../decisions/0058-a-ledger-needs-filters-and-a-column-to-sort-by.md).
  - `AlertsPanel` — **its own tab**, not a group inside Settings
    ([ADR 0088](../decisions/0088-alerts-are-a-tab-not-a-setting.md)): the rule list + beep /
    **screen-flash** / include-self
    toggles, **two ways to fire a sample** down the real broadcast path — **🔔 on a rule's row**
    (that rule's wording, shape and look) and **▶ Preview alert** inside a style editor (that look,
    on no rule, via `alerts.preview`). There is deliberately no list-wide Test button: it fired the
    first *usable* rule, so it answered about a rule you weren't looking at,
    **Suggested** click-to-add chips of common crowd control grouped by effect — see
    `src/shared/cast-suggestions.ts`, since EQ names most CC off-theme — and an **Alert style**
    block: color swatches, a **sound** picker (synthesized presets from `src/lib/alertSounds.ts`,
    with a Preview button), on-screen **position** (six presets **or a custom spot placed with the
    mouse** — a **Custom spots** manager places/names/deletes them, [ADR 0045](../decisions/0045-place-a-custom-alert-spot.md)),
    **motion** (pulse/wiggle/float/none),
    **duration**, and — with more than one monitor — which **display** the overlay covers. Those
    controls are `AlertStyleFields`, and **only one of them is on screen at a time**
    ([ADR 0090](../decisions/0090-one-style-editor-at-a-time.md)): every look — the defaults, each
    saved style, a rule's own — is a one-line `StyleRow` (colour dot, name, `chirp · Top center ·
    Pulse`, and **who wears it** — `worn by 2 rules · Loot drops`, features included) with a 🎨 that
    opens the single editor beneath it. Creating a style opens it too, so making and editing are one
    gesture, and the tab's `OpenTarget` state is what stops a rule's drawer and a saved style being
    open together. Above the looks sit the **app's own alert sources** — Personal bests, Spawn timers,
    Loot drops, one `AlertSourceRow` each (`ALERT_SOURCES`): what sets it off, which look it wears, how
    many things are armed, and the same 🎨. They carry no ✕, and the looks they are built on are
    **sticky** — restyleable, but not renameable or deletable, with a 🔒 saying whose look it is
    ([ADR 0120](../decisions/0120-a-feature-s-look-is-sticky.md)). Arming stays on the thing being
    armed: 🔔 on a list row, 🔔 on a timer, the switch on the Records board. A watch is a **row plus four drawers**
    (`CastWatchRow`, [ADR 0084](../decisions/0084-a-watch-is-a-rule-not-a-substring.md)): the row
    holds the two fields edited constantly — trigger and message — and **chips** summarising the rest
    (`cast · fades`, `2 conditions`, `25s ×3`, and ⚠ when something won't do what it looks like),
    while **⚟** opens what sets it off (the **cast** / **fades** / **raw text** ticks, **players too**,
    the **all/any** fold and the condition rows), **⏱** when it speaks (delay, repeat, what a second
    match does, whether dying cancels it, and the lines that call it off) and **🎨** its own style.
    One drawer is open at a time across the list, and the timing controls past the delay stay hidden
    until there *is* a delay, so an ordinary watch is still one row and one empty box. The tab sits
    **fourth**, because `TabBar` collapses overflow from the end and only six fit at the default
    width — last would have made it *less* reachable than it was inside Settings — and its label
    carries the live rule count, or `(off)`, since a silenced overlay looks exactly like a quiet one.
  - `SettingsPanel` — log folder, match mode, window opacity / interface + map scale, keep-completed,
    follow-your-zone,
    **"Check my setup"** (`SelfCheck` — one button that walks everything the app needs and names the
    first thing that isn't right. It sits **first in the tab**, because Settings is where you land
    when nothing is happening and the check's answer is nearly always about the controls immediately
    below it — diagnosis, then the knobs that fix what it named. A **chain rather than a checklist**
    ([ADR 0100](../decisions/0100-a-setup-check-is-a-chain.md)): a step whose prerequisite failed
    reports *not checked* naming what it waits on, so one missing folder shows as one red row and
    five patient ones rather than six faults. Rows are in dependency order and every one says what it
    **found**, pass included — `Following eqlog_Kainos_pq.proj.txt` is the green row that solves the
    "it's watching a character I'm not playing" case on its own. **Copy report** hands the whole
    thing over as plain text, advice included, for a bug report. On demand only, since it reads the
    disk and pings the wiki and a cached verdict is worth nothing to somebody who just changed a
    setting),
    **"Eat a log file"** (a **catch-up**: digest a past log into every bucket it can fill — learned
    mob data, the **Damage tab's history** one play session per login with the fights whole, and the
    **loot feed** with the prices it teaches; see `electron/log-import.ts`,
    [ADR 0055](../decisions/0055-eating-a-log-fills-history.md). Keyed per line so re-eating or
    overlapping logs never double-count, [ADR 0033](../decisions/0033-eating-a-log-is-idempotent.md);
    the result line reports what was **new**, so a second helping reads zeros),
    **"Recorded data"** (`DataHealth` — which bodies of stored data were read by the rules this build
    uses, and which a change has left behind. The app derives nearly everything from your log and the
    rules keep improving, so a parser fix leaves every stored copy of a figure quietly low — quiet
    being the problem, since a wrong number that looks like a measurement is worse than a blank. Each
    row names the data, its state, **what changed**, and the one thing worth doing; only the two
    remedies the app can carry out itself get a button (digest a log, refresh the wiki), while a build
    script prints its command and a peer's observations admit they can't be rebuilt at all. Current
    rows are shown too — a panel that renders nothing when all is well is indistinguishable from a
    broken one. Data from a **newer** build is flagged and deliberately offered nothing. See
    [ADR 0096](../decisions/0096-stored-data-says-which-rules-wrote-it.md)),
    **"Forget recorded data"** (`ForgetData` — clears the kill records and the loot feed, and asks a
    **second question** before touching what they taught: *Keep observations* or *Forget observations
    too*. Records can be rebuilt by eating the logs again; observed drop rates, roam areas and vendor
    prices cannot, so the safe answer is the plain one and the destructive one is styled `danger` and
    names what it destroys. An inline step, not a native dialog — a modal over an always-on-top
    window is a blackout of the game. See
    [ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md)),
    and a **Help** area: global-shortcut list with live registration status (`app.info()`) and a
    screengrab explanation/test button. Dev-only options live in the tray, not here.
  - `StatusBar` — watcher state, current zone, and the last drop seen. A drop moves the
    matching list entries by the **quantity the log reported**, so a looted stack of 2
    advances the count by 2.
  - `CastAlerts` — dispel-prep alert. The whole main-process path is one module
    (`electron/alert-router.ts`, [ADR 0087](../decisions/0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md)):
    it matches every `cast` event (`<caster> begins casting <spell>`) against the user's watch list
    (`matchCast`, pure), builds the banner, and hands it to the queue, which raises it now or holds it
    as a cue. Main's own part is only the ordering — the meter and the HP estimate take a line first,
    always. Rules written by an older build are converted once at startup
    (`watch-upgrade.ts` via `migrations.ts`), which writes down what used to be implicit and folds
    duplicated looks into shared styles. It broadcasts a `castAlert`; this shows a banner and, per the Settings toggles, **beeps**
    and/or **flashes a red border**. The visuals render in a **dedicated click-through overlay
    window** (`src/app/alert/page.tsx`, `createAlertWindow`) pinned over the game, so the alert
    lands where you're looking; the always-alive main window owns the **beep** (a click-through
    window can't unlock audio) — [ADR 0035](../decisions/0035-cast-alert-overlay-window.md). Each
    watch has an **include-players** toggle: off (default), a named caster — player, pet, named
    NPC — doesn't fire it, so a groupmate's Charm stays quiet; on, it does. Only casts the log
    *names* can match — generic "begins to cast a spell" lines carry no name.

    A watch can also alert when its spell **fades** (`matchFade`) — the opposite prompt, "re-cast
    it": your root wearing off a mob, your Spirit of Wolf expiring. Off by default, and separable
    from the cast alert, so a buff can be fade-only. **A fade on you is always flavour text** —
    EQL prints the generic "worn off." sentence for your pet and for spells you cast on others,
    never for a buff on you — so the watch matches the words the log used ("light breeze", "spirit
    of travel") rather than the spell's name. Often they're the same word; where they aren't
    (Fleeting Fury → "your fury fades"), the **message** field is what puts the spell's real name
    back on the banner. See [log watching](../log-watching/README.md) for the shapes.

    A watch can also be pointed at **raw text** — the whole log line (`onLine` / `matchLine`)
    instead of a spell name. "invites you" catches "*BunnySlayer invites you to a party*", "tells
    you" catches a private message, "the mystical path fades away" catches a buff the parser
    [won't take](../log-watching/README.md#how-a-fade-is-worded). This is the **escape hatch**, and
    the answer to most "why doesn't this alert?": anything the game prints becomes alertable without
    a parser and an event kind per sentence, because the watcher offers *every* split line on
    `onLine` before parsing it, parsed or not. `watchesLines` skips the match when nobody's
    watching. Its banner shows the log's own words with no call to action (💬), because unlike
    "dispel!" there is nothing to prompt — unless the watch gave a **message**, which is how a
    sentence that names no spell still reads as an instruction.

    The checkbox says *raw text* rather than *line*: what it matches against was never the thing
    users needed to know, and phrasing it as a mechanism hid that it's the general answer.

    The **Suggested** chips offer the party invite, the tell, and the two unparseable fades by
    label with wording attached, since the exact sentence is the unmemorable part.
    See [ADR 0050](../decisions/0050-a-watch-can-read-a-whole-log-line.md).

    A watch's **trigger and its message are separate fields**. The trigger has to be the words the
    log actually printed; the wording you want to read mid-fight rarely is. Setting `message` puts
    that sentence on the banner in place of the built one, and drops the "re-cast!"/"dispel!" hint —
    your own wording already says what to do. Resolved in the main process beside the style, and for
    the same reason: the overlay never sees the watch that matched.

    A watch can also be **scheduled rather than raised**: a `delay` turns the same match into a *cue*
    — watch your own mez with `25` to be told to recast it, a placeholder's death with `8m` to be told
    it's back. That is the whole of our timers, for one field, because the watch list already says
    what the player cares about. `alert-schedule.ts` (pure) decides *when* and whether a death should
    call it off; `electron/alert-queue.ts` holds the waiting ones. **Only the alert waits** — the
    meter, the kill log and the ledger all take the line as it's read — and **your death cancels a
    short cue but not a long one**, since "recast it" is noise from a corpse while a spawn timer
    doesn't care. A cue's banner is indistinguishable from an immediate alert, which is why a delayed
    watch usually wants a `message`. See
    [ADR 0082](../decisions/0082-an-alert-can-be-scheduled.md).

    Past its trigger a watch carries **conditions** — a field (`subject` / `caster` / `target` /
    `line` / `zone`), an operator (`contains` / `exact` / `starts` / `ends`), some text, and
    optionally *not*. That is what says "Charm, but not from my own warder", "only in Lower Guk", or —
    with **any** instead of **all** — "either of these two wordings" in one watch. The rules are
    `watch-conditions.ts`, pure: an **exclusion is always `and not`** whatever the fold says, a
    **blank row says nothing**, and a **blank trigger steps aside** so a watch can be nothing but
    conditions, while a watch that says nothing at all still matches nothing. Everything about *the
    event* — your own casts, named casters, the live window — stays in `cast-alerts.ts`, which builds
    the `WatchSubject` the conditions read; the zone is handed in, since no line says it.

    A waiting cue can also be **called off**: `cancelWhen` matches whole log lines as they arrive
    ("has been slain" ends a re-mez reminder), `retrigger` says whether a second match restarts,
    queues or is ignored, and `repeat` says it again — bounded, and refused unless something can stop
    it. `summarizeWatch` says the whole rule back in a few words for the row's chips, and names the
    combinations that would fail silently. See
    [ADR 0084](../decisions/0084-a-watch-is-a-rule-not-a-substring.md).

    A rule's text boxes **complete from the log** ([ADR 0091](../decisions/0091-a-rule-is-typed-with-the-log-s-help.md)):
    `log-vocabulary.ts` gathers every spell, caster, fade target and zone the log named into a trie,
    read once when the tab opens, and `SuggestField` offers the rest of the word **greyed behind the
    caret** (Tab or → to take it) when what you typed starts a term — or a **dropdown** when it
    doesn't, since a term that merely *contains* what you typed ("sme" → Mesmerization) or a near-miss
    spelling has no remainder to grey. A condition completes from the vocabulary matching its field.
    All the boxes are `TextField`s, which own their own text so the settings round trip can't throw
    the caret to the end mid-word.

    A rule can be **checked** (✓): `checkWatch` lists what's wrong with it — errors that can't work,
    warnings that probably won't — and `dryRun` **replays it against the tail of the log file**
    (`log-tail.ts` in main, `log.recent(bytes)` over IPC, as **text** the renderer parses), saying
    which of its lines the rule would have fired on and how many would have cancelled it — **one row
    per distinct sentence**, since lines differing only by their numbers are folded together and
    counted, so twenty copies of one hit can't crowd out the differently-worded one. The file
    rather than a record of this session, because a rule is written *after* the evening that prompted
    it — a session buffer answered "nothing logged yet" to the one person it was built for. **Search
    further back** climbs `TAIL_STEPS` (512 KB → 32 MB) for a rule about something rare, and the
    answer says which it is: "in the last N lines" or "in the whole log"
    ([ADR 0089](../decisions/0089-a-rule-is-checked-against-the-log-file.md)). The judging is pure and runs in the renderer, so it
    re-answers as the rule is typed. It reuses the real matchers, with `now` set to each line's own
    timestamp and the rule matched alone — the question is what *this rule* does, not what the app
    currently does. Also **⧉ duplicate**, a **library** of worked rules (`watch-library.ts`, each one
    passing the same check a hand-made rule gets), **share strings** (`watch-share.ts`, `EQLW1:…` —
    one line, whitelisted on import, ids regenerated, always added rather than merged, and carrying
    no style), and **saved styles** (`NamedAlertStyle`, worn by `styleId`) so several rules share one
    look. See [ADR 0085](../decisions/0085-a-rule-can-be-tested-shared-and-borrowed.md).

    A rule **wears one look** — the defaults, a saved style, or one of its own — and the 🎨 picker
    says which. Changing it there can never restyle another rule
    ([ADR 0086](../decisions/0086-editing-a-shared-style-from-a-rule-forks-it.md)): `alert-styles.ts`
    edits its own look in place, edits a saved style **nobody else wears** in place, and otherwise
    **forks** — a new style named after its parent, starting from what the rule looked like a moment
    ago. *Nobody else* counts more than rules: a spawn timer and a feature wear styles too, so a rule
    on a **sticky** look always forks ([ADR 0120](../decisions/0120-a-feature-s-look-is-sticky.md)),
    and `styleUse` is the one count both the drawer's note and the ✕ are read from. The drawer says
    which of the three will happen *before* the edit. Changing a shared style for everyone is the
    **Saved styles** list under Alert style, or the source's own row, which edit in place — two
    intents, two places, no mode switch.

    Appearance is **per alert**, not per window: `alertStyle` resolves the matching watch's
    overrides over the defaults in the main process, and the resolved `AlertStyle` travels *with*
    the alert. It has to — the overlay only knows the defaults, so nothing per-watch could reach
    the screen otherwise — and an alert already up keeps the look it fired with. Two alerts can
    now occupy different corners, so the banner renders one stack per position.

    A `position` is a preset **or** `loc:<id>` — a **custom spot** the user placed with the mouse,
    stored as a fraction of the display in `castAlerts.locations` (survives a resolution/monitor
    change). Placing one lends the click-through overlay a single click: `alerts.placeLocation()`
    makes it interactive + focusable, `AlertPlacement` (in the overlay) shows a catcher + preview
    and reports the click (or Esc), and main restores click-through and hands the point back to
    Settings to name. The overlay resolves `loc:<id>` → its `fx/fy` (a deleted spot falls back to
    the top). See [ADR 0045](../decisions/0045-place-a-custom-alert-spot.md).

    The overlay covers the chosen display, and changing that **moves** it rather than rebuilding
    it: recreating raced with its own teardown (the old window's `closed` nulled out the new
    reference), which is why a monitor change appeared to do nothing until some other setting
    rebuilt the window. Its bounds are re-asserted after creation, on show, and once more a beat
    later — the constructor mis-sizes a window made for a secondary or HiDPI monitor, exactly as
    the screengrab selector already worked around.
- **Screengrab lookup** (`src/app/select/page.tsx` + `electron/lookup.ts`): the
  `Ctrl/Cmd+Shift+L` hotkey (or the Search/Settings buttons) screenshots every display
  *first* (before any window shows, so a hovered tooltip is frozen and our UI isn't
  captured), then puts a selector over each monitor showing its frozen shot — so you
  can grab from anywhere. Dragging crops that display's frozen image; it's OCR'd
  (Tesseract.js) and the text is dropped into the Search tab (`search.onPrefill`),
  where the normal fuzzy search takes over. What lands in the box is the *corrected*
  reading where the font fooled OCR ("Moming Star" → "Morning Star") and the raw one
  otherwise — always editable, never a guess with nothing behind it. See
  [ADR 0081](../decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md).
- **Client glue** (`src/lib/`): `api.ts` (null-safe access to `window.eql`),
  `hooks.ts` (`useShoppingList`, `useSettings`, `useWatcherStatus`, `useLootFeed`,
  `useMatchFlashes`, `useCurrentZone`, `useEntrySources`, `useItemCard`) — subscribe on
  mount, unsubscribe on unmount — and `nav.tsx` (the in-app page history above). **`toast.ts`** is the bus behind the
  brief notices above (`showToast` from anywhere, `useToasts` for the host, the model and its rules
  pure in `src/shared/toasts.ts`), and two modules are built on it: **`addToList.ts`** owns every
  "+ Add" and the notice it raises, and **`clipboard.ts`** owns every copy — which is a `write` that
  can fail silently, so it is exactly the shape that needs one.
  Three lifecycles sit under those hooks, each written once because each has a failure that
  nothing visibly reports: **`useLive`** (read, then follow, and *return the unsubscribe* — a
  copy that forgets leaks a listener per mount), **`useRead`** / `useReading` (read again when
  the question changes, and **discard an answer the question has moved on from** — without it,
  expanding session B while A is still in flight can show B's heading over A's fights), and
  **`useDismiss`** (close a popover on an outside click or Escape, listening only while open).
  A component that wants one of these should call it rather than write the effect again. **`clickThrough.ts`**
  is a fourth of the same kind — a window-level lifecycle (cursor listeners on, mode restored on the way
  out) that only a window's own renderer can run. The map has two
  more of its own in `src/lib/map/`: **`useFloors`** (which storeys are on screen, and the eight values
  that follow from it — they have to agree, so they're derived together) and **`useHidden`** (a filter
  stated as *what's left off*, shared by pins-by-kind, labels-by-kind and peers-by-name).
- **A window is assembled, not written out.** The two big screens are compositions: the map window is a
  `MapTitlebar`, a `MapToolbar`, the `MapPanel` canvas and its side panels (`MapFilters`, `MapUsers`,
  `PinEditor`, `TravelPanel`, `KillList`, `MobKnowledge`); Settings is a stack of groups
  (`LogSettings`, `ForgetData`), and Alerts is its own (`AlertsPanel` → `CastWatchRow` →
  `WatchConditionRows` / `WatchTimingFields` / `WatchCheck` / `AlertStyleFields`, plus `WatchLibrary`
  and `WatchShare`); Search is a
  box and a list next to a `WikiPageView`. Each was carved out of a component of several hundred lines,
  and the cut is always the same one: a region with **state or behaviour of its own** becomes a
  component, while a row of values stays where it is. `WindowButtons` is the smallest case of the same
  rule — minimize/maximize/dismiss, so two title bars can't drift apart — and `Titlebar` is the same
  rule applied to the bar itself, so both windows drag, snap and double-click identically.
- **A panel that opens over another view is sized by the person reading it.** The map's five
  toolbar panels (👁 🧭 📖 ☠ 👥) each stack above the map with a default share of the window, and the
  **seam under one is a drag handle** — a 6px grip on the border you can already see, transparent
  until hovered, double-clicked to put the default back. The default is a *ceiling*: undragged, a
  panel is its content's height and no more than it was designed to take; dragged, it is exactly what
  was asked for and scrolls the rest. One `ResizablePanel` owns the box and knows nothing about what
  it holds, so anything that opens over something else becomes resizable by being wrapped in one —
  which is why it lives with the shared UI rather than with the map. A height is a **share of the
  window** rather than a pixel count (`src/shared/panel-size.ts`, pure and tested), because a window's
  scale is a CSS `zoom` that multiplies px and leaves a ratio alone, and it's remembered per panel in
  the same `localStorage` that remembers which panels are open — sizing is a gesture, not a setting.
  See [ADR 0112](../decisions/0112-a-panel-s-height-belongs-to-its-reader.md).
- **Errors are logged, never drawn over the game** (`src/lib/error-reporting.ts`): Next's
  dev error overlay is hidden outright — by CSS the *main process* injects into every window
  it loads (`HIDE_DEV_OVERLAY` in `electron/windows.ts`), so it holds even for a compile
  error, where the app's own stylesheet is part of what failed to build. A full-viewport
  backdrop on an always-on-top window is a blackout of EverQuest. `ErrorReporter` (mounted once in
  the root layout, so every window gets it) sends uncaught errors and rejected promises to
  the logger, which the main process mirrors into the debug file behind tray → "Open debug
  log". Each route's `error.tsx` is built by `crashBoundary(where)`; the app window shows a
  small in-window notice with a "Try again", while the **alert overlay and the screengrab
  selector draw nothing** — they're click-through or own a whole display, and a crashed one
  can't dismiss itself. See [ADR 0052](../decisions/0052-an-error-goes-to-the-log-not-the-screen.md).
- Styling is one dark theme in `src/app/globals.css`; the body is transparent so the
  frameless window can be see-through.

## Failing safe
Every window here is frameless, always-on-top, and closes by a button its **renderer** draws — so a
renderer that dies, hangs or never hydrates leaves a window nobody can operate, and a screen nobody
can click. The rule is that such a window doesn't get to stay: it is made harmless first (never on
top, never taking a click), then destroyed if it's a pure overlay or reloaded if it's the app
itself. The alert overlay's **interactive** state (solid + focusable, borrowed while placing a
custom spot) is time-boxed and has three ways back to click-through, none of which needs the page to
be alive. See
[ADR 0105](../decisions/0105-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) and, for
the screengrab selector, [ADR 0102](../decisions/0102-a-lookup-never-holds-the-screen.md).

The same rule at **launch**, where the failure looks different: a window whose renderer never arrives
isn't unusable, it's *invisible* — a taskbar slot that takes a click and shows nothing. So a window is
shown by whichever comes first of a paint, a load, or a deadline (never one event a broken renderer would
never fire); an HTTP error page counts as a dead renderer rather than a successful load; and a window
given up on shows a built-in notice pointing at the tray instead of staying a blank pane of glass. See
[ADR 0110](../decisions/0110-a-launched-window-is-visible-or-it-says-why.md).

## Non-responsibilities
- No business logic or persistence in the renderer — it calls `window.eql` and renders
  store state.
- Window creation, and restoring how a window was left (bounds, maximized, pinned, ◐, 👻), are the
  main process's (`electron/windows.ts` + `window-state.ts`); the UI only flips them and says so
  (`win.saveState`). Once a window is up, its **live** opacity and **which clicks it takes** are the
  renderer's: only it knows whether its ◐ is on and what the cursor is over, so main just does as
  it's told — one `setOpacity`, one `setIgnoreMouseEvents` per crossing.

## See also
[architecture](../architecture/README.md) ·
[ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md) ·
[ADR 0008](../decisions/0008-in-app-page-navigation.md) ·
[ADR 0009](../decisions/0009-single-window-with-tray.md) ·
[ADR 0052](../decisions/0052-an-error-goes-to-the-log-not-the-screen.md) ·
[ADR 0110](../decisions/0110-a-launched-window-is-visible-or-it-says-why.md) ·
[ADR 0112](../decisions/0112-a-panel-s-height-belongs-to-its-reader.md)
