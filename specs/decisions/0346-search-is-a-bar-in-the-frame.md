# 0346: Search is a bar in the window's frame

## Status
Accepted

## Context
[ADR 0320](./0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md) added a Ctrl+K palette that
jumps to any section or looks the typed text up in Find → Search, and
[ADR 0321](./0321-find-answers-from-one-box.md) made Search's box answer from the wiki, your
inventory, stances and AAs at once. Between them the app already had one search for everything, but
it only existed while summoned. Nothing on screen said it was there, so anyone who didn't know the
shortcut walked the two rows of tabs to Find first.

## Decision
**The palette becomes a search bar that is always drawn** (`chrome/SearchBar.tsx`), on the right
of the back/forward trail's row, so it sits in the window's frame on every screen.

- It does what the palette did: matching sections first, then "Look up …" in Find → Search. Enter
  takes the highlighted choice, arrows move, Escape clears it.
- The list drops down under the bar while it has focus. Ctrl+K focuses the bar instead of opening
  a modal.
- The trail and the bar share one row (`.nav-row`). The trail keeps its overflow clip so a long
  page title can't push the ← off a narrow overlay; the bar sits beside it, not inside it, so its
  list isn't clipped.

The look-up step is one callback in `page.tsx` (`lookUp`), shared with the OCR and map-window
prefill that did the same two steps.

## Consequences
- Search is discoverable without the shortcut, and a lookup is one click from any screen.
- The bar takes about 220px of the trail's row, so on a narrow overlay the trail ellipsises sooner.
- The bar still lists sections and hands off a lookup. Showing wiki or inventory matches inside the
  dropdown itself would need Search's debounced wiki query outside the Search tab, and is not done.
