# Overlay UI

## Purpose
Give the player **one** window: a frameless, translucent, always-on-top float (the
"overlay" look) that sits over the game, lights up on drops, and holds everything —
list, hunt, search, damage, session, settings.

## Responsibilities
- **Window shell** (`src/app/page.tsx`, `.app.glass`): frameless, transparent,
  resizable, translucent. The **title bar** is the drag handle and carries the window
  controls — an **opacity toggle** (flip between 100% and the settings slider value,
  transient via `win.setOpacity`), **pin** (always-on-top, toggles `overlay.alwaysOnTop`
  — the shared `PinButton`, gray off / red on, same as the map window), **minimize**,
  **interface scale** (the shared `ScaleButtons`: A− / A+, stepping `overlay.fontScale` over
  `UI_SCALE` — 60%–100%, the same value the Settings slider holds), **maximize/restore** (the
  shared `MaximizeButton`, see below) and **hide-to-tray** (`win.hide()`).
  **Always-on-top** and the interface **scale** come from settings and are applied by the main
  process (`applyOverlaySettings`). The **scale** is applied by each window's *own renderer*, as a
  CSS `zoom` on the document root (`useUiScale`) — see
  [ADR 0026](../decisions/0026-interface-scale-only-shrinks.md) for why 100% is the ceiling and
  [ADR 0041](../decisions/0041-interface-scale-is-a-css-zoom-per-window.md) for why it can't be
  Chromium's `setZoomFactor` (per *origin*, and every window shares one, so two windows could never
  hold two scales). **The map window scales separately** (`overlay.mapFontScale`, its own A− / A+):
  one window is a column of text you shrink to reclaim desk space, the other is a picture you
  enlarge to read. A shell inside a scaled window must size with **percentages, not `vh`** — a `vh`
  length is scaled by the zoom and comes up short. **Opacity** is the exception:
  the window opens at the saved value (constructor) and the **renderer** owns it thereafter, so the
  transient ◐ toggle isn't clobbered when the main process reacts to some other settings change.
  Show/hide also works from the
  global hotkey `Ctrl/Cmd+Shift+O` (`OVERLAY_HOTKEY`, registered in `main.ts`) and the
  tray. One window, styled once; see [ADR 0009](../decisions/0009-single-window-with-tray.md).
- **Maximize / restore** (`MaximizeButton` + `useMaximized`): a frameless window draws its own
  titlebar, so it has to be given what the OS would normally provide. The button asks main to
  `maximize()`/`unmaximize()`, and main reports the window's `maximize`/`unmaximize` events
  back — so the glyph (▢ / ❐) follows the window even when something else maximizes it
  (a drag-region double-click, `Win+↑`, the taskbar), and is re-announced on every load so a
  reloaded renderer can't start out wrong. Maximizing **squares the window's corners and hides
  its border** (`.maximized`): the rounded float look would otherwise leave four notches of
  desktop showing. The state persists per window in `window-state.json` beside — not instead
  of — the bounds, which stay the size to restore *to*; "Reset window position" clears it, since
  a window lost behind a maximized frame is what that button is for. Both the main and map
  windows have it; the **cast-alert overlay does not**, being click-through and
  `maximizable: false`, which is also why the main process can just ask `isMaximizable()`
  rather than track which window is the exception.
- **System tray** (`main.ts`): show/hide plus the **dev-only** options kept out of the
  UI — Debug logging, Open debug log, Open developer tools (on the focused/main
  window), Reset window position, and Quit. The tray is the only way to fully exit
  (✕ hides to tray; the app stays resident).
- **In-app navigation** (`src/lib/nav.tsx`, `NavProvider`/`useNav`): a shared page
  history. Every item / mob / quest name is an `ItemLink` (`components/ItemLink.tsx`) —
  clicking it calls `openPage(title)`, opening that page on the **Search tab in-app**,
  never the browser; hovering it shows the wiki's item **stat card** (`WikiPage.card`
  via `useItemCard`, fetched lazily and cached, positioned `fixed` + viewport-clamped).
  Browser-style **back/forward** walks the stack: mouse thumb buttons (forwarded from
  main as `app-command` on `CH.navCommand`) and **Alt+←/→**. Only the explicit
  "↗ eqlwiki" button leaves the app. See [ADR 0008](../decisions/0008-in-app-page-navigation.md).
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
    page (`wiki.openInBrowser`, host-validated in main). A quest/recipe group has a
    **×N runs** control (`list.setRuns`) — running a quest twice doubles every turn-in's
    needed count. `effectiveNeeded(entry, runs)` is the one source of truth for "how many
    you actually need". A quest/recipe group header also has an **↗ eqlwiki** button and a
    ✕ to remove the whole group. Each entry expands (▸) to a lazy-loaded **"where to get it"** —
    drop mobs grouped by zone (current zone first via `splitDropsByCurrentZone`) plus
    color-coded non-drop sources (`otherSources`); mob/source names are in-app links.
  - `HuntPanel` — the **Hunt tab**: inverts "how do I get each needed item" into
    "where do I go to farm what's left". `useEntrySources` fetches each still-needed
    item's sources (`wiki.getPage`, cached) and `src/shared/hunt.ts`
    (`neededEntries` → `huntInputsFor` → `buildHunt`, pure + tested) builds
    zones → mobs → the needed items they drop. Zones/mobs sort by how much of your
    list they cover; the current zone (`useCurrentZone`) floats to the top. A **zone
    filter** narrows to one zone (`sourceZones` for the options, `zoneMatches` to
    filter); with the `overlay.followZone` setting on, it auto-tracks the log's current
    zone. The picked zone is owned by the parent (`page.tsx`) so it survives tab
    switches. Each item shows its **drop rate** for that mob (`useMobLoot` fetches the
    hunt mobs' loot pages, since the rate lives there, not on the item) — reconciled against
    **your own kills**: past ~15 kills your observed rate leads and is badged `✓`, below that
    the wiki's figure shows (dimmed), and a wiki claim that hasn't appeared in 25+ kills is
    flagged "unseen in N". The hover always says which source is speaking and why. The wiki
    describes an older build, so this is the app correcting it in place —
    [ADR 0025](../decisions/0025-observation-over-the-wiki.md). Items with no known drop are
    called out separately. Names navigate in-app.
  - `SearchPanel` — fuzzy-search eqlwiki (typo-tolerant, ↑↓/Enter keyboard nav) with
    two modes: **By name** (any item/quest/recipe) and **By zone** (fuzzy-pick a zone,
    then list its quests). The open page is whatever `nav.current` points at; a result
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
    **scope** (this/last fight · session · **history**) and **view** (dealt · taken ·
    **spells**). A stored fight renders through the same views as a live one, so "dig into
    last night" and "how's this pull going" are one screen.
    - `DamageMeter` — bars scaled to the top row so relative contribution reads without
      arithmetic, with total, share and DPS; your rows (you + your pet) are tinted, and
      hover gives max hit, accuracy, crits, healing, active time, and — for your own rows —
      **melee split by stance**, since stances change the multipliers. Click a row to open its
      **breakdown** — three collapsible groups that account for the whole of that row's damage:
      **Melee** by weapon/skill (Slash, Pierce, Crush, Kick, Backstab — the log names the skill,
      the closest it gets to "which hand"), **Spells** by source (each spell/DoT/proc/shield,
      per combatant), and **Special hits** by whatever qualifier the log wrote (Critical, Riposte,
      Flurry…, not a fixed list). All three come off the `verb`/`spell`/`qualifier` the parser
      already captured; see `combat-stats.ts` (`byVerb`/`bySpell`/`bySpecial`).
    - `SpellTable` — where your damage came from, spell by spell: casts, damage, healing,
      average **measured** cast time, **dmg/s cast** (the efficiency column — a slow nuke
      and a fast one that hit the same are not equally good), **mana** and **dmg/mana**
      (cost comes from the spell's wiki page — the log never states it), **resist %** (red
      past 25%) and failed casts. The hover also shows the wiki's *stated* cast time next
      to the measured one (which is how a mispaired cast gives itself away) and the row's
      **per-invocation split** — the same spell can hit for 2.3× as much and cast faster
      under a different invocation, so the blended row is a starting point, not an answer.
      See [ADR 0020](../decisions/0020-split-by-stance-and-invocation.md). Sortable by any of those; melee is a synthetic row so the pie adds
      up. Cast times come from the log's one-second resolution — trust the averages, not a
      single reading.
    - `DamageHistory` — sessions (newest first) → their fights (labelled with the mob you
      were fighting) → pick one to break it down. "Clear history" forgets all of it.
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
  - `SettingsPanel` — log folder, match mode, window opacity / interface scale, keep-completed,
    follow-your-zone, **cast alerts** (the watched-spell list + beep/**screen-flash**/include-self
    toggles, a **Test alert** button that fires a sample down the real broadcast path,
    **Suggested** click-to-add chips of common crowd control grouped by effect — see
    `src/shared/cast-suggestions.ts`, since EQ names most CC off-theme — and an **Alert style**
    block: color swatches, a **sound** picker (synthesized presets from `src/lib/alertSounds.ts`,
    with a Preview button), on-screen **position** (six presets **or a custom spot placed with the
    mouse** — a **Custom spots** manager places/names/deletes them, [ADR 0045](../decisions/0045-place-a-custom-alert-spot.md)),
    **motion** (pulse/wiggle/float/none),
    **duration**, and — with more than one monitor — which **display** the overlay covers. Those
    controls are `AlertStyleFields`, used twice: once for the **defaults** and again for a watch
    with a style **of its own** (🎨 on its row, which copies the defaults and then lets you tune
    them, with a Test button that previews *that* watch). Each watch also chooses which prompts
    it wants — **cast**, **fades**, or both),
    **"Eat a log file"** (digest a past log into learned mob data — see `electron/log-import.ts`;
    keyed per line so re-eating or overlapping logs never double-count, [ADR 0033](../decisions/0033-eating-a-log-is-idempotent.md)),
    and a **Help** area: global-shortcut list with live registration status (`app.info()`) and a
    screengrab explanation/test button. Dev-only options live in the tray, not here.
  - `StatusBar` — watcher state, current zone, and the last drop seen. A drop moves the
    matching list entries by the **quantity the log reported**, so a looted stack of 2
    advances the count by 2.
  - `CastAlerts` — dispel-prep alert. The main process matches every `cast` event
    (`<caster> begins casting <spell>`) against the user's watch list (`matchCast`, pure)
    and broadcasts a `castAlert`; this shows a banner and, per the Settings toggles, **beeps**
    and/or **flashes a red border**. The visuals render in a **dedicated click-through overlay
    window** (`src/app/alert/page.tsx`, `createAlertWindow`) pinned over the game, so the alert
    lands where you're looking; the always-alive main window owns the **beep** (a click-through
    window can't unlock audio) — [ADR 0035](../decisions/0035-cast-alert-overlay-window.md). Each
    watch has an **include-players** toggle: off (default), a named caster — player, pet, named
    NPC — doesn't fire it, so a groupmate's Charm stays quiet; on, it does. Only casts the log
    *names* can match — generic "begins to cast a spell" lines carry no name.

    A watch can also alert when its spell **fades** (`matchFade`) — the opposite prompt, "re-cast
    it": your root wearing off a mob, your Spirit of Wolf expiring. Off by default, and separable
    from the cast alert, so a buff can be fade-only. The parser reports all four shapes a real log
    uses, including your spell wearing off *something else* and EQ's per-spell flavour wording
    ("Your strength fades."), which names no spell — such a watch matches those words instead.

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
  where the normal fuzzy search takes over.
- **Client glue** (`src/lib/`): `api.ts` (null-safe access to `window.eql`),
  `hooks.ts` (`useShoppingList`, `useSettings`, `useWatcherStatus`, `useLootFeed`,
  `useMatchFlashes`, `useCurrentZone`, `useEntrySources`, `useItemCard`) — subscribe on
  mount, unsubscribe on unmount — and `nav.tsx` (the in-app page history above).
- Styling is one dark theme in `src/app/globals.css`; the body is transparent so the
  frameless window can be see-through.

## Non-responsibilities
- No business logic or persistence in the renderer — it calls `window.eql` and renders
  store state.
- Window creation and always-on-top are applied by the main process
  (`electron/windows.ts`); the UI only requests them. (Opacity is the one exception — the renderer
  owns the live value so the transient ◐ toggle survives unrelated settings changes.)

## See also
[architecture](../architecture/README.md) ·
[ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md) ·
[ADR 0008](../decisions/0008-in-app-page-navigation.md) ·
[ADR 0009](../decisions/0009-single-window-with-tray.md)
