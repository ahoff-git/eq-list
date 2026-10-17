/**
 * A vendor price, read out of what the wiki wrote — for the Tradeskills tab's cost estimates.
 *
 * eqlwiki has no price field. Prices are written by hand, so they come in the wiki's shorthand
 * rather than the log's full words (`money.ts`'s `parseCoins` reads those): "Costs around 0.524pp",
 * "approximately 5g3s", "0.08pp", "160" under a "Cost in Copper" header, or one number per column
 * under Plat / Gold / Silver / Copper headers. Everything here comes back as copper, the app's one
 * money unit, or `null` when the text states no price it can be sure of the unit of.
 */
import type { Copper } from "../money";

/** A coin unit as the wiki abbreviates it, with what one is worth in copper. */
const UNITS: readonly [RegExp, Copper][] = [
  [/^(?:pp|p|plat|platinum)$/i, 1000],
  [/^(?:gp|g|gold)$/i, 100],
  [/^(?:sp|s|silver)$/i, 10],
  [/^(?:cp|c|copper)$/i, 1],
];

/** One unit word → copper per unit, or undefined. */
export function unitCopper(word: string): Copper | undefined {
  return UNITS.find(([re]) => re.test(word.trim()))?.[1];
}

/** "<number><unit>" runs — `0.524pp`, `5g3s`, `2 plat 5 gold`. The unit must follow the number. */
const AMOUNT = /(\d+(?:\.\d+)?)\s*(platinum|plat|pp|gold|gp|silver|sp|copper|cp|p|g|s|c)(?![a-z])/gi;

/**
 * The first price written in `text`, in copper: the first run of amounts with units, summed while
 * they stay adjacent ("5g3s", "2 plat 5 gold"), so a second, separate price later in the sentence
 * isn't added to the first. Rounded to whole copper.
 */
export function parsePriceText(text: string | undefined): Copper | null {
  if (!text) return null;
  let total = 0;
  let end = -1;
  for (const m of text.matchAll(AMOUNT)) {
    const per = unitCopper(m[2]);
    if (per === undefined) continue;
    // A gap of more than a space or two ends the first price.
    if (end >= 0 && text.slice(end, m.index).trim().replace(/^(?:and|,)$/i, "") !== "") break;
    total += Number(m[1]) * per;
    end = (m.index ?? 0) + m[0].length;
  }
  return end >= 0 ? Math.round(total) : null;
}

/**
 * The unit a cost column's header declares — "Material Cost (pp)", "Cost (CP)", "Cost in Copper" —
 * or undefined when it says none.
 */
export function headerUnit(header: string): Copper | undefined {
  const m = /\(([a-z]+)\)|\bin\s+([a-z]+)\b/i.exec(header);
  return m ? unitCopper(m[1] ?? m[2]) : undefined;
}

/**
 * A price cell under a cost header: its own units if it writes any, else a bare number in the
 * header's unit. A bare number under a header with no unit is **not** a price — "20" under "Cost" is
 * copper on one page and platinum on the next, and a wrong guess is worse than a gap.
 */
export function parsePriceCell(cell: string, unit: Copper | undefined): Copper | null {
  const own = parsePriceText(cell);
  if (own !== null) return own;
  const bare = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(cell);
  return bare && unit !== undefined ? Math.round(Number(bare[1]) * unit) : null;
}

/**
 * An item's own notes, read for what a merchant **charges** — "Costs around 0.524pp", "Vendors sell
 * this for approximately 5g3s". A note about what a merchant **pays** for it ("sells to vendors
 * for", "vendor price") is the other direction and isn't read.
 */
export function priceFromNotes(notes: string | undefined): Copper | null {
  if (!notes) return null;
  if (/sells?\s+(?:back\s+)?to\s+(?:a\s+)?(?:vendors?|merchants?)|vendors?\s+(?:buy|pay)s?|sell\s+price/i.test(notes)) return null;
  return parsePriceText(notes);
}
