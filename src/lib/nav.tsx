"use client";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { createLogger } from "@/shared/logging";
import {
  canStepBack,
  canStepForward,
  crumbTrail,
  goTo,
  here,
  placeLabel,
  readTrail,
  stepBack,
  stepForward,
  stepTo,
  trailOf,
  type NavCrumb,
  type NavPlace,
  type NavTrail,
} from "@/shared/nav-trail";
import { STORAGE_KEYS } from "./storageKeys";
import { usePersistentState } from "./usePersistentState";

const log = createLogger("nav");

/**
 * Where the control window is, and how it got there.
 *
 * Clicking an item / mob / quest name anywhere (search results, the list, the hunt) opens that wiki
 * page *inside* the app rather than launching the browser — only the explicit "↗ eqlwiki" button
 * leaves ([ADR 0008](../../specs/decisions/0008-in-app-page-navigation.md)). This owns **both** halves
 * of "where you are": the tab showing and the page open on it, because back only works if one thing
 * records every move ([ADR 0173](../../specs/decisions/0173-back-goes-back-one-place.md)).
 *
 * So the tab is read from here (`nav.tab`) and switched through here (`openTab`) — a second owner of
 * it would be a move the trail never saw, which is exactly the back button that did nothing.
 * `back`/`forward` are driven by the mouse thumb buttons and Alt+←/→ (see `page.tsx`) and by the
 * `NavBar`, which also draws the trail.
 */
export interface Nav {
  /** The tab showing now. */
  tab: string;
  /** The page open on it, or null when the tab is showing its own view. */
  current: string | null;
  canBack: boolean;
  canForward: boolean;
  /** The way in to where you are, oldest first, and how many older places it leaves out. */
  crumbs: NavCrumb[];
  hiddenCrumbs: number;
  /** Show a tab. Its own view, so any open page closes. */
  openTab: (tab: string) => void;
  /** Open a page by title — the universal in-app link action; shows it on the page tab. */
  openPage: (title: string) => void;
  /** Back to the current tab's own view, leaving the page behind you rather than gone. */
  closePage: () => void;
  back: () => void;
  forward: () => void;
  /** Jump to a place already on the trail — a breadcrumb click. */
  goToCrumb: (index: number) => void;
}

/**
 * The tab a page is read on. Pages render inside `SearchPanel`, which is the tab whose job is
 * looking things up; opening a link from anywhere else surfaces it there.
 */
export const PAGE_TAB = "search";

/** Where a window with no remembered trail starts. */
const HOME_TAB = "list";

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within <NavProvider>");
  return ctx;
}

/**
 * The same, but null outside a provider. Only the control window has an in-app page view,
 * so shared components (`ItemLink`) that also render in the map window ask this way and
 * fall back to handing the name to the control window instead of crashing.
 */
export function useOptionalNav(): Nav | null {
  return useContext(NavContext);
}

/**
 * Owns the trail, and persists it — the window reopens where it was left, which is what the tab
 * alone used to do under the older key this inherits from (see `readTrail`).
 */
export function NavProvider({ home = HOME_TAB, children }: { home?: string; children: ReactNode }) {
  const [stored, setStored] = usePersistentState<NavTrail>(STORAGE_KEYS.nav, trailOf(home), {
    key: STORAGE_KEYS.activeTab,
    migrate: (old) => readTrail(old, home),
  });
  // Read on the way out rather than trusting what came back: this value has been through storage,
  // and may be an older build's bare tab name — or nothing.
  const trail = useMemo(() => readTrail(stored, home), [stored, home]);

  const move = useCallback(
    (what: string, step: (t: NavTrail) => NavTrail) => {
      setStored((s) => {
        const next = step(readTrail(s, home));
        log.debug(what, "→", here(next), `(${next.at + 1}/${next.places.length})`);
        return next;
      });
    },
    [setStored, home],
  );

  const go = useCallback((place: NavPlace) => move("go", (t) => goTo(t, place)), [move]);
  const openTab = useCallback((tab: string) => go({ tab }), [go]);
  const openPage = useCallback((title: string) => go({ tab: PAGE_TAB, page: title }), [go]);
  const back = useCallback(() => move("back", stepBack), [move]);
  const forward = useCallback(() => move("forward", stepForward), [move]);
  const goToCrumb = useCallback((index: number) => move("crumb", (t) => stepTo(t, index)), [move]);

  const value = useMemo<Nav>(() => {
    const at = here(trail);
    const { crumbs, hidden } = crumbTrail(trail);
    return {
      tab: at.tab,
      current: at.page ?? null,
      canBack: canStepBack(trail),
      canForward: canStepForward(trail),
      crumbs,
      hiddenCrumbs: hidden,
      openTab,
      openPage,
      closePage: () => go({ tab: at.tab }),
      back,
      forward,
      goToCrumb,
    };
  }, [trail, openTab, openPage, go, back, forward, goToCrumb]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export { placeLabel };
export type { NavCrumb, NavPlace };
