/**
 * mcp-catalogue.ts — the pure argument-shaping `scripts/mcp-server.mjs`'s catalogue tools need, pulled
 * out of that file so it can be a tested black box instead of untested glue inside an entrypoint
 * script. Three small, easy-to-get-backwards rules live here:
 *
 * - The facet picker's own `"(none)"` label has to become the real sentinel `item-search.ts` matches
 *   on (`NO_FACET_VALUE`) before `searchItems` ever sees it — pass the label through unmapped and
 *   every `(none)` tick quietly becomes a literal facet value nothing has.
 * - Pagination's `total` has to count the *filtered* set, not the page — a caller paging through 11,899
 *   rows 50 at a time needs to know there are 11,899, not 50.
 * - An era filter has to leave a result **without** an `outOfEra` field alone (never flagged, not
 *   flagged false) when it isn't asked to hide anything, and cut only the ones that are `true` when it
 *   is — treating "never checked" as "in era" would be a guess this module has no business making.
 */

/** The item facet picker's own label for "nothing to tick" — see `item-search.ts`'s `NO_FACET_VALUE`. */
export const NONE_FACET_LABEL = "(none)";

/** `args[facetKey]` as the UI would hand it to a picker, translated to what `matchesFacet` expects. */
export function withNoneSentinel(values: readonly string[], sentinel: string): string[] {
  return values.map((v) => (v === NONE_FACET_LABEL ? sentinel : v));
}

/** What `list_item_catalogue`'s tool handler receives, once zod has validated and defaulted it. */
export interface ItemCatalogueArgs {
  text?: string;
  facets?: Partial<Record<string, readonly string[]>>;
  mins?: Partial<Record<string, number>>;
  hideOutOfEra: boolean;
  levelMin?: number;
  levelMax?: number;
}

/** The shape `item-search.ts`'s `searchItems` actually takes — kept local so this file needs no import from it. */
export interface ItemCriteriaShape {
  text: string;
  facets: Record<string, string[]>;
  mins: Partial<Record<string, number>>;
  hideOutOfEra: boolean;
  levelMin?: number;
  levelMax?: number;
}

/**
 * Builds `ItemCriteria` from the tool's flat `{slot, weapon, class, …}` arguments.
 *
 * `facetKeys` is passed in (rather than hardcoded) so this file can't drift from `item-search.ts`'s own
 * `FACETS` list — the caller reads the real list and hands it over.
 */
export function toItemCriteria(
  args: ItemCatalogueArgs & Record<string, unknown>,
  facetKeys: readonly string[],
  noneSentinel: string,
): ItemCriteriaShape {
  const facets = Object.fromEntries(
    facetKeys.map((key) => [key, withNoneSentinel((args[key] as readonly string[] | undefined) ?? [], noneSentinel)]),
  );
  return {
    text: args.text ?? "",
    facets,
    mins: args.mins ?? {},
    hideOutOfEra: args.hideOutOfEra,
    levelMin: args.levelMin,
    levelMax: args.levelMax,
  };
}

/** One page of an already-filtered/sorted array, plus the total it was cut from. */
export interface Page<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

/**
 * Pages an already-filtered/sorted row array — unpaginated, the item catalogue alone is ~7MB, which a
 * small local model's context window can't absorb at all (measured: a real tool-calling run against it
 * just timed out). `total` still reports the filtered count, so a caller can tell "50 of 50" from "50
 * of 11,125" without ever having asked for everything.
 */
export function page<T>(rows: readonly T[], opts: { limit: number; offset: number }): Page<T> {
  return { total: rows.length, offset: opts.offset, limit: opts.limit, items: rows.slice(opts.offset, opts.offset + opts.limit) };
}

/**
 * Drops era-flagged results when asked. A result that was never flagged at all (`outOfEra` absent —
 * `flagOutOfEra` short-circuits when the era category set itself couldn't be read) is kept either way:
 * "never checked" is not evidence of "in era," and hiding it would be a claim this filter has no basis
 * for making.
 */
export function eraFiltered<T extends { outOfEra?: boolean }>(results: readonly T[], hideOutOfEra: boolean): T[] {
  return hideOutOfEra ? results.filter((r) => !r.outOfEra) : [...results];
}
