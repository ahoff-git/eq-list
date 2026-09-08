/**
 * wiki-contribution.ts — turning your own kills into something worth pasting into eqlwiki.
 *
 * [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md) is the whole app pointed one
 * way: the wiki describes an older build, your own kills are this server, this build, now, so the
 * app always prefers the second over the first on screen. Nothing before this let that flow *back*.
 * EQBuddy's `WikiContribution.cs` does — it formats a player's own observations as MediaWiki markup
 * meant to be pasted straight into an edit box — and the gap is real: `drop-truth.ts` already knows
 * exactly which of your drops the wiki has never heard of, and until now that fact lived only on
 * screen.
 *
 * **What this deliberately doesn't try to be.** A real eqlwiki mob page's loot list is a structured
 * `known_loot` parameter with a numbered `.ddb` box per row (`[2] 4x 55% (100%)`) whose meaning ties
 * into drop-table bookkeeping this app has no way to read or assign correctly — inventing one would
 * be a fabricated citation wearing a real template's clothes. So this stops at the transclusion
 * syntax that *is* understood and verified against a real page (`{{:Item Name}}`), states the raw
 * numbers in plain English beside it, and leaves the rest — the rarity word, the `.ddb` box, where in
 * the list it belongs — to the editor reading it. EQBuddy's own header makes the same call:
 * observations are "suggestions for reconciliation, never paste-over instructions for existing
 * prose."
 *
 * **Yours only, never pooled.** `MobDrop.myCount`/`MobKnowledge.myKills` exist precisely so a figure
 * about *your* kills never has to borrow a peer's — this reads only those, because a contribution
 * signed with your name has to be a claim you can actually stand behind
 * ([ADR 0132](../../specs/decisions/0132-a-contribution-is-keyed-by-who-made-it.md) draws the same
 * line for pooled mob knowledge).
 *
 * Pure: text in, text out. No I/O, no clipboard, no clock of its own — `at` arrives as an argument.
 */
import { reconcileDrops } from "./drop-truth";
import { count, percent } from "./format";
import type { MobDrop, MobKnowledge } from "./mob-stats";

export interface WikiContributionInput {
  /** The mob's title, as the wiki page has it. */
  mob: string;
  /** Whose kills these are — `settings.playerName`, or a fallback the caller already resolved. */
  character: string;
  /** When this was generated, ISO — so a contribution pasted days later still says when it was true. */
  at: string;
  /** The wiki's own claimed drops for this page: item name → its stated rate, or `undefined` if it lists the item with no figure. */
  wikiDrops: Record<string, string | undefined>;
  /** Every zone you've fought this mob in. Only `myKills`/`MobDrop.myCount` are read — pooled peer figures never travel. */
  zones: Pick<MobKnowledge, "zone" | "myKills" | "drops">[];
}

/** One line worth suggesting be added to the page's loot list. */
function lootLine(item: string, seen: number, kills: number, rate: number): string {
  return `* {{:${item}}} — seen ${seen} of ${kills} kills (${percent(rate)})`;
}

/** Build the pasteable text. Empty input (no kills at all) still returns a sentence saying so. */
export function buildWikiContribution({ mob, character, at, wikiDrops, zones }: WikiContributionInput): string {
  const myKills = zones.reduce((n, z) => n + z.myKills, 0);
  const myCounts: Record<string, number> = {};
  for (const z of zones) {
    for (const d of z.drops as MobDrop[]) myCounts[d.item] = (myCounts[d.item] ?? 0) + d.myCount;
  }

  const lines: string[] = [
    `== ${mob} — from ${character}'s own kills ==`,
    `${count(myKills, "kill")} across ${count(zones.length, "zone")}${zoneList(zones)}, as of ${at.slice(0, 10)}.`,
    "The numbers below are this character's own observations — please reconcile against the page rather than pasting over it.",
    "",
  ];

  if (!myKills) {
    lines.push("No kills recorded yet — nothing to suggest.");
    return lines.join("\n").trim();
  }

  const truth = reconcileDrops(wikiDrops, myCounts, myKills);
  const undocumented = truth.filter((t) => t.verdict === "undocumented" && t.seen > 0);
  const suspicious = truth.filter((t) => t.suspicious);

  if (undocumented.length) {
    lines.push("=== Drops not currently on the page ===");
    for (const t of undocumented) lines.push(lootLine(t.item, t.seen, t.kills, t.observedRate ?? 0));
    lines.push("");
  }

  if (suspicious.length) {
    lines.push("=== Listed, but not confirmed in these kills ===");
    for (const t of suspicious) {
      lines.push(`* ${t.item} — the page says ${t.wikiRate ?? "it drops"}; not seen in ${count(t.kills, "kill")}`);
    }
    lines.push("");
  }

  if (!undocumented.length && !suspicious.length) {
    lines.push("Nothing here differs from what the page already says.");
  }

  return lines.join("\n").trim();
}

/** `" (Zone A, Zone B)"`, or nothing for a single zone — the name is already implied by the mob's own page. */
function zoneList(zones: Pick<MobKnowledge, "zone">[]): string {
  return zones.length > 1 ? ` (${zones.map((z) => z.zone).join(", ")})` : "";
}
