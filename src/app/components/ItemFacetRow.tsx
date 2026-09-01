"use client";
import FacetPicker from "./FacetPicker";
import { NO_FACET_VALUE, type FacetCounts, type FacetMeta, type ItemCriteria } from "@/shared/item-search";

/**
 * A row of facet dropdowns, wired to one criteria object.
 *
 * There are two of these rows on the Items tab — what an item *is* and what it *does* — and they were
 * the same eight lines of plumbing written twice, which is exactly how the second one comes to lag a
 * change made to the first.
 */
export default function ItemFacetRow({
  facets,
  options,
  counts,
  criteria,
  onChange,
}: {
  facets: readonly FacetMeta[];
  options: Record<string, string[]>;
  counts: FacetCounts;
  criteria: ItemCriteria;
  onChange: (facet: string, values: string[]) => void;
}) {
  return (
    <>
      {facets.map((facet) => (
        <FacetPicker
          key={facet.key}
          label={facet.label}
          any={facet.any}
          options={options[facet.key] ?? []}
          // The `(none)` row's own count, which is a value of the facet like any other.
          missing={counts[facet.key]?.get(NO_FACET_VALUE) ?? 0}
          counts={counts[facet.key]}
          chosen={criteria.facets[facet.key]}
          onChange={(values) => onChange(facet.key, values)}
        />
      ))}
    </>
  );
}
