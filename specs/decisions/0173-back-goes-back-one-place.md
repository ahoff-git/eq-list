# 0173: Back goes back one place, and a tab is a place

## Status
Accepted

## Context
[ADR 0008](./0008-in-app-page-navigation.md) gave the control window an in-app history: a stack of
wiki page **titles** plus an index, walked by the mouse thumb buttons and Alt+←/→, with back/forward
buttons drawn inside the page views. Which **tab** was showing was a separate piece of state in
`page.tsx`, persisted under its own key, and the history knew nothing about it.

That produced a back button that only sometimes went back:

- The commonest path through the app crosses tabs. Click a mob on **Hunt**, or an item on **List** or
  **Loot**, and the page opens on **Search** — the tab switch was a move nothing recorded, so back
  from that page landed on an empty search box rather than on the tab you came from.
- Starting a new search, or switching Search between "By name" and "By zone", called `nav.clear()`.
  The button then did nothing at all, having been handed an empty stack.
- The controls lived on the page views (`WikiPageView`, `ObservedItemView`), so from a tab with no
  page open there was nothing to press — the keyboard and mouse could still go back, but only to
  another page.
- Two owners of "where the window is" (the tab, and the page stack) meant every new jump had to
  remember to tell both. `openPage` fired an `onOpen` callback so the host could switch tabs; a peer
  notice and a screengrab lookup each set the tab directly, behind the history's back.

## Decision
**One trail of places.** A place is a *tab plus the page open on it*
(`src/shared/nav-trail.ts`, pure and tested); every move appends one — a tab click, a name click, a
page closing. Back and forward walk that trail, so back always means "the screen before this one",
whatever kind of screen it was.

- `NavProvider` owns the trail and is therefore the **single owner of the active tab**: `nav.tab` is
  read for what to render, `nav.openTab` is how anything switches. There is no second tab state and
  no `onOpen` callback.
- Arriving where you already are appends nothing. Going somewhere new after going back drops the
  forward places, as in any browser. `clear()` is gone: closing a page is a *move*
  (`nav.closePage()`), so a new search leaves the page you were reading behind you rather than
  destroying the way back to it.
- The trail is **persisted** (`eqlist.main.nav`), inheriting the old `eqlist.main.tab` key once as
  its first place, so an upgrade opens where it left off. It is capped at 50 places.
- Back, forward and the **breadcrumb** are one control in the shell (`NavBar`, under the tab strip),
  not a row inside a page: the trail crosses tabs, and a button that only exists on wiki pages can
  only ever go back to a wiki page. A crumb is named by its page, or by its tab, and clicking one
  jumps to it. The bar draws nothing on a window that hasn't been anywhere yet.
- Unchanged from 0008: `openPage` is still the one link action, a page is still read on the Search
  tab, only the explicit "↗ eqlwiki" button leaves the app, and the alert overlay still doesn't
  participate.

## Consequences
- Back does what its name says from anywhere in the window, by keyboard, thumb button or the bar.
- The breadcrumb makes the history *visible*, which is the honest form of a back button that can now
  cross tabs — "← from Hunt" is a surprise unless you can see that Hunt is where you were.
- The window reopens where it was closed, including on a page. That is a change from 0008, which
  reset the history on reload; a restored place is a cached page read, not a fetch.
- One state to write when the window moves, and one to read. Panels stop being handed a tab setter,
  and the page views stop importing `useNav` at all.
- A trail naming a tab a later build has dropped falls back to the first tab rather than rendering an
  empty panel; a stored trail that can't be read at all falls back to the home tab.
- The trail is per window and lives in the renderer. Deep-linking by URL is still not supported, and
  is still not wanted.
