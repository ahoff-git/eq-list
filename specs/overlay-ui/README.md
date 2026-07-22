# Overlay UI

## Purpose
Give the player two windows: a full control panel for managing the list, and a
small always-on-top float that sits over the game and lights up on drops.

## Responsibilities
- **Control window** (`src/app/page.tsx`): tabs for
  - `ListPanel` — the shopping list **grouped by the quest/recipe that added each
    item** (collapsible sub-bullets; standalone items fall into "Other"). Grouping
    is `src/shared/grouping.ts` (`groupByOrigin`), shared with the overlay. Shows
    need/have counts and flash-on-match; each entry has an ↗ button that opens its
    eqlwiki page in the browser (`wiki.openInBrowser`, host-validated in main).
  - `SearchPanel` — fuzzy-search eqlwiki (typo-tolerant, ↑↓/Enter keyboard nav) with
    two modes: **By name** (any item/quest/recipe) and **By zone** (fuzzy-pick a zone,
    then list its quests). Open a page to add an item, or **"Add full quest"** to queue
    all of a quest's turn-ins at once (each tagged with the quest as its `origin`).
    Out-of-era results are badged, with a "hide out of era" toggle.
  - `SessionPanel` — live XP-gain and kill counts for the session, with XP
    attributed to the mob you killed most recently (from `session-stats.ts`), and a
    reset. `useSessionStats` subscribes to the broadcast snapshot.
  - `SettingsPanel` — log folder, match mode, overlay look, debug toggle, reset windows,
    and a **Help** area: global-shortcut list with live registration status (`app.info()`),
    a screengrab explanation, and a "Test screengrab lookup" button (`lookup.open()`).
  - `StatusBar` — watcher state, current zone, and the last drop seen.
- **Overlay window** (`src/app/overlay/page.tsx`): frameless, transparent,
  always-on-top; header is the drag handle; entries are grouped by quest/recipe
  (same `groupByOrigin`) and flash gold on match; honors `opacity`, `fontScale`,
  `showObtained`, `alwaysOnTop`, `clickThrough`. Dismiss it via the ✕, `Esc`, or
  the global toggle hotkey `Ctrl/Cmd+Shift+O` (`OVERLAY_HOTKEY` in
  `src/shared/constants.ts`, registered in `main.ts`) — the hotkey works even when
  click-through is on, so the float can't get stuck.
  - **Collapse by quest**: click a group's header to hide its sub-items (per-group,
    local state), so a long list stays glanceable.
  - **Who drops it, by zone**: click an entry to lazily fetch its page
    (`wiki.getPage`, cached) and show drop mobs grouped by zone
    (`src/shared/sources.ts` → `groupDropsByZone`). When the current zone is known
    (from the log, via `useCurrentZone`), that zone's drops are highlighted and
    shown first while the rest collapse behind a toggle (`splitDropsByCurrentZone`).
    The current zone also shows in the overlay header and the control-window status bar.
- **Screengrab lookup** (`src/app/select/page.tsx` + `electron/lookup.ts`): the
  `Ctrl/Cmd+Shift+L` hotkey (or the Search/Settings buttons) screenshots every display
  *first* (before any window shows, so a hovered tooltip is frozen and our UI isn't
  captured), then puts a selector over each monitor showing its frozen shot — so you
  can grab from anywhere. Dragging crops that display's frozen image; it's OCR'd
  (Tesseract.js) and the text is dropped into the control window's Search box
  (`search.onPrefill` → Search tab), where the normal fuzzy search takes over.
- **Client glue** (`src/lib/`): `api.ts` (null-safe access to `window.eql`) and
  `hooks.ts` (`useShoppingList`, `useSettings`, `useWatcherStatus`, `useLootFeed`,
  `useMatchFlashes`) — subscribe on mount, unsubscribe on unmount.
- Styling is one dark theme in `src/app/globals.css`; the body is transparent so
  the overlay window can be see-through.

## Non-responsibilities
- No business logic or persistence in the renderer — it calls `window.eql` and
  renders store state.
- Window creation, opacity, and click-through are applied by the main process
  (`electron/windows.ts`); the UI only requests them.

## See also
[architecture](../architecture/README.md) ·
[ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)
