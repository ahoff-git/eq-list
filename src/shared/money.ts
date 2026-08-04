/**
 * money.ts — EverQuest coin, as one number plus the words to say it in.
 *
 * The log writes money in denominations ("1 silver and 4 copper") but every question
 * worth asking of it is arithmetic: what did this mob pay, what does this item fetch,
 * what is the camp worth per hour. So coin is carried as an integer count of **copper**
 * — the smallest denomination, so nothing rounds — and turned back into denominations
 * only for display. One canonical form means sums, rates and comparisons can't disagree
 * with each other, which four parallel counters would eventually do.
 *
 * Rates are 1 platinum = 10 gold = 100 silver = 1000 copper.
 */

/** Copper — the canonical unit. Named so a signature says what the number means. */
export type Copper = number;

/** Coin split into denominations, for display. */
export interface Money {
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
}

/** Denominations, largest first, with what one of each is worth in copper. */
const DENOMINATIONS: { name: keyof Money; short: string; copper: number }[] = [
  { name: "platinum", short: "p", copper: 1000 },
  { name: "gold", short: "g", copper: 100 },
  { name: "silver", short: "s", copper: 10 },
  { name: "copper", short: "c", copper: 1 },
];

const COPPER_PER = new Map(DENOMINATIONS.map((d) => [d.name as string, d.copper]));

/** Every "<n> <denomination>" in a string, whatever separates them. */
const COIN_RE = /(\d+)\s*(platinum|gold|silver|copper)/gi;

/**
 * Coin from the log's own phrasing ("3 silver and 2 copper", "1 platinum, 2 gold and 4
 * copper") in copper, or null when the text names no coin at all.
 *
 * Every denomination present is summed rather than matched as a fixed shape: EQ joins them
 * with commas, "and", or neither depending on how many there are, and a pattern that
 * assumes one of those quietly returns nothing for the others. Order is ignored for the
 * same reason — the arithmetic doesn't care.
 */
export function parseCoins(text: string | undefined): Copper | null {
  if (!text) return null;
  let total = 0;
  let found = false;
  for (const m of text.matchAll(COIN_RE)) {
    const per = COPPER_PER.get(m[2].toLowerCase());
    if (per === undefined) continue;
    total += Number(m[1]) * per;
    found = true;
  }
  return found ? total : null;
}

/** Copper split into denominations. Negative input is treated as zero — coin isn't owed. */
export function coinBreakdown(copper: Copper): Money {
  let left = Math.max(0, Math.round(copper));
  const out: Money = { platinum: 0, gold: 0, silver: 0, copper: 0 };
  for (const d of DENOMINATIONS) {
    out[d.name] = Math.floor(left / d.copper);
    left -= out[d.name] * d.copper;
  }
  return out;
}

/**
 * Compact coin for a table cell: "1p 2g 4c", zero denominations omitted. Nothing at all
 * reads as "0c" rather than an empty string, so a real zero can't be mistaken for a gap
 * in the data — a mob that pays nothing is a finding.
 */
export function formatCoins(copper: Copper): string {
  const split = coinBreakdown(copper);
  const parts = DENOMINATIONS.filter((d) => split[d.name] > 0).map((d) => `${split[d.name]}${d.short}`);
  return parts.length ? parts.join(" ") : "0c";
}

/**
 * The same in words, for a tooltip: "1 platinum, 2 gold and 4 copper". Long-winded on
 * purpose — it's the form the log uses, so a hover matches what the player read in game.
 */
export function describeCoins(copper: Copper): string {
  const split = coinBreakdown(copper);
  const parts = DENOMINATIONS.filter((d) => split[d.name] > 0).map((d) => `${split[d.name]} ${d.name}`);
  if (!parts.length) return "no coin";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
