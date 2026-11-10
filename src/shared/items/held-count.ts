/**
 * held-count.ts — how many of a thing you hold *now*, worked out from your last inventory dump and
 * what the loot ledger has seen move since (ADR 0382). The shopping list's "you already have this".
 *
 * The rule is EQBuddy's `SinceDump`, adapted to what this app's ledger actually records:
 *
 *     held = (copies in the dump) + (looted since) − (known to have left since), never below 0
 *
 *  - **The dump** is every area it lists — worn, bags, bank, depot, hoard, storage (`inventoryTotals`,
 *    the same totals every other "how many have I got" reads). Grades fold: `Gnoll Fang +2` is a Gnoll Fang.
 *  - **Looted since** is a drop that reached a place the dump counts: `kept` (your bags) and `stored` in
 *    the tradeskill depot or the Dragon's Hoard. A drop is "since" only when it is *strictly after* the
 *    dump's second — the log stamps whole seconds, and one at the dump's own second is taken to be in it
 *    already, so a drop is never counted twice (under-counting is the safe way to be wrong, ADR 0033).
 *  - **A carried section is dated by itself.** A dump taken away from the depot window has no depot rows;
 *    the app carries the last depot it saw forward (`carryForward`), so a drop stored in the depot counts
 *    from *that* date, not the dump's.
 *  - **An auto-sell is not a loss.** `You looted X and sold it` is one line: X was vendored as it was picked
 *    up and never sat in a bag, so it adds nothing and takes nothing. It is counted separately only so the
 *    explanation can say where the missing ones went.
 *  - **Things the ledger can't place make the answer unknown, not a guess**: a loot-and-combine (it consumed
 *    an unknown number of copies to make a higher grade) and a drop stored somewhere the dump doesn't list
 *    (the currency tab).
 *  - **What leaves a bag** — a destroy, a hand-sell, a hand-in — is a `gone` row. The app doesn't record
 *    those yet (specs/todo.md), so no source feeds them today; the rule is here so that one that does
 *    can't make the count go negative: it floors at 0 and says the dump is out of date.
 *
 * The result always carries *how* it was reached (`describeHeld`), because a dump goes stale and a wrong
 * tick is worse than none: the player must be able to see the sum, and override it
 * (`ShoppingListEntry.countedByHand`).
 *
 * Pure: names, a dump and ledger rows in; counts out. Time is the caller's (`now`, `formatAt`).
 */
import { inventoryTotals, type InventoryArea, type InventoryItem } from "../game-export-dumps";
import { exportAgeText, exportCommandFor, exportStaleness, NUDGE_STALENESS } from "../game-exports";
import { logStamp } from "../log-clock";
import type { LootRecord, ShoppingListEntry } from "../types";
import { effectiveNeeded, isMobEntry, normalizeItemName, runsFor } from "./grouping";

/** What the ledger saw, or is told, happen to an item: a ledger row, or `gone` for a copy that left. */
export type Movement = Pick<LootRecord, "at" | "item" | "qty" | "detail"> & {
  fate: LootRecord["fate"] | "gone";
};

/** The newest inventory dump, as the count reads it. */
export interface DumpBaseline {
  /** When the game wrote it, ms. */
  writtenAt: number;
  /** Every row it holds, carried sections included (`InventoryItem.asOf`). */
  items: readonly InventoryItem[];
  /** Sections carried forward from an older dump, and when that was — each is counted from its own date. */
  carried?: readonly { area: string; at: number }[];
}

/** How many you hold, and the sum that says so. */
export interface HeldCounted {
  kind: "counted";
  /** `inDump + looted − gone`, floored at 0. */
  held: number;
  /** Copies in the dump, every area. */
  inDump: number;
  /** Copies the ledger saw reach your bags, depot or hoard since the dump. */
  looted: number;
  /** Copies known to have left since (none are recorded yet — see the module doc). */
  gone: number;
  /** Copies looted and auto-sold in one breath: never held, so not in the sum. */
  autoSold: number;
  /** More left than the dump and the loot account for: the dump is out of date, and `held` is floored. */
  overdrawn: boolean;
  /** When the dump was written, ms. */
  at: number;
  /** The oldest date a carried section is from, when one counted from an earlier date than the dump. */
  carriedFrom?: number;
  /**
   * A section copies were stored in since the dump, though the dump has no rows for it at all (and none
   * were ever carried) — so what was already in it is missing from the sum. Told, not hidden: the count
   * can only be low.
   */
  missingArea?: "depot" | "hoard";
}

/** Why there is no count — said to the player in place of one. */
export interface HeldUnknown {
  kind: "unknown";
  why: string;
}

export type HeldCount = HeldCounted | HeldUnknown;

/** Where a `stored` drop's detail puts it, as far as the dump goes: the two sections a dump lists. */
function storedArea(detail: string | undefined): "depot" | "hoard" | undefined {
  const d = (detail ?? "").toLowerCase();
  if (d.includes("depot")) return "depot";
  if (d.includes("hoard")) return "hoard";
  return undefined;
}

/** The time a carried section is from — `undefined` for one the newest dump holds itself. */
function carriedAt(dump: DumpBaseline, area: InventoryArea): number | undefined {
  return dump.carried?.find((c) => c.area === area)?.at;
}

/**
 * The oldest moment any part of the dump is from — the earliest a ledger row could matter. What the
 * ledger is asked for, so the question reaches back as far as the stalest carried section and no further.
 */
export function dumpOldestAt(dump: Pick<DumpBaseline, "writtenAt" | "carried">): number {
  return Math.min(dump.writtenAt, ...(dump.carried ?? []).map((c) => c.at));
}

/** An instant as the ledger stamps its rows, for asking it for what came after. */
export const sinceStamp = (dump: Pick<DumpBaseline, "writtenAt" | "carried">): string => logStamp(dumpOldestAt(dump));

interface Tally {
  looted: number;
  gone: number;
  autoSold: number;
  missingArea?: "depot" | "hoard";
  /** A drop was counted from a carried section's date, not the dump's. */
  carriedStored?: boolean;
  /** A reason this item can't be counted, once a row says so. */
  unknown?: string;
}

/**
 * How many of each named item you hold. Keyed by `normalizeItemName`, so the list's spelling, the
 * dump's and the ledger's all meet. A name with nothing to say about it is *held, 0* — the dump
 * lists everything you own, so absence from it is an answer.
 */
export function heldCounts(
  names: readonly string[],
  dump: DumpBaseline,
  moves: readonly Movement[],
): Map<string, HeldCount> {
  const wanted = new Set(names.map(normalizeItemName).filter(Boolean));
  const inDump = new Map(inventoryTotals(dump.items).map((t) => [normalizeItemName(t.baseName), t.count]));

  // A row is "since" a section only when it is strictly after that section's own second.
  const bags = logStamp(dump.writtenAt);
  const depot = logStamp(carriedAt(dump, "depot") ?? dump.writtenAt);
  const hoard = logStamp(carriedAt(dump, "hoard") ?? dump.writtenAt);

  const tallies = new Map<string, Tally>();
  for (const row of moves) {
    const key = normalizeItemName(row.item);
    if (!wanted.has(key)) continue;
    const tally = tallies.get(key) ?? { looted: 0, gone: 0, autoSold: 0 };
    tallies.set(key, tally);
    const qty = Math.max(1, row.qty);

    if (row.fate === "stored") {
      const area = storedArea(row.detail);
      if (!area) {
        // Stamped against the bags' date: that is the one a place we can't name is compared with.
        if (row.at > bags) tally.unknown ??= `it was stored in your ${row.detail ?? "storage"}, which the inventory dump doesn't list`;
        continue;
      }
      if (row.at > (area === "depot" ? depot : hoard)) {
        tally.looted += qty;
        if (carriedAt(dump, area) !== undefined) tally.carriedStored = true;
        if (!dump.items.some((i) => i.area === area)) tally.missingArea = area;
      }
      continue;
    }
    if (row.at <= bags) continue;
    if (row.fate === "kept") tally.looted += qty;
    else if (row.fate === "sold") tally.autoSold += qty;
    else if (row.fate === "gone") tally.gone += qty;
    else if (row.fate === "combined") tally.unknown ??= "an upgrade combine since the dump used up copies the log doesn't count — retake /outputfile inventory to count it";
  }

  const oldest = dumpOldestAt(dump);
  // Only an item with a copy in a carried section leans on its date; for the rest it is noise in the sum.
  const leansOnCarried = new Set(dump.items.filter((i) => i.asOf !== undefined).map((i) => normalizeItemName(i.baseName)));
  const out = new Map<string, HeldCount>();
  for (const key of wanted) {
    const t = tallies.get(key) ?? { looted: 0, gone: 0, autoSold: 0 };
    if (t.unknown) {
      out.set(key, { kind: "unknown", why: t.unknown });
      continue;
    }
    const base = inDump.get(key) ?? 0;
    const raw = base + t.looted - t.gone;
    out.set(key, {
      kind: "counted",
      held: Math.max(0, raw),
      inDump: base,
      looted: t.looted,
      gone: t.gone,
      autoSold: t.autoSold,
      overdrawn: raw < 0,
      at: dump.writtenAt,
      ...(t.missingArea ? { missingArea: t.missingArea } : {}),
      ...(oldest < dump.writtenAt && (leansOnCarried.has(key) || t.carriedStored) ? { carriedFrom: oldest } : {}),
    });
  }
  return out;
}

/** What the explanation needs from the outside: the clock, and how to write an instant for this reader. */
export interface DescribeOptions {
  now: number;
  /** An instant as a reader would say it (`Nov 8, 12:05 AM`) — locale-dependent, so it is the caller's. */
  formatAt: (ms: number) => string;
}

/** Whether a dump is old enough to be worth a warning — the same line the status bar's nudge draws (`NUDGE_STALENESS`). */
export function dumpIsStale(at: number, now: number): boolean {
  const cmd = exportCommandFor("inventory");
  const staleness = cmd ? exportStaleness(cmd, at, now) : null;
  return staleness !== null && staleness >= NUDGE_STALENESS;
}

/**
 * The sum behind a count, in words: `12 in your inventory dump (Nov 8, 12:05 AM) + 3 looted since = 15`.
 * Says what was left out (auto-sold, a stale carried section) and when the dump is old enough to doubt.
 */
export function describeHeld(held: HeldCount, { now, formatAt }: DescribeOptions): string {
  if (held.kind === "unknown") return `Can't count this from your inventory: ${held.why}.`;
  const parts = [`${held.inDump} in your inventory dump (${formatAt(held.at)})`];
  if (held.looted) parts.push(`+ ${held.looted} looted since`);
  if (held.gone) parts.push(`− ${held.gone} gone since`);
  const lines = [`${parts.join(" ")} = ${held.held}`];
  if (held.autoSold) lines.push(`${held.autoSold} more were auto-sold as they dropped, so were never in your bags.`);
  if (held.overdrawn) lines.push("More left than the dump and the loot account for — the dump is out of date, so this is floored at 0.");
  if (held.missingArea) lines.push(`That dump has no ${held.missingArea} rows, so copies already in your ${held.missingArea} aren't counted — open its window, then type /outputfile inventory.`);
  if (held.carriedFrom !== undefined) lines.push(`Part of your storage (depot, bank or hoard) wasn't in that dump and is carried from an older one, taken ${formatAt(held.carriedFrom)}.`);
  if (dumpIsStale(held.at, now)) lines.push(`That dump was taken ${exportAgeText(now - held.at)} — type /outputfile inventory in the game to refresh it.`);
  return lines.join("\n");
}

// ─── Against the list ───────────────────────────────────────────────────────

/** Where a row's count came from: the inventory, the list's own tally (loot since it was added), or the player's typed figure. */
export type CountSource = "inventory" | "list" | "hand";

export interface EntryCount {
  /** The figure the row counts toward what it needs. */
  have: number;
  source: CountSource;
  /** What the dump said, when it said anything — shown even when it wasn't the figure used. */
  held?: HeldCount;
  /**
   * Set when other rows want the same item, so what you hold was handed out between them rather than
   * given whole to each (ADR 0387): how many rows want it. `have` is then this row's share.
   */
  shared?: { rows: number };
}

/**
 * Which figure a row counts. The player's typed one always (`countedByHand`); otherwise the **larger**
 * of the list's own tally and the inventory's — so switching this on can only ever raise a count a list
 * already showed, never un-tick a row (a quest turn-in that used the items up has still been got).
 */
export function countEntry(entry: ShoppingListEntry, held?: HeldCount): EntryCount {
  if (entry.countedByHand) return { have: entry.obtained, source: "hand", held };
  // Equal counts as the inventory's: the two agree, and the row should say what it can show the sum of.
  if (held?.kind === "counted" && held.held > 0 && held.held >= entry.obtained) return { have: held.held, source: "inventory", held };
  return { have: entry.obtained, source: "list", held };
}

/** One row's stake in an item, as the sharing reads it. */
interface Claim {
  id: string;
  /** What the row needs, runs applied. */
  need: number;
  /** What the row already counts for itself: the list's own tally, or the typed figure. */
  obtained: number;
  /** A typed figure: the player's word for this row, so it takes from the pool but is never topped up from it. */
  byHand: boolean;
}

/**
 * How much of what you hold each of the rows wanting one item can add to its own count, by row id.
 *
 * What you hold is **one** pile, however many rows want it: holding 5 Bone Chips against 3 for one quest, 5 for a
 * recipe and 2 for another is 5 of the 10 needed, not 5 of each. So the rows' own counts are taken out of the
 * pile first (they are the chips they already have, looted or typed), and what is left is handed out in list
 * order, each row up to what it still lacks; a pile bigger than every need goes to the first row, as one row
 * has always shown what you hold. With one row this is exactly "the larger of its tally and the pile".
 *
 * Conservative where it has to guess: a tally for chips since handed in still counts against the pile, so a
 * later row can be shown short — a wrong tick is worse than a missing one, and typing a figure fixes it.
 */
export function shareHeld(claims: readonly Claim[], pool: number): Map<string, number> {
  const extra = new Map(claims.map((c) => [c.id, 0]));
  let left = Math.max(0, pool - claims.reduce((sum, c) => sum + c.obtained, 0));
  const open = claims.filter((c) => !c.byHand);
  for (const c of open) {
    const add = Math.min(Math.max(0, c.need - c.obtained), left);
    extra.set(c.id, add);
    left -= add;
  }
  if (open.length && left > 0) extra.set(open[0].id, (extra.get(open[0].id) ?? 0) + left);
  return extra;
}

/**
 * The list with each item's `obtained` replaced by the figure it counts, so everything downstream of it
 * (`satisfied`, a group's tally and order, the hunt list) sees one number rather than each learning the
 * rule. A mob has no count and is left as it is.
 *
 * Rows that want the **same item** share what you hold (`shareHeld`) — the same item under three quests is
 * one pile of chips, not three. `questRuns` is the list's, so a row that runs twice is asked for twice.
 */
export function countedEntries(
  entries: readonly ShoppingListEntry[],
  heldByName: ReadonlyMap<string, HeldCount>,
  questRuns: Record<string, number> = {},
): { entries: ShoppingListEntry[]; counts: Map<string, EntryCount> } {
  const rowsByItem = new Map<string, ShoppingListEntry[]>();
  for (const e of entries) {
    if (isMobEntry(e)) continue;
    const key = normalizeItemName(e.name);
    rowsByItem.set(key, [...(rowsByItem.get(key) ?? []), e]);
  }

  const counts = new Map<string, EntryCount>();
  for (const [key, rows] of rowsByItem) {
    const held = heldByName.get(key);
    const pile = held?.kind === "counted" ? held.held : 0;
    if (rows.length < 2 || pile <= 0) {
      for (const e of rows) counts.set(e.id, countEntry(e, held));
      continue;
    }
    const claims = rows.map((e) => ({
      id: e.id,
      need: effectiveNeeded(e, runsFor({ questRuns }, e)),
      obtained: e.obtained,
      byHand: !!e.countedByHand,
    }));
    const extra = shareHeld(claims, pile);
    for (const e of rows) {
      const add = extra.get(e.id) ?? 0;
      const source: CountSource = e.countedByHand ? "hand" : add > 0 ? "inventory" : "list";
      counts.set(e.id, { have: e.obtained + add, source, held, shared: { rows: rows.length } });
    }
  }

  const counted = entries.map((e) => {
    const count = counts.get(e.id);
    if (!count) return e;
    return count.have === e.obtained ? e : { ...e, obtained: count.have };
  });
  return { entries: counted, counts };
}

/** The names a count is asked for: every item entry's, once. */
export function countableNames(entries: readonly ShoppingListEntry[]): string[] {
  return [...new Set(entries.filter((e) => !isMobEntry(e)).map((e) => e.name))];
}
