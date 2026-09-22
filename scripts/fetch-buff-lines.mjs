/**
 * fetch-buff-lines.mjs — regenerate the buff-line stacking table from eqlwiki's own guide.
 *
 * "Buff Lines" groups every beneficial spell/item effect by which statistic it buffs and then by
 * which of them can't be up at the same time — a hand-maintained guide, not a uniform per-spell
 * template like the pages `electron/wiki/parse.ts` reads at runtime. So this follows the same
 * exception ADR 0222 already carved out for Alanna's Race Unlock Guide: shipped as committed,
 * generated data rather than fetched live, because a reformat of one person's prose should show up
 * as a diff to review, not as a parser quietly breaking inside a running app. See
 * [ADR 0264](../specs/decisions/0264-buff-line-data-is-generated-static-data.md).
 *
 *   node scripts/fetch-buff-lines.mjs            # rewrite the generated table
 *   node scripts/fetch-buff-lines.mjs --dry-run  # report what would change, write nothing
 *
 * **Fails loudly, on purpose.** `buff-lines-parse.mjs` throws when the page's own structure looks
 * different from what this was built against, rather than silently emitting a short list — a bad
 * regen must be impossible to commit by accident, since nothing else re-checks this data against
 * the live wiki. Re-run this whenever the guide changes, and if it refuses, read the error.
 */
import path from "node:path";
import { ROOT, flag, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parseBuffLines } from "./lib/buff-lines-parse.mjs";

const PAGE_TITLE = "Buff Lines";
const OUT = path.join(ROOT, "src/shared/buff-lines.generated.ts");
const dryRun = flag("dry-run");

function renderMember(m) {
  const unit = m.unit ? `, unit: ${JSON.stringify(m.unit)}` : "";
  const detail = m.detail ? `, detail: ${JSON.stringify(m.detail)}` : "";
  return `        { spell: ${JSON.stringify(m.spell)}, bonus: ${m.bonus}${unit}${detail} },`;
}

function renderLine(l) {
  const members = l.members.map(renderMember).join("\n");
  return `  {\n    id: ${JSON.stringify(l.id)},\n    category: ${JSON.stringify(l.category)},\n    stat: ${JSON.stringify(l.stat)},\n    label: ${JSON.stringify(l.label)},\n    members: [\n${members}\n    ],\n  },`;
}

async function main() {
  console.log(`Fetching "${PAGE_TITLE}"…`);
  const pages = await wikitextFor([PAGE_TITLE]);
  const wikitext = pages.get(PAGE_TITLE);
  if (!wikitext) throw new Error(`eqlwiki has no page "${PAGE_TITLE}" — has it been renamed or deleted?`);

  const buffLines = parseBuffLines(wikitext);
  const members = buffLines.reduce((n, l) => n + l.members.length, 0);
  console.log(`Parsed ${buffLines.length} buff lines, ${members} members.`);

  const body = `/**
 * Buff-line stacking data — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-buff-lines.mjs\`, which fetches and parses eqlwiki's
 * "${PAGE_TITLE}" (scraped ${new Date().toISOString()}). Shipped rather than fetched at runtime —
 * see this script's own header and
 * [ADR 0264](../../specs/decisions/0264-buff-line-data-is-generated-static-data.md).
 *
 * Every entry is one buff line: a group of spells/items that can't be up on the same target at
 * once, because the game only ever keeps the strongest. A spell that appears under more than one
 * line is a combination buff that conflicts with everything under either one — that's just what
 * appearing twice already means, nothing more is encoded for it.
 *
 * \`members\` keeps only what the guide's bullet stated in a structurally regular way: the spell's
 * name, its bonus, and whatever trailed it as free-text \`detail\` (class/level, Group/Self-only, an
 * item's source) — see \`scripts/lib/buff-lines-parse.mjs\`'s header for why that isn't parsed any
 * further.
 *
 * The lookup over this is hand-written beside it in \`buff-lines.ts\`. Nothing should import this
 * file directly.
 *
 * ${buffLines.length} buff lines, ${members} members.
 */

export interface BuffLineMember {
  spell: string;
  /** Signed — the guide states every real row this way (see its own "To Do" list on the ones it's
   *  still missing). */
  bonus: number;
  /** "%" for the handful of Haste rows the guide states as a percentage rather than a flat amount
   *  — absent otherwise, which reads as "flat". */
  unit?: string;
  /** Whatever else the guide wrote around the spell link, verbatim: a bard song's bonus with a
   *  maximum instrument, a resource cost, class/level, Group/Self-only, an item's source, a
   *  footnote — kept as free text rather than broken down further. */
  detail?: string;
}

/** One group of spells/items that can't be up on the same target at once. */
export interface BuffLine {
  /** Stable, derived from \`stat\`+\`label\` — not the wiki's own key, since the guide has none. */
  id: string;
  category: string;
  stat: string;
  /** The line's own name, shorter than \`id\` and fit to show beside a spell ("Primary", "Potion"). */
  label: string;
  /** Strongest first, as the guide lists them. */
  members: BuffLineMember[];
}

export const BUFF_LINES_SOURCE = { title: ${JSON.stringify(PAGE_TITLE)}, scrapedAt: ${JSON.stringify(new Date().toISOString())} };

export const BUFF_LINES: BuffLine[] = [
${buffLines.map(renderLine).join("\n")}
];
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
