"use client";
import { useMemo } from "react";
import type { Sort } from "@/shared/sorting";
import { liveLevelCap } from "@/shared/zones/expansions";
import {
  classOptions,
  searchSpells,
  spellEraRows,
  type SpellCriteria,
  type SpellRow,
  type SpellSortKey,
} from "@/shared/spells/spell-search";

/** Everything the Spells tab draws that is *computed* rather than typed. */
export interface SpellQuery {
  /** Every class any cached spell names, for the class picker. */
  classes: string[];
  /** The results, filtered and ordered. */
  found: SpellRow[];
}

/**
 * The Spells tab's whole computation, in one place and away from its layout — mirrors
 * `useItemQuery`, pared down to what a spell catalogue needs (no facet counts, no stat-weight
 * scoring; see [ADR 0195](../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)).
 *
 * `closedZones` is the live out-of-era list: it sets the level cap `spellEraRows` reads the catalogue
 * against, since the wiki's page flag misses most spells past it.
 */
export function useSpellQuery(
  rows: readonly SpellRow[],
  criteria: SpellCriteria,
  sort: Sort<SpellSortKey>,
  closedZones: ReadonlySet<string>,
): SpellQuery {
  const levelCap = useMemo(() => liveLevelCap(closedZones), [closedZones]);
  const corpus = useMemo(() => spellEraRows(rows, levelCap), [rows, levelCap]);
  const classes = useMemo(() => classOptions(rows), [rows]);
  const found = useMemo(() => searchSpells(corpus, criteria, sort), [corpus, criteria, sort]);
  return { classes, found };
}
