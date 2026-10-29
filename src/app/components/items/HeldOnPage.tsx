"use client";
import { useHeldOnPage } from "@/lib/exports/ownership";
import { useNav } from "@/lib/chrome/nav";
import { heldOnPageText } from "@/shared/items/ownership-notes";
import { exportAgeText } from "@/shared/game-exports";

/**
 * An item page's "how many do I have": the count in your inventory export, per area — bags, bank,
 * shared bank, Tradeskill depot, Storage — and how old the export is, since the game only writes it
 * when you ask (ADR 0350). With a dump that doesn't hold it, it says none; with no dump, nothing.
 * The age links to Exports, where retaking it is one click.
 */
export default function HeldOnPage({ title }: { title: string }) {
  const { total, at } = useHeldOnPage(title);
  const nav = useNav();
  if (at === undefined) return null;
  return (
    <div className={`held-on-page small ${total ? "" : "muted"}`}>
      In your inventory: {total ? heldOnPageText(total) : "none"}{" "}
      <span className="link muted" title="Open Character → Exports to retake it" onClick={() => nav.openTab("exports")}>
        (export {exportAgeText(Date.now() - at)})
      </span>
    </div>
  );
}
