# 0008: In-app page navigation with a history stack

## Status
Superseded by [0173](./0173-back-goes-back-one-place.md)

## Context
The control window let you open one wiki page at a time; the "↗ eqlwiki" button
and several name clicks jumped straight to the external browser. Users wanted the
opposite: clicking any item / mob / quest name should stay **inside the app**
(browsing pages the way the wiki does), with the external browser reserved for one
explicit button. They also wanted the mouse thumb "back" button to work like a
browser back.

The renderer is a static export with no router history for our page views, and page
viewing lived privately inside `SearchPanel`, unreachable from the List or Hunt tabs.

## Decision
A single in-app navigation history, `src/lib/nav.tsx` (`NavProvider` / `useNav`):
a stack of page titles plus an index (`-1` = no page open). `openPage(title)` is the
one link action used everywhere (search results, list entries, hunt mobs/items, and
the components/sources inside a page). `back()`/`forward()` walk the stack; back from
the first page returns to the search box.

- The provider's `onOpen` callback switches the control window to the Search tab, so
  a link clicked on any tab surfaces the page there. `SearchPanel` renders whatever
  `nav.current` points at (fetching via the cached `wiki.getPage`).
- Browser back/forward from the **mouse thumb buttons** arrives in the main process
  as an `app-command` (`browser-backward`/`browser-forward`); `windows.ts` forwards it
  on `CH.navCommand`, and `page.tsx` also binds **Alt+←/→**. Both drive `nav`.
- Only the explicit "↗ eqlwiki" button (and the list row's ↗) calls
  `wiki.openInBrowser`. Nothing else leaves the app.
- The **overlay** deliberately does not participate: it's a passive glance surface
  with no page viewer, so its names are plain text (no navigation, no browser).

## Consequences
- One reusable link action; the List and Hunt tabs navigate without each owning page
  state or drilling props.
- Real back/forward (thumb buttons + keyboard) over a lightweight title stack — no
  router or persisted history needed; state resets on reload, which is fine.
- The stack holds titles, not fetched pages; revisiting refetches (cache-backed), so
  memory stays flat regardless of how deep you browse.
- Deep-linking to a specific page across a reload isn't supported (no URL sync); not
  needed for this desktop tool.
