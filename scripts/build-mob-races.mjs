/**
 * build-mob-races.mjs — regenerate the mob → race table from the wiki cache already shipped in
 * this repo.
 *
 * Every cached mob page's stat card states its own `Race: <name>` line (`.mobStatsBox`/
 * `.eql-mobpage-stats`, see `wiki-data`) — this just walks every `public/data/wiki-cache/pages/*.jsonl`
 * shard, reads that one field back off each `kind: "mob"` entry, and writes the raw `title → race`
 * table. A wiki disambiguation suffix (`"Goblin Elite Guard (Runnyeye)"`) is stripped before the
 * title becomes a key — that parenthetical is the wiki's, never the log's own words for the mob.
 *
 * Raw and unfolded on purpose (ADR 0083's own lesson, applied here): the lookup that reads this
 * (`mob-races.ts`) folds a kill line's name to match it, so this table stays exactly what the wiki
 * cache says rather than a second, drifting copy of the fold.
 *
 *   node scripts/build-mob-races.mjs            # rewrite the generated table
 *   node scripts/build-mob-races.mjs --dry-run  # report whether it would change, write nothing
 *
 * Run it whenever the wiki cache is refreshed and a new race-based achievement wants a mob the
 * table doesn't have yet.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, flag, writeGenerated } from "./lib/cli.mjs";

const PAGES_DIR = path.join(ROOT, "public/data/wiki-cache/pages");
const OUT = path.join(ROOT, "src/shared/mob-races.generated.ts");
const dryRun = flag("dry-run");

/** A wiki disambiguation suffix — the wiki's own housekeeping, not part of the in-game name. */
function stripDisambiguation(title) {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function extract() {
  const races = new Map(); // title (disambiguation stripped) -> race, first one wins
  for (const file of fs.readdirSync(PAGES_DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    const lines = fs.readFileSync(path.join(PAGES_DIR, file), "utf8").split("\n").filter(Boolean);
    for (const raw of lines) {
      const firstTab = raw.indexOf("\t");
      if (firstTab < 0) continue;
      const secondTab = raw.indexOf("\t", firstTab + 1);
      if (secondTab < 0) continue;
      let entry;
      try {
        entry = JSON.parse(raw.slice(secondTab + 1));
      } catch {
        continue;
      }
      if (entry.kind !== "mob" || !entry.title || !Array.isArray(entry.card?.lines)) continue;
      const raceLine = entry.card.lines.find((l) => l.startsWith("Race:"));
      if (!raceLine) continue;
      const race = raceLine.slice("Race:".length).trim();
      if (!race || race === "?" || race === "N/A" || race === "Need Info") continue;
      const key = stripDisambiguation(entry.title);
      if (!races.has(key)) races.set(key, race);
    }
  }
  return races;
}

function render(races) {
  const entries = [...races.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = entries.map(([name, race]) => `  ${JSON.stringify(name)}: ${JSON.stringify(race)},`).join("\n");
  return `/**
 * mob-races.generated.ts — every mob page's own stated race — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/build-mob-races.mjs\`, which reads the \`Race:\` line off every
 * \`kind: "mob"\` page already cached under \`public/data/wiki-cache\` — no network fetch of its own.
 *
 * Keys are the wiki's own title with a trailing disambiguation parenthetical stripped
 * (\`"Goblin Elite Guard (Runnyeye)"\` → \`"Goblin Elite Guard"\`); values are the race exactly as the
 * page states it, unfolded. The lookup that matches a kill line's name against this is hand-written
 * in \`mob-races.ts\` beside it. Nothing else should import this file directly.
 *
 * ${entries.length} mobs.
 */

export const MOB_RACES: Record<string, string> = {
${body}
};
`;
}

const races = extract();
const changed = writeGenerated(OUT, render(races), { dryRun });
if (!dryRun) console.log(`${races.size} mob races written.`);
process.exit(dryRun && changed ? 1 : 0);
