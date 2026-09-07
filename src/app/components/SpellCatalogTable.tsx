"use client";
import { memo } from "react";
import ItemLink from "./ItemLink";
import SortHeader from "./SortHeader";
import { manaPerDamage, minLevel, type SpellRow, type SpellSortKey } from "@/shared/spell-search";
import type { Sort } from "@/shared/sorting";

/**
 * Columns whose "unknown" case sorts to the bottom of their own default direction — see
 * `spellSortValue`. Kept as a table, the same reason `ItemTable`'s `CORE_COLUMNS` is one: each
 * column differs only in three strings and a direction, and writing that out five times is five
 * places to get the direction wrong.
 */
const COLUMNS: { label: string; column: SpellSortKey; title: string; startDesc: boolean }[] = [
  { label: "Spell", column: "name", title: "The spell's name", startDesc: false },
  { label: "Level", column: "level", title: "Lowest level any class can cast it at", startDesc: false },
  { label: "Mana", column: "mana", title: "Mana per cast, from the wiki's own card", startDesc: false },
  { label: "Cast", column: "castSec", title: "Casting time, seconds", startDesc: false },
  { label: "Recast", column: "recastSec", title: "This spell's own reuse timer, seconds", startDesc: false },
  { label: "Range", column: "range", title: "How far away it reaches", startDesc: false },
  {
    label: "Damage",
    column: "damage",
    title: "Best-effort, read from the wiki's own text — approximate, for ranking only",
    startDesc: true,
  },
  {
    label: "Mana/dmg",
    column: "manaPerDamage",
    title: "Mana spent per point of damage — lower is more efficient. Same caveat as Damage.",
    startDesc: false,
  },
];

/** The spell catalogue, as a sortable table. Holds no state: the sort lives with the panel. */
export default function SpellCatalogTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly SpellRow[];
  sort: Sort<SpellSortKey>;
  onSort: (next: Sort<SpellSortKey>) => void;
}) {
  return (
    <table className="stat-table spell-catalog-table">
      <thead>
        <tr>
          {COLUMNS.map((col) => (
            <SortHeader
              key={col.column}
              label={col.label}
              column={col.column}
              sort={sort}
              onSort={onSort}
              startDesc={col.startDesc}
              className={col.column === "name" ? undefined : "num"}
              title={col.title}
            />
          ))}
          <th>Classes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <SpellRowView key={row.spell.title} row={row} />
        ))}
      </tbody>
    </table>
  );
}

/** One result. `memo`'d for the same reason `ItemTable`'s row is: nothing here changes per render. */
const SpellRowView = memo(function SpellRowView({ row }: { row: SpellRow }) {
  const { stats } = row;
  const classes = Object.entries(stats.levels)
    .sort(([, a], [, b]) => (a ?? 0) - (b ?? 0))
    .map(([cls, level]) => `${cls} ${level}`)
    .join(", ");

  return (
    <tr>
      <td>
        <ItemLink title={row.spell.title} />
      </td>
      <td className="num">{minLevel(stats.levels) ?? "—"}</td>
      <td className={`num ${stats.mana !== undefined ? "num-accent" : "muted"}`}>{stats.mana ?? "—"}</td>
      <td className="num">{stats.castSec !== undefined ? `${stats.castSec}s` : "—"}</td>
      <td className="num">{stats.recastSec ? `${stats.recastSec}s` : "—"}</td>
      <td className="num">{stats.range ?? "—"}</td>
      <td className={`num ${stats.damage !== undefined ? "num-accent" : "muted"}`}>{stats.damage ?? "—"}</td>
      <td className="num">{manaPerDamage(stats) ?? "—"}</td>
      <td className="muted small" title={classes || undefined}>
        {classes || "—"}
      </td>
    </tr>
  );
});
