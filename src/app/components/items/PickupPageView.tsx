"use client";
import { api } from "@/lib/api";
import { useShoppingList } from "@/lib/hooks";
import ItemLink from "@/app/components/items/ItemLink";
import MapLink, { ZoneLink } from "@/app/components/map/MapLink";
import { AddButton } from "@/app/components/ui";
import { addItem } from "@/lib/items/addToList";
import {
  npcsForQuest,
  pickupEntryName,
  pickupLocText,
  pickupsForQuest,
  type QuestPickup,
} from "@/shared/quests/quest-pickups";
import { notAnItem, wikiName } from "@/shared/shown-name";

/**
 * A quest pickup's own page — "Rod (Azia)" — built from the bundled dataset rather than fetched,
 * since no wiki has a page by that name (ADR 0291). It answers the two questions the list can't:
 * **where** to get it (zone and spot, both opening the map, plus the wiki's directions) and **why**
 * (the quest it's turned in for, and the rest of its set).
 */
export default function PickupPageView({ pickup: p }: { pickup: QuestPickup }) {
  const list = useShoppingList();
  const name = pickupEntryName(p);
  const entryFor = (entry: string) =>
    list.entries.find((e) => e.name.toLowerCase() === entry.toLowerCase() && e.origin?.name === p.quest);
  const owned = (e: { obtained: number; needed: number }) => e.obtained >= e.needed;
  const mine = entryFor(name);
  const siblings = pickupsForQuest(p.quest).filter((s) => s !== p);
  const npcs = npcsForQuest(p.quest);

  return (
    <div className="page-detail">
      <div className="row">
        <h3>{name}</h3>
        <span className="badge kind-item">ground pickup</span>
        <span className="spacer" />
        <button className="btn ghost sm" title={`Open “${p.page}” on eqlwiki`} onClick={() => api()?.wiki.openInBrowser(p.page)}>
          ↗ eqlwiki
        </button>
      </div>

      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        {mine ? (
          <span className={`badge ${owned(mine) ? "done" : ""}`}>
            On your list · {owned(mine) ? "✓ obtained" : `${mine.obtained}/${mine.needed}`}
          </span>
        ) : (
          <AddButton
            className="btn sm"
            onAdd={() => addItem({ name, needed: 1, origin: { kind: "quest", name: p.quest } })}
          >
            + Add to list
          </AddButton>
        )}
      </div>

      <h4 style={{ marginTop: 14 }}>Where to get it</h4>
      <ul>
        <li>
          <span className="field-label">Zone</span>
          <ZoneLink zone={p.zone} />
        </li>
        <li>
          <span className="field-label">Location</span>
          {p.loc ? (
            <MapLink target={{ zone: p.zone, loc: p.loc, label: p.label }}>{pickupLocText(p)}</MapLink>
          ) : (
            <span className="muted small">not stated — see the directions below</span>
          )}
        </li>
        <li>
          <span className="field-label">In game</span>
          <span>
            <ItemLink title={wikiName(p.item)} /> <span className="muted small">— lying on the ground, no mob drops it</span>
          </span>
        </li>
      </ul>
      {p.note && <p className="small page-callout">{p.note}</p>}

      <h4 style={{ marginTop: 14 }}>Why you want it</h4>
      <ul>
        <li>
          <span className="field-label">Quest</span>
          <span>
            <ItemLink title={notAnItem(p.quest)} />{" "}
            <span className="muted small">— one of its {siblings.length + 1} turn-ins</span>
          </span>
        </li>
      </ul>

      {npcs.length > 0 && (
        <>
          <h4 style={{ marginTop: 14 }}>Who to see</h4>
          <ul>
            {npcs.map((n) => (
              <li key={n.npc}>
                <ItemLink title={notAnItem(n.npc)} />
                <ZoneLink zone={n.zone} />
                <MapLink target={{ zone: n.zone, loc: n.loc, label: n.npc }}>{pickupLocText(n)}</MapLink>
                {n.steps.length > 0 && <span className="muted small">— {n.steps.join(" ")}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {siblings.length > 0 && (
        <>
          <h4 style={{ marginTop: 14 }}>The rest of the set</h4>
          <ul>
            {siblings.map((s) => {
              const entry = entryFor(pickupEntryName(s));
              const done = !!entry && owned(entry);
              return (
                <li key={s.label}>
                  <span className={done ? "done" : "muted"} title={done ? "Obtained" : "Still needed"}>
                    {done ? "✓" : "○"}
                  </span>
                  <ItemLink title={wikiName(pickupEntryName(s))} />
                  <span className="muted small">{s.zone}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
