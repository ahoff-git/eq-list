/**
 * nav-trail.ts — where the control window has been, as a list of **places**.
 *
 * The in-app history used to be a stack of wiki page titles ([ADR 0008](../../specs/decisions/0008-in-app-page-navigation.md)),
 * which made "back" mean "the page before this one" and nothing else. But most of what a reader does
 * in this window is not opening pages: they click Hunt, then a mob name (which jumps to Search), then
 * back — and back had no record of the Hunt tab, so it left them on an empty search box. The stack
 * also got wiped whenever a search re-started, so the button could do nothing at all.
 *
 * A place is therefore a **tab plus the page open on it**, and every move — a tab click, a name
 * click, closing a page — appends one. Back then always means "the screen I was looking at before
 * this one", which is the only thing anybody means by it.
 *
 * Pure and framework-free so it can be tested as a black box; `src/lib/nav.tsx` is the React binding
 * and `NavBar` draws it.
 */

/** A screen in the control window: which tab, and the wiki page open on it (if any). */
export interface NavPlace {
  tab: string;
  /** A wiki/observed page title. Absent means the tab's own view. */
  page?: string;
}

/** Where you've been, and which of those you're looking at. `places` is never empty. */
export interface NavTrail {
  places: NavPlace[];
  /** Index into `places` of the one showing; always in range. */
  at: number;
}

/**
 * How many places are kept behind you.
 *
 * A cap rather than an unbounded list because the trail is persisted, and a reader who browses
 * for an hour would otherwise write a growing record on every click. Deep enough that hitting the
 * limit means "further back than anyone retraces by pressing a button".
 */
export const TRAIL_LIMIT = 50;

/** How many places the breadcrumb shows at once; anything older is counted as `hidden`. */
export const CRUMB_SPAN = 4;

/** A trail that has only ever been at one place. */
export function trailOf(tab: string): NavTrail {
  return { places: [{ tab }], at: 0 };
}

/** The place showing now. */
export function here(trail: NavTrail): NavPlace {
  return trail.places[trail.at];
}

/** Two places are the same screen — same tab, same page (or no page on both). */
export function samePlace(a: NavPlace, b: NavPlace): boolean {
  return a.tab === b.tab && (a.page ?? null) === (b.page ?? null);
}

export function canStepBack(trail: NavTrail): boolean {
  return trail.at > 0;
}

export function canStepForward(trail: NavTrail): boolean {
  return trail.at < trail.places.length - 1;
}

/**
 * Go somewhere new: forward history is dropped, as in any browser — where you'd have gone next is
 * not where you're going now.
 *
 * Arriving at the place you're already on returns the trail **unchanged** (same object), so a
 * re-click of the active tab neither doubles a crumb nor re-renders anything.
 */
export function goTo(trail: NavTrail, place: NavPlace): NavTrail {
  if (samePlace(here(trail), place)) return trail;
  const places = [...trail.places.slice(0, trail.at + 1), clean(place)];
  // Trim from the oldest end, so the newest TRAIL_LIMIT places are the ones kept.
  const kept = places.slice(Math.max(0, places.length - TRAIL_LIMIT));
  return { places: kept, at: kept.length - 1 };
}

export function stepBack(trail: NavTrail): NavTrail {
  return canStepBack(trail) ? { ...trail, at: trail.at - 1 } : trail;
}

export function stepForward(trail: NavTrail): NavTrail {
  return canStepForward(trail) ? { ...trail, at: trail.at + 1 } : trail;
}

/** Jump to a place already on the trail (a breadcrumb click). Out-of-range indexes change nothing. */
export function stepTo(trail: NavTrail, index: number): NavTrail {
  if (index === trail.at || index < 0 || index >= trail.places.length) return trail;
  return { ...trail, at: index };
}

/** What a place is called on a breadcrumb: the page it holds, else the tab's own name. */
export function placeLabel(place: NavPlace): string {
  if (place.page) return place.page;
  return place.tab.charAt(0).toUpperCase() + place.tab.slice(1);
}

export interface NavCrumb {
  place: NavPlace;
  /** Its index in the trail, so a click can jump straight to it. */
  index: number;
  current: boolean;
}

/**
 * The breadcrumb: the way in to where you are, newest last, plus how many older places it left out.
 *
 * Only the places *behind* you — forward history is somewhere you haven't been, and a browser
 * doesn't name it either.
 */
export function crumbTrail(trail: NavTrail, span = CRUMB_SPAN): { crumbs: NavCrumb[]; hidden: number } {
  const first = Math.max(0, trail.at - span + 1);
  const crumbs = trail.places.slice(first, trail.at + 1).map((place, i) => ({
    place,
    index: first + i,
    current: first + i === trail.at,
  }));
  return { crumbs, hidden: first };
}

/**
 * Make sense of a stored trail, whatever shape it turns out to be.
 *
 * The trail is persisted, so what comes back may be from an older build — including the bare tab
 * name the previous key held ([ADR 0173](../../specs/decisions/0173-back-goes-back-one-place.md)) —
 * or nothing at all. Anything unreadable falls back to `home` rather than throwing: a reader who
 * loses their history is mildly inconvenienced, and one who loses their window is not.
 */
export function readTrail(stored: unknown, home: string): NavTrail {
  if (typeof stored === "string" && stored) return trailOf(stored); // the old activeTab key
  const raw = stored as Partial<NavTrail> | null | undefined;
  if (!raw || !Array.isArray(raw.places)) return trailOf(home);
  const places = raw.places.filter(isPlace).map(clean).slice(-TRAIL_LIMIT);
  if (!places.length) return trailOf(home);
  const at = typeof raw.at === "number" ? Math.min(Math.max(0, Math.trunc(raw.at)), places.length - 1) : places.length - 1;
  return { places, at };
}

function isPlace(p: unknown): p is NavPlace {
  const c = p as NavPlace | null;
  return !!c && typeof c.tab === "string" && !!c.tab && (c.page === undefined || typeof c.page === "string");
}

/** Store a place as exactly its two facts — an undefined `page` isn't written at all. */
function clean(place: NavPlace): NavPlace {
  return place.page ? { tab: place.tab, page: place.page } : { tab: place.tab };
}
