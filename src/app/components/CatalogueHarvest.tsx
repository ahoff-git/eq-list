"use client";
import { api } from "@/lib/api";
import CatalogueHarvestPanel from "./CatalogueHarvestPanel";
import type { HarvestProgress } from "@/shared/types";

/**
 * Until a run has learned the roster, the measured size of a full one: **11,847 items** (the category
 * walk's answer, 680 more than `Category:Items` lists on its own
 * ([ADR 0177](../../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md))) plus
 * **7,944 NPCs** ([ADR 0178](../../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md))
 * plus the 177 zones and 1,547 quests that give an item its level
 * ([ADR 0163](../../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
 *
 * Only a starting guess: the moment a run learns the real roster the labels are computed from that
 * instead, which is why this being a little wrong costs nothing.
 */
const ASSUMED_PAGES = 21_500;

/**
 * The Items tab's catalogue-fill strip — the `CatalogueHarvestPanel` this file, `SpellCatalogueHarvest`
 * and their shared panel all describe, wired to the item wiki's own start/stop calls.
 *
 * The Items tab searches items by their stats, and its corpus is whatever pages have been fetched —
 * which without this is whatever you happened to have clicked on, a couple of hundred out of eleven
 * thousand. That is the difference between "the best ring I could wear" and "the best ring among the
 * ones I already looked at", and only one of those is worth sorting.
 */
export default function CatalogueHarvest({
  progress,
  held,
  pace,
  onPace,
}: {
  progress: HarvestProgress;
  /** How many items the catalogue holds right now — the panel's own count, not the run's. */
  held: number;
  pace: string;
  onPace: (pace: string) => void;
}) {
  return (
    <CatalogueHarvestPanel
      progress={progress}
      held={held}
      pace={pace}
      onPace={onPace}
      noun="item"
      nounPlural="items"
      assumedPages={ASSUMED_PAGES}
      idleHint="Searching stats only works over items we hold."
      onStart={(restart) => void api()?.wiki.harvestStart({ gapMs: Number(pace), restart })}
      onStop={() => void api()?.wiki.harvestStop()}
    />
  );
}
