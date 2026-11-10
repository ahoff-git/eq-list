"use client";
import { dayTime } from "@/shared/format";
import { exportAgeText } from "@/shared/game-exports";
import { describeHeld, dumpIsStale, type EntryCount } from "@/shared/items/held-count";

/** An instant the way a reader says it — `Nov 8, 12:05 AM`. */
const formatAt = (ms: number) => dayTime(new Date(ms).toISOString());

/**
 * What the inventory says about a list row, beside the figure the row counts — so a count that came from
 * a dump is never a number out of nowhere. Hover for the sum (`12 in your inventory dump + 3 looted since`);
 * the button, when the row is on a typed figure, goes back to the inventory's figure.
 *
 * Says nothing for an item you neither hold nor typed a figure for: most of a long list, and the row's own
 * "0 of 4" already says it.
 */
export function HeldNote({
  count,
  need,
  now,
  onUseInventory,
}: {
  count: EntryCount;
  /** What the row needs, runs applied — for "need N more". */
  need: number;
  /** The clock the dump's age is measured against. */
  now: number;
  /** Given what the inventory says, to take as the row's figure. */
  onUseInventory: (held: number) => void;
}) {
  const { held } = count;
  if (!held) return null;
  const text = describeHeld(held, { now, formatAt });
  if (held.kind === "unknown") {
    return (
      <span className="held-note unknown" title={text}>
        🎒 ?
      </span>
    );
  }

  const hand = count.source === "hand";
  // A typed figure that agrees with the dump has nothing to override.
  if (held.held === 0 || (hand && held.held === count.have)) return null;

  const short = need - count.have;
  // Several rows want this item: what you hold is one pile, handed out in list order, so a row says its part
  // of it ("3 of your 5") rather than the whole pile it can't claim (ADR 0387).
  const sharedWith = !hand && count.shared ? count.shared.rows - 1 : 0;
  const label = sharedWith
    ? `🎒 ${count.have} of ${held.held} held${short > 0 ? ` · need ${short} more` : ""}`
    : count.source === "inventory"
      ? `🎒 ${held.held} held${short > 0 ? ` · need ${short} more` : ""}`
      : `🎒 dump says ${held.held}`;
  const why = {
    inventory: "",
    list: `\nThis row's own count (${count.have}) is higher, so that is the one used.`,
    hand: `\nYou typed ${count.have}, so the inventory isn't counted for this row.`,
  }[count.source];
  const sharing = sharedWith
    ? `\n${sharedWith === 1 ? "One other row wants" : `${sharedWith} other rows want`} this item too, so the ${held.held} you hold are shared: ` +
      "each row keeps what it already counts and the rest goes to the quest or recipe higher up your list first — drag a group by its ⠿ to change which. Type a figure on a row to override."
    : "";
  return (
    <span className={`held-note ${count.source} ${dumpIsStale(held.at, now) ? "stale" : ""}`.trim()} title={text + why + sharing}>
      {label}
      {hand && (
        <button className="btn ghost sm" title="Count this row from your inventory again" onClick={() => onUseInventory(held.held)}>
          ↺
        </button>
      )}
    </span>
  );
}

/**
 * The list's one line about where the counts come from: the dump they read and how old it is, or what to do
 * to get one. Quiet, because the rows carry the detail — this is only the answer to "why did it tick?".
 */
export function HeldSourceNote({ dump }: { dump: { at: number; now: number } | null }) {
  if (!dump) {
    return (
      <span
        className="held-source muted small"
        title="Type /outputfile inventory in the game, and the list will count what you already hold — plus what you loot after it."
      >
        🎒 no dump yet
      </span>
    );
  }
  const stale = dumpIsStale(dump.at, dump.now);
  return (
    <span
      className={`held-source muted small ${stale ? "stale" : ""}`.trim()}
      title={`Rows count what your inventory dump held (${formatAt(dump.at)}) plus what you looted since.${
        stale ? " It is getting old — type /outputfile inventory in the game to refresh it." : ""
      }`}
    >
      🎒 dump {exportAgeText(dump.now - dump.at)}
    </span>
  );
}
