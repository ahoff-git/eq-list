"use client";
import { useMemo } from "react";
import ItemLink from "@/app/components/items/ItemLink";
import { Empty } from "@/app/components/ui";
import { DumpSection } from "@/app/components/exports/DumpParts";
import { useInventory } from "@/lib/exports/useGameExports";
import { bisPlan, type BisHunt, type BisPlan } from "@/shared/items/bis-plan";
import { WORN_LAYOUT, type BisPick } from "@/shared/items/bis";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { exportAgeText } from "@/shared/game-exports";
import type { SocketPlan } from "@/shared/items/exaltations";
import type { ItemCriteria, ItemRow, StatWeights } from "@/shared/items/item-search";

/** How many hunt targets to draw. Ranked, so these are the biggest gains. */
const MAX_HUNT = 60;

/** A slot in words — the card's uppercase, read as a reader would say it. */
const slotLabel = (slot: string) => (slot === "ANY" ? "Any Slot" : slot.charAt(0) + slot.slice(1).toLowerCase());
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Best in slot: the Items tab's weights and criteria turned on your inventory dump.
 *
 * Three answers, in the order you'd act on them — **wear** (the best loadout from what you already
 * hold, wherever it is, and what that's worth over what you have on), **improve** (merges and
 * exaltation sockets), **hunt** (what to go and get, by how much it would add, and what farming more
 * copies of it would buy). See `bis-plan.ts` for the rules and `bis.ts` for why the loadout is exact.
 */
export default function BisView({
  rows,
  criteria,
  weights,
  closedZones,
  scored,
}: {
  rows: readonly ItemRow[];
  criteria: ItemCriteria;
  weights: StatWeights;
  closedZones?: ReadonlySet<string>;
  /** Whether the weight sheet scores anything — without weights there is nothing to rank by. */
  scored: boolean;
}) {
  const { items, at } = useInventory();
  const plan = useMemo(
    () => (items && scored ? bisPlan({ rows, inventory: items, criteria, weights, closedZones }) : null),
    [items, scored, rows, criteria, weights, closedZones],
  );

  if (!items) {
    return <Empty title="No inventory dump yet." hint="In game, type /outputfile inventory (Exports tab has a copy button) — this works from what you hold." />;
  }
  if (!scored || !plan) {
    return <Empty title="Set some value weights first." hint="Open Value weights above and say what a point of each stat is worth to you — best in slot ranks by your yardstick, not ours." />;
  }

  const classes = criteria.facets.class;
  const slots = slotRows(plan);
  const empty = slots.filter((s) => !s.pick).length;
  const sockets = plan.sockets.filter((s) => s.filled || s.options.length);
  const quietHosts = [...new Set(plan.sockets.filter((s) => !s.filled && !s.options.length).map((s) => s.host))];

  return (
    <div className="bis">
      <p className="muted small">
        By your value weights, for {classes.length ? classes.join(" / ") : <b>any class</b>}
        {classes.length ? "" : " — tick your three classes in Class above so only what you can wear counts"}. From your inventory dump
        {at ? `, written ${exportAgeText(Date.now() - at)}` : ""}.
      </p>

      <div className="bis-summary">
        <span>
          Wearing now <b>{plan.wearing}</b>
        </span>
        <span>→</span>
        <span>
          Best from what you hold <b>{plan.loadout.total}</b>
        </span>
        <span className={plan.loadout.total > plan.wearing ? "good" : "muted"}>{signed(Math.round((plan.loadout.total - plan.wearing) * 100) / 100)}</span>
      </div>
      {plan.unweighed.length > 0 && (
        <p className="muted small">Not weighed — no item page here yet: {plan.unweighed.join(", ")}.</p>
      )}

      <DumpSection title="Wear" aside={empty ? `${slots.length - empty} of ${slots.length} slots filled` : `${slots.length} slots`}>
        <table className="dump-table">
          <tbody>
            {slots.map(({ slotIndex, slot, pick, why, hunt }) =>
              pick ? (
                <tr key={slotIndex} className={pick.item.heldAt?.startsWith("Worn") ? "" : "bis-move"}>
                  <td className="muted">{slotLabel(slot)}</td>
                  <td>
                    {/* By the graded name, so the hover shows this copy's numbers — the ones it was weighed by. */}
                    <ItemLink title={gradedTitle(pick.item.title, pick.item.grade)} />
                  </td>
                  <td className="num">{pick.value}</td>
                  <td className="small">
                    {pick.item.heldAt?.startsWith("Worn") ? <span className="muted">{pick.item.heldAt}</span> : <>from {pick.item.heldAt}</>}
                  </td>
                </tr>
              ) : (
                <tr key={slotIndex} className="bis-empty">
                  <td className="muted">{slotLabel(slot)}</td>
                  <td className="muted">
                    <i>{why}</i>
                  </td>
                  <td className="num muted">—</td>
                  <td className="small">
                    {hunt ? (
                      <>
                        hunt <ItemLink title={hunt.item.title} /> <span className="good">{signed(hunt.gain)}</span>
                      </>
                    ) : (
                      <span className="muted">nothing in the catalogue matches your criteria either</span>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </DumpSection>

      {plan.merges.length > 0 && (
        <DumpSection title="Merge" aside={`${plan.merges.length}`}>
          <ul className="bis-list">
            {plan.merges.map((m) => (
              <li key={m.title}>
                <ItemLink title={gradedTitle(m.title, m.to)} /> — merge your {m.grades.length} copies (+{m.grades.join(", +")}) into one +{m.to}
                {m.toExp > 0 && <span className="muted" title="Exp toward the next grade already raises the bigger stats"> and {m.toExp}/{2 ** m.to} exp toward +{m.to + 1}</span>}
                <span className="good"> {signed(m.gain)}</span>
              </li>
            ))}
          </ul>
        </DumpSection>
      )}

      <DumpSection title="Exaltations" aside={`${sockets.length} sockets`} defaultOpen={sockets.length > 0}>
        <p className="muted small">
          A grade opens one socket of each kind — focus at +1, click at +2, worn at +3, proc at +4. A stone carries one effect,
          never stats, so it isn&apos;t counted in the value above. Effects you&apos;ve picked in the Effects filters come first.
        </p>
        {sockets.map((s, n) => (
          <SocketRow key={n} plan={s} />
        ))}
        {quietHosts.length > 0 && (
          <p className="muted small">Open with nothing you hold that fits: {quietHosts.join(", ")}.</p>
        )}
      </DumpSection>

      <DumpSection title="Hunt" aside={`${plan.hunt.length}`}>
        <p className="muted small">
          What it would add over what it replaces, at +0 — and at +1, +2, +3, which take 2, 4 and 8 copies merged. Narrowed by the
          criteria above, so set the level band to what you can reach.
        </p>
        <HuntTable hunt={plan.hunt.slice(0, MAX_HUNT)} />
        {plan.hunt.length > MAX_HUNT && <p className="muted small">The first {MAX_HUNT} of {plan.hunt.length}; narrow the criteria for the rest.</p>}
      </DumpSection>
    </div>
  );
}

/** One row per worn slot, filled or not — an empty one says why, and what would fill it. */
interface SlotRow {
  slotIndex: number;
  slot: string;
  pick?: BisPick;
  why?: string;
  hunt?: BisHunt;
}

/**
 * Every slot in the layout, in order. An empty slot is one nothing you hold (that your criteria let
 * you wear) is worth putting in — or the off-hand a two-hander took. It carries the best hunt target
 * for that slot, when the criteria leave one.
 */
function slotRows(plan: BisPlan): SlotRow[] {
  const bySlot = new Map(plan.loadout.picks.map((p) => [p.slotIndex, p]));
  const twoHander = plan.loadout.picks.find((p) => p.slot === "PRIMARY" && p.item.twoHanded);
  return WORN_LAYOUT.map((slot, slotIndex) => {
    const pick = bySlot.get(slotIndex);
    if (pick) return { slotIndex, slot, pick };
    if (slot === "SECONDARY" && twoHander) return { slotIndex, slot, why: `taken by ${twoHander.item.title}` };
    return { slotIndex, slot, why: "nothing you hold fits", hunt: plan.hunt.find((h) => h.slot === slot) };
  });
}

function SocketRow({ plan }: { plan: SocketPlan }) {
  return (
    <div className="bis-socket">
      <span>
        <b>{plan.host}</b> <span className="muted">{plan.kind}</span>
      </span>
      {plan.filled ? <span className="small">holds {plan.filled}</span> : <span className="small muted">empty</span>}
      {plan.options.length > 0 && (
        <ul className="bis-list small">
          {plan.options.map((o, i) => (
            <li key={i} title={o.uncertain ? "This stone's item has more than one effect; the dump can't say which it holds" : undefined}>
              {o.effect}
              {o.uncertain ? "?" : ""} <span className="muted">· from {o.from} · {o.where}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HuntTable({ hunt }: { hunt: BisHunt[] }) {
  return (
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
        </tr>
      </thead>
      <tbody>
        {hunt.map((h) => (
          <tr key={h.item.id}>
            <td>
              <ItemLink title={h.item.title} />
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
