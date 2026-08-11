/**
 * fetch-zone-expansions.mjs — regenerate the zone → expansion table.
 *
 * **Which expansion a zone came with** is a fact about EverQuest that never changes, and it's the one
 * fact that decides whether a zone exists on this server at all. A map pack draws all 26 expansions,
 * so without it the app offers you Argath, Bastion of Illdaera and routes you through it.
 *
 * The EverQuest fandom wiki states it, one table per expansion, in a shape every expansion page shares
 * (`transcludesection|zone_list`) — so the table is **fetched, not typed**. Output is
 * `src/shared/travel/../zones/expansions.generated.ts`; the lookup over it, and the policy about which
 * expansions this server runs, are hand-written beside it in `zones/expansions.ts`.
 *
 *   node scripts/fetch-zone-expansions.mjs            # rewrite the generated table
 *   node scripts/fetch-zone-expansions.mjs --dry-run  # report what would change, write nothing
 *
 * Run it when an expansion is released, or when a zone turns out to be missing from the table.
 *
 * **The check that matters** runs against eqlwiki, the server's own wiki: every zone *it* lists should
 * be found in the table and should belong to an expansion this server runs. A zone eqlwiki knows that
 * this table files under Veil of Alaris would be excluded from the whole app, so that's an error and
 * the script refuses to write. A zone eqlwiki knows that the table has never heard of is only a
 * warning — Legends has custom zones, and the lookup deliberately fails open on those.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/shared/zones/expansions.generated.ts");
const dryRun = process.argv.includes("--dry-run");

const FANDOM = "https://everquest.fandom.com/api.php";
const EQLWIKI = "https://eqlwiki.com/api.php";

async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  const res = await fetch(url, { headers: { "User-Agent": "eq-list zone table (+github.com/ahoff-git/eq-list)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/**
 * Every **article** in a category, following continuation — the same query `fetchCategoryTitles` makes.
 * Without `cmnamespace: 0` this also returns the category's sub-categories and files, which is how an
 * earlier run counted eqlwiki's 116 zones as 239.
 */
async function categoryMembers(base, category) {
  const titles = [];
  let cmcontinue;
  for (let page = 0; page < 40; page++) {
    const params = {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmnamespace: "0",
      cmlimit: "max",
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await api(base, params);
    for (const m of data.query?.categorymembers ?? []) titles.push(m.title);
    cmcontinue = data.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return titles;
}

/**
 * The zones an expansion page's table lists, and when it shipped.
 *
 * **Two table shapes, one rule.** Older pages write a plain `{| class="article-table"` under a
 * `== Zones ==` heading; newer ones wrap the same table in `{{#ifeq:…zone_list…}}` with every pipe
 * escaped as `{{!}}` so it can be transcluded. Rather than parse either, the section is split on row
 * separators (`|-` / `{{!}}-`) and **the first link in each row** is taken — which is the zone column
 * in both, and skips the `[[Luclin]]` in the continent column that a whole-section scan would swallow.
 *
 * **Base zones only.** A row is either a zone or one of its mission/raid instances (`Sepulcher: Raid
 * Instance #2`, `Argath: Illdaera's Vengeance`), and an instance has no map file of its own — keeping
 * them would quadruple the table for nothing. A piped link's display text is what a map label would
 * use, so that's the side kept.
 */
async function expansionZones(title) {
  const data = await api(FANDOM, { action: "parse", page: title, prop: "wikitext" });
  const wikitext = data.parse?.wikitext ?? "";
  const released = /release_date\s*=\s*([^|}\n]+)/.exec(wikitext)?.[1]?.trim() ?? "";

  // The zone table, whichever way this page writes it: from the "Zones" heading (or the transclusion
  // marker) to the next heading of the same level.
  const start = /^=+\s*Zones?\s*=+\s*$/im.exec(wikitext)?.index ?? wikitext.indexOf("zone_list");
  if (start < 0) return { zones: [], released };
  const rest = wikitext.slice(start + 1);
  const end = /^==[^=]/m.exec(rest)?.index ?? rest.length;
  const section = rest.slice(0, end);

  const zones = new Set();
  for (const row of section.split(/\{\{!\}\}-|^\|-/m)) {
    const link = /\[\[([^\]]+)\]\]/.exec(row)?.[1];
    if (!link) continue;
    const name = (link.includes("|") ? link.slice(link.indexOf("|") + 1) : link).replace(/\s+/g, " ").trim();
    if (!name || name.includes("#") || /^(Category|File|Image)\b/i.test(name)) continue;
    // A colon marks a mission or raid instance ("Sepulcher: The Triune God"), never a zone of its own.
    // "Cazic Thule (Zone)" style disambiguators are trimmed to the name a map label would carry.
    if (name.includes(":")) continue;
    zones.add(name.replace(/\s*\((?:zone|city)\)\s*$/i, "").trim());
  }
  return { zones: [...zones].sort(), released };
}

/** The same fold `zoneKey` applies, kept in step by hand because a script can't import the TS. */
const fold = (s) =>
  s
    .toLowerCase()
    .replace(/[`’]/g, "'")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Dates the infobox doesn't state. Only one page needs it, and getting it wrong matters: order decides
 * which expansion **owns** a zone two of them list, so an original-release zone sorted last would be
 * attributed to whichever later expansion revamped it — and then excluded from the whole app.
 */
const KNOWN_RELEASES = { "Original Release": "March 16, 1999" };

/** Release order, so "is this past the era?" can be asked of the table rather than a second list. */
function releaseOrder(a, b) {
  const time = (g) => {
    const t = Date.parse(g.released || KNOWN_RELEASES[g.expansion] || "");
    return Number.isFinite(t) ? t : Infinity;
  };
  return time(a) - time(b) || a.expansion.localeCompare(b.expansion);
}

async function main() {
  console.log("Reading fandom's expansion list…");
  const pages = (await categoryMembers(FANDOM, "Expansions")).filter((p) => p.startsWith("EverQuest:"));
  console.log(`  ${pages.length} expansion pages`);

  const groups = [];
  for (const title of pages.sort()) {
    const { zones, released } = await expansionZones(title);
    const expansion = title.replace(/^EverQuest:\s*/, "");
    if (!zones.length) {
      console.log(`  ⚠ ${expansion}: no zone table — skipped`);
      continue;
    }
    groups.push({ expansion, released: released || KNOWN_RELEASES[expansion] || "", zones });
    console.log(`  ${expansion.padEnd(24)} ${String(zones.length).padStart(3)} zones  (${released || "date unknown"})`);
  }
  groups.sort(releaseOrder);

  // One zone can be listed by two expansions (a revamp). The **earliest** wins: what matters is when
  // the zone first existed, since that's what decides whether this server has it.
  const owner = new Map();
  for (const g of groups) for (const z of g.zones) if (!owner.has(fold(z))) owner.set(fold(z), { zone: z, expansion: g.expansion });
  console.log(`\n${owner.size} distinct zones across ${groups.length} expansions`);

  // ── Checked against the server's own wiki ─────────────────────────────────────────────────────
  console.log("\nChecking against eqlwiki's own zone list…");
  const known = (await categoryMembers(EQLWIKI, "Zones")).filter((z) => !/cleanupproject/i.test(z));
  const SERVER = new Set(["Original Release", "The Ruins of Kunark", "The Scars of Velious"]);
  const wrong = [];
  const missing = [];
  for (const zone of known) {
    const hit = owner.get(fold(zone));
    if (!hit) missing.push(zone);
    else if (!SERVER.has(hit.expansion)) wrong.push(`${zone} → ${hit.expansion}`);
  }
  console.log(`  eqlwiki lists ${known.length} zones`);
  console.log(`  ${missing.length} not in the table (fine — the lookup fails open; Legends has custom zones)`);
  if (missing.length) console.log(`    ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " …" : ""}`);
  if (wrong.length) {
    console.error(`\n  ✗ ${wrong.length} zones eqlwiki knows are filed under an expansion this server doesn't run:`);
    for (const w of wrong) console.error(`      ${w}`);
    console.error("\nRefusing to write: excluding a zone the server has would cut it out of the whole app.");
    process.exit(1);
  }
  console.log("  ✓ every zone eqlwiki knows belongs to an expansion this server runs");

  const body = `/**
 * Which expansion each EverQuest zone came with — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-zone-expansions.mjs\`, which fetches each expansion's own zone
 * table from the EverQuest fandom wiki and refuses to write if it would file a zone **this server
 * knows** under an expansion the server doesn't run. Base zones only: a mission or raid instance has
 * no map file of its own.
 *
 * Ordered by release, so "past the era" can be read off the table. Where two expansions list the same
 * zone (a revamp), the **earliest** owns it — what matters is when the zone first existed.
 *
 * The lookup over this, and the policy about which expansions this server runs, are hand-written in
 * \`expansions.ts\` beside it. Nothing should import this file directly.
 *
 * ${owner.size} zones across ${groups.length} expansions.
 */

export interface ExpansionZones {
  /** As the fandom wiki names it, without the "EverQuest: " prefix. */
  expansion: string;
  /** Release date, verbatim from the expansion's infobox. */
  released: string;
  zones: string[];
}

export const ZONE_EXPANSIONS: ExpansionZones[] = [
${groups
  .map(
    (g) =>
      `  {\n    expansion: ${JSON.stringify(g.expansion)},\n    released: ${JSON.stringify(g.released)},\n    zones: [\n${g.zones
        .map((z) => `      ${JSON.stringify(z)},`)
        .join("\n")}\n    ],\n  },`,
  )
  .join("\n")}
];
`;

  if (dryRun) {
    const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    console.log(before === body ? "\nUp to date." : `\nWould rewrite ${path.relative(ROOT, OUT)} (${body.length} bytes).`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body, "utf8");
  console.log(`\n→ ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
