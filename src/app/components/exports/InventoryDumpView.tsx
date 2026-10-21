"use client";
import { useMemo, useState } from "react";
import SearchField from "@/app/components/SearchField";
import ItemLink from "@/app/components/items/ItemLink";
import { segCls } from "@/app/components/ui";
import { useShoppingList } from "@/lib/hooks";
import { normalizeItemName } from "@/shared/items/grouping";
import {
  CONDITIONAL_AREAS,
  INVENTORY_AREAS,
  inventoryTotals,
  parseInventoryDump,
  type InventoryArea,
  type InventoryItem,
  type InventoryPlace,
} from "@/shared/game-export-dumps";
import { DumpSection, textMatches } from "./DumpParts";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { exportAgeText } from "@/shared/game-exports";
import { socketName } from "@/shared/items/exaltations";
import { heldAsNamed } from "@/shared/shown-name";

type Mode = "place" | "item";

const AREA_LABEL = Object.fromEntries(INVENTORY_AREAS.map((a) => [a.area, a.label])) as Record<InventoryArea, string>;

/** Storage runs to dozens of collected entries nobody is looking for by default. */
const FOLDED_AREAS: ReadonlySet<InventoryArea> = new Set(["storage"]);

/**
 * An inventory dump, two ways: **by place** — each area, bags with what's in them, sockets on the
 * item they're in — or **by item**, every grade and location of a thing added up. Items also on
 * the shopping list are marked, since "do I already have one?" is what the list keeps asking.
 */
export default function InventoryDumpView({ text, carriedItems }: { text: string; carriedItems?: InventoryItem[] }) {
  // Sections this dump left out come carried from the last dump that had them, dated (`asOf`).
  const items = useMemo(() => [...parseInventoryDump(text), ...(carriedItems ?? [])], [text, carriedItems]);
  const [mode, setMode] = useState<Mode>("place");
  const [query, setQuery] = useState("");
  const list = useShoppingList();
  const wanted = useMemo(() => new Set(list.entries.map((e) => normalizeItemName(e.name))), [list.entries]);
  const isWanted = (name: string) => wanted.has(normalizeItemName(name));

  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Find an item…" />
        <div className="segmented">
          <button className={segCls(mode === "place")} onClick={() => setMode("place")}>By place</button>
          <button className={segCls(mode === "item")} onClick={() => setMode("item")}>By item</button>
        </div>
      </div>
      {mode === "place" ? (
        <ByPlace items={items} query={query} isWanted={isWanted} />
      ) : (
        <ByItem items={items} query={query} isWanted={isWanted} />
      )}
    </div>
  );
}

function ByPlace({ items, query, isWanted }: { items: InventoryItem[]; query: string; isWanted: (name: string) => boolean }) {
  const searching = query.trim().length > 0;
  const matches = (i: InventoryItem) => textMatches(query, i.name, ...i.sockets.map((s) => s.name));
  const contents = new Map<string, InventoryItem[]>();
  for (const i of items) if (i.inside) contents.set(i.inside, [...(contents.get(i.inside) ?? []), i]);

  // Storage is one area in the dump but several tabs in the game, so each tab gets its own section.
  const groups = INVENTORY_AREAS.flatMap(({ area, label }): { key: string; area: InventoryArea; label: string; members: InventoryItem[] }[] => {
    const inArea = items.filter((i) => i.area === area);
    if (area !== "storage") return [{ key: area, area, label, members: inArea }];
    const tabs = [...new Set(inArea.map((i) => i.slot))];
    return tabs.map((tab) => ({ key: `storage-${tab}`, area, label: `${label}: ${tab}`, members: inArea.filter((i) => i.slot === tab) }));
  });
  const sections = groups
    .map(({ key, area, label, members }) => {
      // A bag stays when it or anything in it matches; loose items when they do.
      const rows = members
        .filter((i) => !i.inside)
        .map((top) => ({ top, inner: (contents.get(top.location) ?? []).filter(matches) }))
        .filter(({ top, inner }) => matches(top) || inner.length > 0);
      const total = members.filter((i) => !i.container).length;
      // A carried section is as of an older dump — say so, since its contents may have moved since.
      const asOf = members.find((i) => i.asOf !== undefined)?.asOf;
      return { key, area, label: asOf === undefined ? label : `${label} — from an older dump (${exportAgeText(Date.now() - asOf)}), may be out of date`, rows, total };
    })
    .filter((s) => s.rows.length > 0);
  const missing = CONDITIONAL_AREAS.filter(({ area }) => !items.some((i) => i.area === area));

  return (
    <>
      {!sections.length && <p className="muted">Nothing here matches “{query}”.</p>}
      {sections.map(({ key, area, label, rows, total }) => (
        <DumpSection key={key} title={label} aside={`${total}`} defaultOpen={!FOLDED_AREAS.has(area)} forceOpen={searching}>
          <ul className="inv-list">
            {/* Not keyed by location alone: worn slots repeat (`Ear`, `Fingers`, `Any Slot`) and every
                Storage entry in a tab shares one, and duplicate keys drop or repeat rows on a re-filter. */}
            {rows.map(({ top, inner }, n) => (
              <li key={`${top.location}#${n}`}>
                <InventoryRow item={top} isWanted={isWanted} showSlot={area === "worn"} />
                {inner.length > 0 && (
                  <ul className="inv-list inv-inner">
                    {inner.map((i) => (
                      <li key={i.location}>
                        <InventoryRow item={i} isWanted={isWanted} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </DumpSection>
      ))}
      {items.some((i) => i.area === "storage") && (
        <p className="muted small dump-missing">
          Storage may be missing a few rows (another EQL tool has seen an item skipped by several dumps in a
          row), and its Currencies tab isn&apos;t in the dump at all.
        </p>
      )}
      {missing.map(({ area, window }) => (
        <p key={area} className="muted small dump-missing">
          No {AREA_LABEL[area]} in this dump. The game only includes it while it is open: open {window}, then run{" "}
          <code>/outputfile inventory</code> again.
        </p>
      ))}
    </>
  );
}

function InventoryRow({ item, isWanted, showSlot }: { item: InventoryItem; isWanted: (name: string) => boolean; showSlot?: boolean }) {
  const slot = showSlot && !item.container ? item.slot : null;
  return (
    <span className={`inv-row ${item.container ? "inv-bag" : ""}`}>
      {item.count > 1 && <span className="inv-count">{item.count}×</span>}
      {/* The held name, grade and all: the hover and the page show this copy's stats, not +0's (ADR 0312). */}
      <ItemLink title={heldAsNamed(item.name)} />
      {isWanted(item.name) && <span className="inv-wanted" title="On your shopping list">★</span>}
      {item.sockets.map((s, n) => (
        <span key={n} className="inv-socket" title={`In its ${socketName(s.socket)} socket`}>◆ {s.name}</span>
      ))}
      {slot && <span className="inv-slot muted">{slot}</span>}
    </span>
  );
}

/** `Bank 3, 14 (5)` — the place, its slots, and how many are there when the total is split. */
function placeText(place: InventoryPlace, split: boolean): string {
  const slots = place.slots.length ? ` ${place.slots.join(", ")}` : "";
  return `${place.label}${slots}${split ? ` (${place.count})` : ""}`;
}

function ByItem({ items, query, isWanted }: { items: InventoryItem[]; query: string; isWanted: (name: string) => boolean }) {
  const totals = useMemo(() => inventoryTotals(items), [items]);
  const shown = totals.filter((t) => textMatches(query, t.baseName));
  if (!shown.length) return <p className="muted">Nothing here matches “{query}”.</p>;
  return (
    <table className="dump-table">
      <tbody>
        {shown.map((t) => (
          <tr key={t.baseName}>
            <td className="num">{t.count}</td>
            <td>
              {/* At the best grade among the copies counted, so the hover card is that copy's. */}
              <ItemLink title={gradedTitle(t.baseName, t.bestGrade)} />
              {isWanted(t.baseName) && <span className="inv-wanted" title="On your shopping list">★</span>}
            </td>
            <td className="muted small">{t.places.map((p) => placeText(p, t.places.length > 1)).join(" · ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
