"use client";
import { useMemo, type ReactNode } from "react";
import { useInventory } from "@/lib/exports/useGameExports";
import { useNav } from "@/lib/chrome/nav";
import { inventoryTotals } from "@/shared/game-export-dumps";
import { findAcross, type Matches } from "@/shared/find/find-across";
import { gradedTitle } from "@/shared/items/item-upgrade";
import ItemLink from "@/app/components/items/ItemLink";

/**
 * The rest of Search's one box: what you hold, stances and invocations, and AAs that match what was
 * typed, under the wiki's results ([ADR 0321](../../../../specs/decisions/0321-find-answers-from-one-box.md)).
 * A stance or AA has no page, so its row *is* the answer — its effect, inline. Each group's heading
 * opens the section that holds the whole list.
 */
export default function FindAcross({ term }: { term: string }) {
  const { items } = useInventory();
  const held = useMemo(() => (items ? inventoryTotals(items) : null), [items]);
  const m = useMemo(() => findAcross(term, held), [term, held]);

  return (
    <>
      <Group title="In your inventory" section="exports" matches={m.held}>
        {(t) => (
          <div className="result" key={t.baseName}>
            <ItemLink title={gradedTitle(t.baseName, t.bestGrade)} className="name" />
            <span className="muted small">
              ×{t.count}
              {t.places.length ? ` · ${t.places.map((p) => p.label).join(", ")}` : ""}
            </span>
          </div>
        )}
      </Group>
      <Group title="Stances & invocations" section="stances" matches={m.abilities}>
        {(a) => (
          <div className="result across" key={`${a.kind}|${a.name}`}>
            <span className="name">
              <b>{a.name}</b> <span className="muted small">{a.kind}</span>
            </span>
            <span className="small">{a.description}</span>
          </div>
        )}
      </Group>
      <Group title="AAs" section="aa" matches={m.aas}>
        {(aa) => (
          <div className="result across" key={aa.name}>
            <span className="name">
              <b>{aa.name}</b> <span className="muted small">{`${aa.ranks} ranks · ${aa.cost}`}</span>
            </span>
            <span className="small">{aa.description}</span>
          </div>
        )}
      </Group>
    </>
  );
}

function Group<T>({ title, section, matches, children }: { title: string; section: string; matches: Matches<T>; children: (row: T) => ReactNode }) {
  const nav = useNav();
  if (!matches.total) return null;
  const more = matches.total - matches.shown.length;
  return (
    <>
      <h4 className="muted small across-head">
        <span className="link" title="Open the section with the whole list" onClick={() => nav.openTab(section)}>
          {title} ›
        </span>
        {more > 0 && <span> · {more} more there</span>}
      </h4>
      <div className="results">{matches.shown.map(children)}</div>
    </>
  );
}
