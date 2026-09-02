"use client";
import { Fragment } from "react";
import { placeLabel, useNav } from "@/lib/nav";

/**
 * Back, forward, and the way in to where you are.
 *
 * It lives in the shell under the tab strip rather than inside a page, because the trail crosses
 * tabs and a control that only exists on wiki pages can only ever go back to a wiki page — which is
 * the button that used to do nothing after a name click from the Hunt tab (ADR 0173).
 *
 * Nothing to show is nothing drawn: a window sitting on the tab it opened on has no history worth a
 * row of its own, and this is an overlay that plays over a game.
 */
export default function NavBar() {
  const nav = useNav();
  const idle = !nav.canBack && !nav.canForward;
  // The current crumb is where you already are — it names the screen rather than offering it.
  const crumbs = nav.crumbs.map((c) => ({ ...c, label: placeLabel(c.place) }));

  if (idle) return null;

  return (
    <div className="crumbs no-drag">
      <button className="btn ghost sm" title="Back (Alt+← or the mouse's back button)" disabled={!nav.canBack} onClick={nav.back}>
        ←
      </button>
      <button className="btn ghost sm" title="Forward (Alt+→)" disabled={!nav.canForward} onClick={nav.forward}>
        →
      </button>
      {nav.hiddenCrumbs > 0 && (
        <span className="crumb-more" title={`${nav.hiddenCrumbs} earlier · press back to walk them`}>
          …
        </span>
      )}
      {crumbs.map((c, i) => (
        <Fragment key={c.index}>
          {i > 0 && <span className="crumb-sep">›</span>}
          <button
            className={`crumb ${c.current ? "here" : ""}`}
            title={c.current ? c.label : `Back to ${c.label}`}
            disabled={c.current}
            onClick={() => nav.goToCrumb(c.index)}
          >
            {c.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
