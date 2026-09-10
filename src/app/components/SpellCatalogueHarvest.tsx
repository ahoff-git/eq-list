"use client";
import { api } from "@/lib/api";
import CatalogueHarvestPanel from "./CatalogueHarvestPanel";
import type { HarvestProgress } from "@/shared/types";

/**
 * Until a run has learned the roster, the measured size of a full one: `Category:Spells` holds 2,054
 * pages (confirmed against the live wiki, including its `Category:NPC_Only_Spells` subcategory).
 * Only a starting guess — the moment a run learns the real roster the labels are computed from that
 * instead ([ADR 0196](../../../specs/decisions/0196-spells-get-their-own-shard-addressed-mirror.md)).
 */
const ASSUMED_PAGES = 2_100;

/**
 * The spell search's catalogue-fill strip — the `spells` counterpart to `CatalogueHarvest`, sharing
 * every piece of its reasoning (`CatalogueHarvestPanel`) over the spell harvest's own start/stop calls
 * instead.
 */
export default function SpellCatalogueHarvest({
  progress,
  held,
  pace,
  onPace,
}: {
  progress: HarvestProgress;
  /** How many spells the catalogue holds right now — the panel's own count, not the run's. */
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
      noun="spell"
      nounPlural="spells"
      assumedPages={ASSUMED_PAGES}
      idleHint="Sorting only works over spells we hold."
      onStart={(restart) => void api()?.wiki.spellHarvestStart({ gapMs: Number(pace), restart })}
      onStop={() => void api()?.wiki.spellHarvestStop()}
    />
  );
}
