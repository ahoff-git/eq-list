"use client";
import ItemLink from "@/app/components/items/ItemLink";
import { WORN_LAYOUT, type BisPick } from "@/shared/items/bis";
import { slotLabel, type BisHunt, type BisPlan, type BisSlotChoice } from "@/shared/items/bis-plan";
import { toggleTitle, withLock, type BisOptions, type BisSlotLock } from "@/shared/items/bis-options";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { wikiName } from "@/shared/shown-name";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** What the slot's picker is set to: the solver's choice, held empty, or one title. */
const SOLVER = "";
const EMPTY = "\u0000empty";

/** One row per worn slot, filled or not — an empty one says why, and what would fill it. */
interface SlotRow {
  slotIndex: number;
  slot: string;
  pick?: BisPick;
  why?: string;
  hunt?: BisHunt;
  lock?: BisSlotLock;
  /** The wanted effect this slot's item is held for. */
  pinnedFor?: string;
  stale?: string;
  choices: BisSlotChoice[];
}

/**
 * Every slot in the layout, in order. An empty slot is one nothing you hold (that your criteria let
 * you wear) is worth putting in, the off-hand a two-hander took, or one you've held empty. It carries
 * the best hunt target for that slot, when the criteria leave one.
 */
function slotRows(plan: BisPlan, options: BisOptions): SlotRow[] {
  const bySlot = new Map(plan.loadout.picks.map((p) => [p.slotIndex, p]));
  const twoHander = plan.loadout.picks.find((p) => p.slot === "PRIMARY" && p.item.twoHanded);
  const stale = new Map(plan.staleLocks.map((s) => [s.slotIndex, s.title]));
  return WORN_LAYOUT.map((slot, slotIndex) => {
    const base = {
      slotIndex,
      slot,
      lock: options.locks[slotIndex],
      pinnedFor: plan.pinned[slotIndex],
      stale: stale.get(slotIndex),
      choices: plan.alternatives[slotIndex] ?? [],
    };
    const pick = bySlot.get(slotIndex);
    if (pick) return { ...base, pick };
    if (slot === "SECONDARY" && twoHander) return { ...base, why: `taken by ${twoHander.item.title}` };
    if (base.lock && "empty" in base.lock) return { ...base, why: "held empty" };
    return { ...base, why: "nothing you hold fits", hunt: plan.hunt.find((h) => h.slot === slot) };
  });
}

/**
 * The Wear table: the loadout slot by slot, and the controls that tell the solver what *you* want —
 * lock a slot to what's in it (🔒), pick something else from what you hold, hold it empty, or bench
 * an item so it's never worn. Everything is by title, so it survives the next dump (`bis-options.ts`).
 */
export default function BisWearTable({
  plan,
  options,
  onOptions,
}: {
  plan: BisPlan;
  options: BisOptions;
  onOptions: (next: BisOptions) => void;
}) {
  const rows = slotRows(plan, options);
  const setLock = (slotIndex: number, lock: BisSlotLock | undefined) => onOptions(withLock(options, slotIndex, lock));
  const choose = (slotIndex: number, value: string) =>
    setLock(slotIndex, value === SOLVER ? undefined : value === EMPTY ? { empty: true } : { title: value });

  return (
    <table className="dump-table bis-wear">
      <tbody>
        {rows.map((r) => {
          const locked = !!r.lock;
          const chosen = !r.lock ? SOLVER : "empty" in r.lock ? EMPTY : r.lock.title;
          // One option per title, its best copy — a lock takes the best copy that fits anyway.
          const best = r.choices.filter((c, i) => r.choices.findIndex((o) => o.title === c.title) === i);
          const moved = r.pick && !r.pick.item.heldAt?.startsWith("Worn");
          return (
            <tr key={r.slotIndex} className={r.pick ? (moved ? "bis-move" : "") : "bis-empty"}>
              <td className="bis-lock-cell">
                <button
                  className={`btn ghost sm bis-lock${locked ? " on" : ""}`}
                  aria-pressed={locked}
                  title={
                    locked
                      ? "Locked — the solver works around this slot. Click to let it choose again."
                      : r.pick
                        ? `Lock ${r.pick.item.title} here, and solve the rest around it`
                        : "Hold this slot empty"
                  }
                  onClick={() => setLock(r.slotIndex, locked ? undefined : r.pick ? { title: r.pick.item.title } : { empty: true })}
                >
                  {locked ? "🔒" : "🔓"}
                </button>
              </td>
              <td className="muted">{slotLabel(r.slot)}</td>
              <td>
                {r.pick ? (
                  <>
                    {/* By the graded name, so the hover shows this copy's numbers — the ones it was weighed by. */}
                    <ItemLink title={gradedTitle(r.pick.item.title, r.pick.item.grade)} />
                    {r.pinnedFor && (
                      <span className="bis-tag" title="Held here for an effect you asked for">
                        {r.pinnedFor}
                      </span>
                    )}
                  </>
                ) : (
                  <i className="muted">{r.why}</i>
                )}
                {r.stale && (
                  <div className="small warn" title="Locks are by name; the newest dump has no copy of it that fits here">
                    locked to {r.stale}, which you no longer hold here — solved without it
                  </div>
                )}
              </td>
              <td className="num">{r.pick ? r.pick.value : <span className="muted">—</span>}</td>
              <td className="small">
                {r.pick ? (
                  moved ? <>from {r.pick.item.heldAt}</> : <span className="muted">{r.pick.item.heldAt}</span>
                ) : r.hunt ? (
                  <>
                    hunt <ItemLink title={wikiName(r.hunt.item.title)} /> <span className="good">{signed(r.hunt.gain)}</span>
                  </>
                ) : r.why === "nothing you hold fits" ? (
                  <span className="muted">nothing in the catalogue matches your criteria either</span>
                ) : null}
              </td>
              <td className="bis-actions">
                {/* What else you hold that fits — choosing one locks it in. */}
                <select
                  className="select-sm"
                  value={chosen}
                  onChange={(e) => choose(r.slotIndex, e.target.value)}
                  title="Choose what goes here yourself"
                >
                  <option value={SOLVER}>best (solver)</option>
                  <option value={EMPTY}>keep empty</option>
                  {r.lock && "title" in r.lock && !best.some((c) => c.title === chosen) && <option value={chosen}>{chosen}</option>}
                  {best.map((c) => (
                    <option key={c.title} value={c.title}>
                      {gradedTitle(c.title, c.grade)} · {c.value}
                      {c.heldAt ? ` · ${c.heldAt}` : ""}
                    </option>
                  ))}
                </select>
                {r.pick ? (
                  <button
                    className="btn ghost sm"
                    title={`Bench ${r.pick.item.title}: never wear it, wherever it would go`}
                    onClick={() => onOptions({ ...withLock(options, r.slotIndex, undefined), benched: toggleTitle(options.benched, r.pick!.item.title) })}
                  >
                    ⊘
                  </button>
                ) : (
                  // Holds the column's width, so an empty slot's picker lines up with the rest.
                  <button className="btn ghost sm" style={{ visibility: "hidden" }} tabIndex={-1} aria-hidden>
                    ⊘
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
