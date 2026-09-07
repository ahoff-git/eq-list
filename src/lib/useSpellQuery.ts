"use client";
import { useMemo } from "react";
import type { Sort } from "@/shared/sorting";
import {
  classOptions,
  searchSpells,
  type SpellCriteria,
  type SpellRow,
  type SpellSortKey,
} from "@/shared/spell-search";

/** Everything the Spells tab draws that is *computed* rather than typed. */
export interface SpellQuery {
  /** Every class any cached spell names, for the class picker. */
  classes: string[];
  /** The results, filtered and ordered. */
  found: SpellRow[];
}

/**
 * The Spells tab's whole computation, in one place and away from its layout — mirrors
 * `useItemQuery`, pared down to what a spell catalogue needs (no era corpus, no facet counts, no
 * stat-weight scoring; see [ADR 0195](../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)).
 */
export function useSpellQuery(rows: readonly SpellRow[], criteria: SpellCriteria, sort: Sort<SpellSortKey>): SpellQuery {
  const classes = useMemo(() => classOptions(rows), [rows]);
  const found = useMemo(() => searchSpells(rows, criteria, sort), [rows, criteria, sort]);
  return { classes, found };
}
