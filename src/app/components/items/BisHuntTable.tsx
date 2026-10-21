"use client";
import { useMemo, useState } from "react";
import ItemLink from "@/app/components/items/ItemLink";
import { AddButton, PickField } from "@/app/components/ui";
import { addByTitle } from "@/lib/items/addToList";
import { useShoppingList } from "@/lib/hooks";
import { normalizeItemName } from "@/shared/items/grouping";
import { slotLabel, type BisHunt } from "@/shared/items/bis-plan";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { wikiName } from "@/shared/shown-name";

/** How many hunt targets to draw. Ranked, so these are the biggest gains. */
const MAX_HUNT = 60;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * The Hunt table: what to go and get, by what it would add over what it replaces — at `+0`, and at
 * the grades more copies would buy. Each row goes straight onto the shopping list (+), or out of the
 * suggestions for good (✕, kept in the options so it stays gone across dumps). A row already on the
 * list says so, so a second evening's look doesn't re-add the first one's farm.
 */
export default function BisHuntTable({ hunt, onSkip }: { hunt: readonly BisHunt[]; onSkip: (title: string) => void }) {
  const [slot, setSlot] = useState("");
  const list = useShoppingList();
  const onList = useMemo(() => new Set(list.entries.map((e) => normalizeItemName(e.name))), [list.entries]);
  const slots = useMemo(() => [...new Set(hunt.map((h) => h.slot))].map((s) => ({ value: s, label: slotLabel(s) })), [hunt]);
  const filtered = slot ? hunt.filter((h) => h.slot === slot) : hunt;
  const shown = filtered.slice(0, MAX_HUNT);
  const notListed = shown.filter((h) => !onList.has(normalizeItemName(h.item.title)));

  return (
    <>
      <div className="row wrap">
        <PickField value={slot} onChange={setSlot} blank="every slot" options={slots} title="Only hunts for one slot" />
        {notListed.length > 1 && (
          <AddButton
            className="btn sm"
            title="Put the best hunt for each slot on the shopping list — one per slot, since two for the same slot each assume the other wasn't got"
            onAdd={() => {
              const firstPerSlot = notListed.filter((h, i) => notListed.findIndex((o) => o.slot === h.slot) === i);
              void (async () => {
                for (const h of firstPerSlot) await addByTitle(h.item.title, h.row.item.wikiPath);
              })();
            }}
          >
            + Add the best per slot
          </AddButton>
        )}
      </div>
      <table className="dump-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Slot</th>
            <th className="num">+0</th>
            <th className="num" title="2 copies">+1</th>
            <th className="num" title="4 copies">+2</th>
            <th className="num" title="8 copies">+3</th>
            <th>Replaces</th>
            <th className="num">Level</th>
            <th>From</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((h) => {
            const listed = onList.has(normalizeItemName(h.item.title));
            return (
              <tr key={h.item.id}>
                <td>
                  <ItemLink title={wikiName(h.item.title)} />
                </td>
                <td className="muted">{slotLabel(h.slot)}</td>
                <td className="num good">{signed(h.gain)}</td>
                {h.atGrades.map((g) => (
                  <td key={g.grade} className="num muted" title={`${g.copies} copies merged`}>
                    {signed(g.gain)}
                  </td>
                ))}
                <td className="small muted">{h.replaces ? gradedTitle(h.replaces.item.title, h.replaces.item.grade) : "empty slot"}</td>
                <td className="num muted" title={h.row.level?.why}>
                  {h.row.level ? (h.row.level.min === h.row.level.max ? h.row.level.min : `${h.row.level.min}–${h.row.level.max}`) : "—"}
                </td>
                <td className="small muted">{h.row.zones[0] ?? h.row.kinds.join(", ")}</td>
                <td className="bis-actions">
                  <AddButton
                    className={`btn sm${listed ? " ghost" : ""}`}
                    title={listed ? "Already on the shopping list — add another" : "Put it on the shopping list"}
                    onAdd={() => void addByTitle(h.item.title, h.row.item.wikiPath)}
                  >
                    {listed ? "✓ listed" : "+ Add"}
                  </AddButton>
                  <button className="btn ghost sm" title="Never suggest this — undo from Your choices above" onClick={() => onSkip(h.item.title)}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length > MAX_HUNT && <p className="muted small">The first {MAX_HUNT} of {filtered.length}; narrow the criteria for the rest.</p>}
    </>
  );
}
