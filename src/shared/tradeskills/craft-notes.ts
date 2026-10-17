/**
 * What a crafter wants to know about an ingredient on hover — where to buy it, what it's made from,
 * how many recipes use it — read off the item's own (cached) wiki page.
 *
 * The stat card answers "what is this"; a crafter mid-guide is asking "where do I get forty of
 * these". A vendor is the answer that matters most (most ingredients are bought), so it leads, judged
 * against the era like every other source in the app: a merchant in a shut zone is not somewhere to go.
 */
import { zoneShut } from "../items/item-era";
import type { ItemSource, WikiPage } from "../types";

/** How many merchants a hover names before it says how many more there are. */
const VENDORS_SHOWN = 2;

/** The "Player crafted" line a crafted item carries is its own recipe, not a recipe it goes into. */
const SELF_CRAFTED = /player\s*crafted/i;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function buyLine(vendors: ItemSource[], closed: ReadonlySet<string>): string | undefined {
  if (!vendors.length) return undefined;
  const open = vendors.filter((v) => !zoneShut(v.detail, closed));
  if (!open.length) return "Sold only in zones not open yet";
  const named = open.slice(0, VENDORS_SHOWN).map((v) => (v.detail ? `${v.where} (${v.detail})` : v.where));
  const more = open.length - named.length;
  return `Buy: ${named.join(", ")}${more > 0 ? ` +${more} more` : ""}`;
}

/** The ways to get it that aren't a merchant, in a few words. */
function otherWaysLine(sources: ItemSource[], closed: ReadonlySet<string>): string | undefined {
  const parts: string[] = [];
  const dropZones = new Set(
    sources.filter((s) => s.kind === "drop" && !zoneShut(s.detail, closed)).map((s) => s.detail?.trim() || "?"),
  );
  if (dropZones.size) parts.push(`drops in ${plural(dropZones.size, "zone")}`);
  if (sources.some((s) => s.kind === "forage")) parts.push("forageable");
  if (sources.some((s) => s.kind === "ground")) parts.push("ground spawn");
  if (sources.some((s) => s.kind === "quest")) parts.push("quest");
  return parts.length ? `Not sold by vendors — ${parts.join(", ")}` : undefined;
}

/** Ingredients once each — the wiki lists a few twice — with their counts. */
function madeFromLine(page: WikiPage): string | undefined {
  const seen = new Map<string, number>();
  for (const c of page.components) if (!seen.has(c.name)) seen.set(c.name, c.qty);
  if (!seen.size) return undefined;
  return `Made from: ${[...seen].map(([name, qty]) => (qty > 1 ? `${qty}× ${name}` : name)).join(", ")}`;
}

/**
 * The crafting lines for an item or recipe page, most useful first. Empty for anything else — a zone
 * or an NPC named in a guide has no ingredients to buy.
 */
export function craftNotes(page: WikiPage | null, closed: ReadonlySet<string>): string[] {
  if (!page || (page.kind !== "item" && page.kind !== "recipe")) return [];
  const vendors = page.sources.filter((s) => s.kind === "vendor");
  const usedIn = page.sources.filter((s) => s.kind === "recipe" && !SELF_CRAFTED.test(s.where)).length;
  const crafted = madeFromLine(page);
  const lines = [buyLine(vendors, closed) ?? (crafted ? undefined : otherWaysLine(page.sources, closed)), crafted];
  if (usedIn) lines.push(`Used in ${plural(usedIn, "recipe")}`);
  return lines.filter((l): l is string => !!l);
}
