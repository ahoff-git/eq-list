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
  and **hide-to-tray** (`win.hide()`).
  Opacity/always-on-top come from settings and are applied by the main process
  (`applyOverlaySettings`). Show/hide also works from the
  global hotkey `Ctrl/Cmd+Shift+O` (`OVERLAY_HOTKEY`, registered in `main.ts`) and the
  tray. One window, styled once; see [ADR 0009](../decisions/0009-single-window-with-tray.md).
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
    hunt mobs' loot pages, since the rate lives there, not on the item). Items with no
    known drop are called out separately. Names navigate in-app.
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
      hover gives max hit, accuracy, crits, healing and active time.
    - `SpellTable` — where your damage came from, spell by spell: casts, damage, healing,
      average **measured** cast time, **dmg/s cast** (the efficiency column — a slow nuke
      and a fast one that hit the same are not equally good), **resist %** (red past 25%)
      and failed casts. Sortable by any of those; melee is a synthetic row so the pie adds
      up. Cast times come from the log's one-second resolution — trust the averages, not a
      single reading.
    - `DamageHistory` — sessions (newest first) → their fights (labelled with the mob you
      were fighting) → pick one to break it down. "Clear history" forgets all of it.
    - `Sparkline` — your damage per second across the fight, because a steady grind and a
      burst that fell off a cliff can share a DPS number but never a silhouette.
    - **Deaths** — what killed you, and what was landing in the 15s before it. The log
      names a killer but never a reason; the run-up is the reason.
    Tiles above show your damage, your DPS, all damage, how long the window was *in
    combat*, and your pet's share when it fought. A **★ best DPS** flag appears when the
    fight beats your recorded best against that opponent, and **Copy** puts a one-line
    summary on the clipboard for guild chat. "This fight" flips to "Last fight" on its own
    once the log has been quiet for 10s; **Reset** clears the live meter and keeps history.
  - `SessionPanel` — the **camp screen**: is this spot worth it? XP/hour (over elapsed
    time, so it's a forecast), **time to level**, **downtime** (elapsed minus time in
    combat — the biggest lever on a night's real rate), level, and the session's XP-gain
    and kill counters (`session-stats.ts`). Below, `CampReport` gives **per mob** for this
    session (kills, time-to-kill, XP, XP/min *fighting*) and **per zone** across all
    recorded history, so tonight's camp can be compared with last week's. See
    [ADR 0017](../decisions/0017-camp-efficiency-and-asking-the-player.md).
    - Time to level needs the one thing the log never states — how far into the level you
      are — so it **asks**: `AskValue` turns the gap into the control (hover for why,
      click to fill in). After that `xp-progress.ts` keeps it current from XP gains and
      zeroes it on level-up, so it's asked at most once per level. Reuse `AskValue` for any
      future figure the log can't supply.
  - `SettingsPanel` — log folder, match mode, window opacity/text-size, keep-completed,
    follow-your-zone, and a **Help** area: global-shortcut list with live registration
    status (`app.info()`) and a screengrab explanation/test button. Dev-only options
    live in the tray, not here.
  - `StatusBar` — watcher state, current zone, and the last drop seen. A drop moves the
    matching list entries by the **quantity the log reported**, so a looted stack of 2
    advances the count by 2.
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
- Window creation, opacity, and always-on-top are applied by the main process
  (`electron/windows.ts`); the UI only requests them.

## See also
[architecture](../architecture/README.md) ·
[ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md) ·
[ADR 0008](../decisions/0008-in-app-page-navigation.md) ·
[ADR 0009](../decisions/0009-single-window-with-tray.md)
