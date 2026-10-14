/**
 * gm-event-items.ts — was this item only ever handed out at a GM event?
 *
 * Such an item is **never in era**: no drop, vendor or quest reaches it, whatever the wiki's era
 * categories say ([ADR 0292](../../../specs/decisions/0292-a-gm-event-item-is-never-in-era.md)).
 * `gm-event-items.generated.ts` is the list, read off eqlwiki's prose; this is the lookup over it,
 * and the one rule every era flag in the app applies on top of the categories.
 *
 * Names fold through `normalizeItemName`, so a graded copy ("Oakwynd +1") is the same item.
 */
import { normalizeItemName } from "./grouping";
import { GM_EVENT_ITEMS } from "./gm-event-items.generated";

const GM_EVENT = new Set(GM_EVENT_ITEMS.map(normalizeItemName));

export function isGmEventItem(title: string): boolean {
  return GM_EVENT.has(normalizeItemName(title));
}

/**
 * The era flag with this rule applied: out of era if the wiki's categories said so, **or** if the
 * item only ever came from a GM event.
 */
export function outOfEraWithGmEvents(title: string, flagged: boolean | undefined): boolean {
  return !!flagged || isGmEventItem(title);
}

/** A page or result with its era flag corrected — returned as-is when nothing changes. */
export function withGmEventEra<T extends { title: string; outOfEra?: boolean }>(x: T): T;
export function withGmEventEra<T extends { title: string; outOfEra?: boolean }>(x: T | null): T | null;
export function withGmEventEra<T extends { title: string; outOfEra?: boolean }>(x: T | null): T | null {
  if (!x || x.outOfEra || !isGmEventItem(x.title)) return x;
  return { ...x, outOfEra: true };
}
