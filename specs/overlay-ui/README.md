# Overlay UI

## Purpose
Give the player **one** window: a frameless, translucent, always-on-top float (the
"overlay" look) that sits over the game, lights up on drops, and holds everything —
list, hunt, search, session, settings.

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
    *and* a quest); each entry shows `have / need` for that group, plus a **"(N total)"**
    hint (`itemTotals`) when the item is wanted elsewhere too. The entry's **+/− adjust
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
  - `SessionPanel` — live XP-gain and kill counts for the session, with XP attributed
    to the mob you killed most recently (from `session-stats.ts`), and a reset.
  - `SettingsPanel` — log folder, match mode, window opacity/text-size, keep-completed,
    follow-your-zone, and a **Help** area: global-shortcut list with live registration
    status (`app.info()`) and a screengrab explanation/test button. Dev-only options
    live in the tray, not here.
  - `StatusBar` — watcher state, current zone, and the last drop seen.
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
