"use client";
import { nextSort, type Sort } from "@/shared/sorting";

/**
 * A sortable column header: click to sort by this column, click again to flip it. The arrow marks
 * which column is doing the sorting and which way, because a table that's sorted invisibly is a
 * table you don't trust.
 *
 * Presentational only — `nextSort` decides what a click means, so every table in the app agrees.
 * Styled by `.stat-table th.sortable`, and the button inherits the column's own alignment so a
 * numeric column's header still sits over its digits.
 */
export default function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  title,
  startDesc = true,
  className,
}: {
  label: string;
  column: K;
  sort: Sort<K>;
  onSort: (next: Sort<K>) => void;
  title?: string;
  /** Which way this column opens on its first click — descending suits numbers, ascending names. */
  startDesc?: boolean;
  /**
   * The column's own class, for a table whose alignment can't be written as a position.
   *
   * The button inherits the header's alignment, so a numeric column has to be able to say it is one
   * — and in the item search *which* column holds a number changes with the weights, so the
   * stylesheet cannot name it by `nth-child` the way the fixed tables do.
   */
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th
      className={["sortable", active ? "sorted" : "", className ?? ""].filter(Boolean).join(" ")}
      title={title ?? `Sort by ${label.toLowerCase()}`}
    >
      <button onClick={() => onSort(nextSort(sort, column, startDesc))}>
        {label}
        {active ? (sort.desc ? " ▾" : " ▴") : ""}
      </button>
    </th>
  );
}
