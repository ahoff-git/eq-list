"use client";
import { statMeta } from "@/shared/items/item-stats";
import type { DerivedGain } from "@/shared/items/derived-stats";

/**
 * Why an item is worth more than its printed numbers, in words: "+203 mana from 9 INT". One line,
 * under the item's name, only when its attributes give something in a stat you've weighted
 * (`derivedGains`) — so the loadout and the hunt can suggest an INT item *because* of the mana.
 */
export function GainNote({ gains }: { gains: readonly { from: DerivedGain["from"]; to: DerivedGain["to"]; points: number; amount: number }[] }) {
  if (!gains.length) return null;
  return (
    <div className="small good" title="What this item's attributes give, at your classes' and level's rates — counted in its value">
      {gains.map((g) => `+${g.amount} ${statMeta(g.to).label.toLowerCase()} from ${g.points} ${statMeta(g.from).label}`).join(" · ")}
    </div>
  );
}
