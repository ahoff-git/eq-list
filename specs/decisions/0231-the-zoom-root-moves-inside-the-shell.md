# 0231: The zoom root moves inside the shell

## Status

Accepted

## Context

[ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md) settled *where* the interface scale
lives — a CSS `zoom` set by each window's own renderer, on `documentElement`, because Chromium's
`webContents.setZoomFactor` is per *origin* and every window here shares one. That put `body`, and
everything Chromium treats as part of "the document," *inside* the zoomed subtree along with it —
harmless at the time, because nothing yet portaled onto `body` from outside that subtree.

[ADR 0230](./0230-every-table-gets-a-column-menu.md) introduced something that did.
`@mui/x-data-grid`'s footer uses `@mui/material`'s own `Select`, backed by a `Popover` that computes
its position from `getBoundingClientRect()` — already in the window's zoomed, "visual" pixels — and
writes that number straight back as a raw `style.top`/`left` on an element it portals onto
`document.body`. Read from `Popover`'s own source rather than guessed at (ADR 0230's Context): with
`body` sitting *inside* the same zoomed `documentElement` the anchor does, the ambient `zoom` scales
that already-scaled number a second time, so the menu lands further from its anchor the further the
window's scale sits from 100%. ADR 0230 didn't fix this — it routed around it, hiding the footer on
six of the seven `DataGrid`-backed tables and pinning `FactionPanel`'s `HitTable` to a **single**
page size specifically because `TablePagination`'s own source only mounts the `Select` at all when
`rowsPerPageOptions.length > 1`. A workaround, on record as one: any table that later wanted a real
choice of page size needed the popover's math fixed at its root, not sidestepped again.

## Decision

**The zoom moves off `documentElement` and onto each window's own shell element** — `.app` for the
main window, `.map-win` for the map (`globals.css`) — one level *inside* `body`, not `body` itself.
`useUiScale` (`src/lib/hooks.ts`), which ADR 0041 had apply the zoom to the document root, now takes
a `ref: RefObject<HTMLElement | null>` and sets `el.style.zoom` on whatever element it's handed
instead of assuming `documentElement`. `page.tsx` and `map/page.tsx` each keep their own shell ref
(`appShellRef`, `mapShellRef`) and pass it in alongside their own scale (`overlay.fontScale` /
`overlay.mapFontScale`) — the same one-hook-call-per-window shape ADR 0041 established, now aimed at
a specific element rather than an implicit global one. `document.body`, and anything a library
portals onto it — `@mui/material`'s `Popover` chief among them — now sits *outside* the zoomed
subtree, so a popover's own real-pixels-in/real-pixels-out math is never touched by the ambient zoom
a second time.

Nothing downstream is allowed to assume the zoom still lives on `documentElement` either.
`useUiScale` stamps a marker attribute (`UI_SCALE_ROOT_ATTR`, `data-ui-scale-root`) onto whichever
element it zooms, and `rootZoom()` (`src/lib/screen.ts`) locates that element with
`document.querySelector('[data-ui-scale-root]')` and reads its computed `zoom`, falling back to `1`
if none is found — a window that never calls `useUiScale` (the alert overlay, a test page) reads
`1` without needing to know that about itself. This is how `screen.ts` and `hooks.ts` agree on where
the zoom lives without either file hardcoding the other's shell class name; `localLength`,
`localPoint`, `localView`, `localSize` and `localTextBox` all divide by `rootZoom()` unchanged, since
they only ever cared what the factor *is*, never which element carries it.

`.app`/`.map-win` keep the `height: 100%` (not `100vh`) ADR 0041 gave `documentElement`: a `vh`
length is still measured against the true viewport regardless of which element the zoom sits on, so
it would come up `scale`-short and leave a gap, while `zoom` still expands its own element's
containing block so a percentage fills it exactly. The reasoning is unchanged, just applied one
element further in.

## Consequences

- `@mui/material`'s `Popover`/`Select` is safe under this app's zoom at any scale, not just behind a
  single-option `TablePagination` — confirmed by `HitTable` (`FactionPanel.tsx`) turning its footer
  on with a real three-item `pageSizeOptions` (`[25, 50, 100]`) instead of ADR 0230's one-size
  workaround, running that way with nothing reported broken. [ADR 0249](./0249-every-grid-gets-a-real-pager.md)
  later leans on exactly this to give every grid in the app a real footer, not just `HitTable`'s.
- `useUiScale`'s signature changed — it now takes a `ref` rather than reaching for the document root
  itself — an exported-API break scoped to its two callers (`page.tsx`, `map/page.tsx`), both updated
  in the same change.
- Anything that reads or sets the app's zoom has to go through `rootZoom()` or `useUiScale`'s marker
  attribute now, not `documentElement` directly — a future `getComputedStyle(document.documentElement).zoom`
  would silently read `1` and reproduce the exact class of bug this record fixes, just by a different
  route.
- ADR 0041's premise — one CSS `zoom`, per window, set by that window's own renderer — is unchanged;
  only *which element inside the document* carries it moved.
