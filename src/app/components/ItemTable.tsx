"use client";
import { memo } from "react";
import ItemLink from "./ItemLink";
import SortHeader from "./SortHeader";
import { AddButton } from "./ui";
import { addByTitle } from "@/lib/addToList";
import { sourceKindLabel } from "@/shared/sources";
import { LEVEL_CONFIDENCE, levelText } from "@/shared/item-levels";
import { statLine, statMeta, type StatKey } from "@/shared/item-stats";
import { zonesInFilterOrder, type ItemSortKey, type ValuedItem } from "@/shared/item-search";
import type { Sort } from "@/shared/sorting";

/**
 * The columns every result has, whatever you asked for.
 *
 * A list rather than five near-identical `SortHeader` blocks: they differed only in three strings, so
 * written out they were four lines of noise each and one easy place to leave a column unsortable by
 * forgetting a prop.
 */
const CORE_COLUMNS: { label: string; column: ItemSortKey; title: string; className?: string }[] = [
  { label: "Item", column: "name", title: "The item's name" },
  { label: "Slot", column: "slot", title: "Where it's worn" },
  { label: "From", column: "source", title: "Kill it, buy it, quest it or craft it" },
  { label: "Zone", column: "zone", title: "Where its sources are" },
  {
    label: "Level",
    column: "level",
    title: "What level you need to be — from the mob, the quest, or the zone",
    className: "num",
  },
];

/** The results, as a sortable table. Holds no state: the sort lives with the criteria that made it. */
export default function ItemTable({
  rows,
  columns,
  sort,
  onSort,
  scored,
  pickedZones,
}: {
  rows: readonly ValuedItem[];
  /** The stat columns to show, in card order. */
  columns: StatKey[];
  sort: Sort<ItemSortKey>;
  onSort: (next: Sort<ItemSortKey>) => void;
  /** Whether the weight sheet scores anything — with nothing set, Value says so rather than "0". */
  scored: boolean;
  /** The ticked zones, so the Zone column can lead with one that kept the row. */
  pickedZones: string[];
}) {
  return (
    <table className="stat-table item-table">
      <thead>
        <tr>
          {CORE_COLUMNS.map((col) => (
            <SortHeader
              key={col.column}
              label={col.label}
              column={col.column}
              sort={sort}
              onSort={onSort}
              startDesc={false}
              className={col.className}
              title={col.title}
            />
          ))}
          {columns.map((key) => (
            <SortHeader
              key={key}
              label={statMeta(key).label}
              column={key}
              sort={sort}
              onSort={onSort}
              className="num"
              title={`Sort by ${statMeta(key).label}`}
            />
          ))}
          {/* With no stat column asked for, the card's own numbers fill the gap so the table always
              has something to read. */}
          {!columns.length && <th>Stats</th>}
          <SortHeader
            label="Value"
            column="value"
            sort={sort}
            onSort={onSort}
            className="num"
            title={scored ? "Your weights, applied" : "Set some weights and this becomes the ranking"}
          />
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ItemRowView
            key={`${row.item.origin}:${row.item.title}`}
            row={row}
            columns={columns}
            scored={scored}
            pickedZones={pickedZones}
          />
        ))}
      </tbody>
    </table>
  );
}

/**
 * One result.
 *
 * `memo`'d because three hundred of these re-render whenever *anything* on the panel moves — opening
 * the weight sheet, changing the harvest pace, a progress tick from a run — and none of that changes
 * a row. Its props are all either primitives or values the panel already memoizes, so the comparison
 * actually holds.
 */
const ItemRowView = memo(function ItemRowView({
  row,
  columns,
  scored,
  pickedZones,
}: {
  row: ValuedItem;
  columns: StatKey[];
  scored: boolean;
  pickedZones: string[];
}) {
  const zones = zonesInFilterOrder(row.zones, pickedZones);
  const level = row.level;
  const zoneTitle = zones.length > 1 ? `Drops in ${zones.length} zones: ${zones.join(", ")}` : zones[0];

  return (
    <tr className={row.item.outOfEra ? "out-of-era" : undefined}>
      <td>
        <ItemLink title={row.item.title} />
        {/* Lucy describes a different game, so a row sourced from it never passes as the wiki's. */}
        {row.item.origin === "lucy" && (
          <span className="chip lucy-chip" title="From Lucy — Live EverQuest's database, not this game's">
            Lucy
          </span>
        )}
      </td>
      <td className="muted">{row.stats.slots.join(" ") || "—"}</td>
      <td>
        {row.kinds.length
          ? row.kinds.map((kind) => (
              <span key={kind} className={`src-kind k-${kind}`}>
                {sourceKindLabel(kind)}
              </span>
            ))
          : "—"}
      </td>
      {/* `+N` is "and N other zones" — the count is in the hover, since the column has to stay narrow. */}
      <td className="muted" title={zoneTitle}>
        {zones.length > 1 ? `${zones[0]} +${zones.length - 1}` : (zones[0] ?? "—")}
      </td>
      <td
        className={`num lvl-${level?.from ?? "none"}`}
        title={level ? `${level.why} — ${LEVEL_CONFIDENCE[level.from]}` : "Nothing places this one yet"}
      >
        {level ? levelText(level) : "—"}
      </td>
      {columns.map((key) => (
        <td key={key} className={`num ${row.stats.stats[key] !== undefined ? "num-accent" : "muted"}`}>
          {row.stats.stats[key] ?? "—"}
        </td>
      ))}
      {!columns.length && <td className="muted small">{statLine(row.stats) || "—"}</td>}
      <td className={`num ${scored && row.value ? "num-accent" : "muted"}`}>{scored ? row.value : "—"}</td>
      <td className="item-add">
        <AddButton
          onAdd={() => void addByTitle(row.item.title, row.item.wikiPath)}
          title="Put it on the shopping list"
          className="btn sm"
        >
          + Add
        </AddButton>
      </td>
    </tr>
  );
});
