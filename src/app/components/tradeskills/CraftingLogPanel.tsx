"use client";
import { useTradeskillProgress } from "@/lib/hooks";
import CraftingLogView from "@/app/components/tradeskills/CraftingLogView";

/**
 * Craft → Crafting log: every combine your log records — by sitting, by item, and by item at each
 * skill level. Its own section beside the guides rather than a toggle inside them (ADR 0333).
 */
export default function CraftingLogPanel() {
  const progress = useTradeskillProgress();
  return (
    <div className="tradeskills-panel">
      <div className="page-detail tradeskill-detail">
        <CraftingLogView progress={progress} />
      </div>
    </div>
  );
}
