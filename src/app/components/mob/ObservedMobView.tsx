"use client";
import { api } from "@/lib/api";
import MobEvidence from "@/app/components/mob/MobEvidence";

/**
 * The page for a mob or NPC **the wiki has no page for** — built from your own log (ADR 0334).
 *
 * The mob counterpart of `ObservedItemView` (ADR 0103): opening a mob you've killed forty times used to
 * say "Couldn't load", which is true of the wiki and false of the mob. Now it shows what the log knows,
 * the same block a wiki mob page has under it (`MobEvidence`).
 */
export default function ObservedMobView({ title }: { title: string }) {
  return (
    <div className="page-detail">
      <div className="row">
        <h3>{title}</h3>
        <span
          className="badge rate-observed"
          title="Your log knows this mob and eqlwiki returned no page for it — it has none, or it couldn't be reached just now."
        >
          from your log
        </span>
        <span className="spacer" />
        <button
          className="btn ghost sm"
          title="Look for it on eqlwiki — there may be no page yet"
          onClick={() => api()?.wiki.openInBrowser(title)}
        >
          ↗ eqlwiki
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        No page came back from eqlwiki, so everything below is your own log&apos;s.
      </p>
      <MobEvidence mob={title} onWiki={false} />
    </div>
  );
}
