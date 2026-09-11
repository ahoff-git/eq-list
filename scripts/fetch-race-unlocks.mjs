/**
 * fetch-race-unlocks.mjs — regenerate the race-unlock faction/quest table from Alanna's own guide.
 *
 * Every per-faction wiki page this app already reads (`electron/wiki/parse.ts`, ADR 0192) states
 * **direction only, never a point value** — that's a property of the template every faction page
 * shares, not a gap in this app's scraping. Alanna's Race Unlock Guide is different in kind: one
 * person's hand-maintained guide, in `User:` namespace, with actual per-quest faction-point deltas
 * nothing else on the wiki states at all. So it's a second, narrowly-scoped exception to "wiki data is
 * fetched at runtime, not generated" (see `specs/wiki-data/README.md`'s Non-responsibilities, and
 * [ADR 0222](../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md)) — shipped as
 * data because a reformat of one person's prose should show up as a diff to review, not as a parser
 * quietly breaking inside a running app.
 *
 *   node scripts/fetch-race-unlocks.mjs            # rewrite the generated table
 *   node scripts/fetch-race-unlocks.mjs --dry-run  # report what would change, write nothing
 *
 * **Fails loudly, on purpose.** `race-unlocks-parse.mjs` throws with the specific race and section
 * that didn't match the shape this was built against, rather than silently emitting a race with no
 * factions or no faction-point data — a bad regen must be *impossible* to commit by accident, since
 * nothing else re-checks this data against the live game. Re-run this whenever the guide changes, and
 * if it refuses, read the error: it names exactly what to go looking at on the page.
 */
import path from "node:path";
import { ROOT, flag, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parseRaceUnlockGuide } from "./lib/race-unlocks-parse.mjs";

const GUIDE_TITLE = "User:Alanna/Alanna's Race Unlock Guide";
const OUT = path.join(ROOT, "src/shared/race-unlocks.generated.ts");
const dryRun = flag("dry-run");

function renderHits(hits) {
  return hits
    .map(
      (h) =>
        `        { faction: ${JSON.stringify(h.faction)}, amount: ${h.amount}${h.note ? `, note: ${JSON.stringify(h.note)}` : ""} },`,
    )
    .join("\n");
}

function renderMethod(m) {
  const steps = m.steps.map((s) => `      ${JSON.stringify(s)},`).join("\n");
  const groups = m.hitGroups
    .map((g) => `      {\n        label: ${JSON.stringify(g.label)},\n        hits: [\n${renderHits(g.hits)}\n        ],\n      },`)
    .join("\n");
  return `{\n    steps: [\n${steps}\n    ],\n    hitGroups: [\n${groups}\n    ],\n  }`;
}

function renderRace(r) {
  const method = renderMethod(r.method);
  if (r.kind === "factions") {
    const factions = r.factions.map((f) => JSON.stringify(f)).join(", ");
    return `  { race: ${JSON.stringify(r.race)}, kind: "factions", factions: [${factions}], method: ${method} },`;
  }
  if (r.kind === "prerequisite-race") {
    const requires = r.requires.map((f) => JSON.stringify(f)).join(", ");
    return `  { race: ${JSON.stringify(r.race)}, kind: "prerequisite-race", requires: [${requires}], method: ${method} },`;
  }
  return `  { race: ${JSON.stringify(r.race)}, kind: "task", task: ${JSON.stringify(r.task)}, taskWikiTitle: ${JSON.stringify(r.taskWikiTitle)}, method: ${method} },`;
}

async function main() {
  console.log(`Fetching "${GUIDE_TITLE}"…`);
  const pages = await wikitextFor([GUIDE_TITLE]);
  const wikitext = pages.get(GUIDE_TITLE);
  if (!wikitext) throw new Error(`eqlwiki has no page "${GUIDE_TITLE}" — has it been renamed or deleted?`);

  const races = parseRaceUnlockGuide(wikitext);
  console.log(`Parsed ${races.length} races.`);
  for (const r of races) {
    const hits = r.method.hitGroups.reduce((n, g) => n + g.hits.length, 0);
    console.log(`  ${r.race.padEnd(20)} ${r.kind.padEnd(16)} ${hits} faction hit(s), ${r.method.steps.length} step(s)`);
  }

  const body = `/**
 * Race unlock requirements, quests and faction-point values — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-race-unlocks.mjs\`, which fetches and parses
 * "${GUIDE_TITLE}" (scraped ${new Date().toISOString()}). Shipped rather
 * than fetched at runtime — see this script's own header and
 * [ADR 0222](../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md).
 *
 * Only what the guide states in a structurally regular way is here: each race's required factions,
 * its recommended method's numbered steps, and every faction-point breakdown found under that
 * method — grouped by the guide's own nearest heading, **never merged or summed across groups** (see
 * \`scripts/lib/race-unlocks-parse.mjs\`'s header for why). "Alternative Methods" is deliberately not
 * parsed at all; the guide page itself is one \`ItemLink\` away for that.
 *
 * **Each step is kept raw, \`[[Title]]\`/\`[[Title|Display]]\` markup and all** — the UI renders a
 * step's own quest/item/NPC links inline (\`wikiLinksIn\` in \`race-unlocks.ts\`) rather than as a
 * second, disconnected list, so a link always reads in the sentence that explains what it's for.
 *
 * The lookup over this is hand-written beside it in \`race-unlocks.ts\`. Nothing should import this
 * file directly.
 *
 * ${races.length} races.
 */

export interface RaceUnlockFactionHit {
  faction: string;
  /** Signed — a negative entry lowers the faction. */
  amount: number;
  /** Whatever the guide wrote after the number on its line ("or -2", "(-5/-10 for named)") — kept
   *  verbatim rather than discarded, since it can change what the number actually means. */
  note?: string;
}

/** One block of faction-point bullets, as the guide wrote them under one heading. Never merged with
 *  another group — two turn-ins under the same race can name the same faction with different
 *  numbers, because they're alternatives to each other, not additive. */
export interface RaceUnlockHitGroup {
  /** The nearest heading above this block, in the guide's own words. */
  label: string;
  hits: RaceUnlockFactionHit[];
}

/** The guide's "Recommended Method" for a race: its numbered steps (raw wikitext — see the header),
 *  and every faction-point breakdown found underneath. */
export interface RaceUnlockMethod {
  steps: string[];
  hitGroups: RaceUnlockHitGroup[];
}

export type RaceUnlockRequirement = { race: string; method: RaceUnlockMethod } & (
  | { kind: "factions"; factions: string[] }
  | { kind: "prerequisite-race"; requires: string[] }
  | { kind: "task"; task: string; taskWikiTitle?: string }
);

export const RACE_UNLOCK_SOURCE = { title: ${JSON.stringify(GUIDE_TITLE)}, scrapedAt: ${JSON.stringify(new Date().toISOString())} };

export const RACE_UNLOCKS: RaceUnlockRequirement[] = [
${races.map(renderRace).join("\n")}
];
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
