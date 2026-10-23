"use client";
import { useMobZones, useNpcSightings } from "@/lib/hooks";
import type { KnownItem } from "@/shared/items/known-items";
import ObservedItemView from "@/app/components/items/ObservedItemView";
import ObservedMobView from "@/app/components/mob/ObservedMobView";

/**
 * A title the wiki returned no page for: a mob's page if your log has killed or seen it, otherwise an
 * item's (ADR 0103, ADR 0334). Mounted only after a miss, so a page the wiki has never pays for either read.
 */
export default function ObservedPageView({ title, known }: { title: string; known: readonly KnownItem[] }) {
  const killed = useMobZones(title).length > 0;
  const seen = useNpcSightings(title).length > 0;
  return killed || seen ? <ObservedMobView title={title} /> : <ObservedItemView title={title} known={known} />;
}
