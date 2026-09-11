/**
 * race-unlocks-parse.mjs — turning Alanna's Race Unlock Guide's wikitext into structured data.
 *
 * This is a **single hand-written guide page**, not a wiki template like the faction/zone pages
 * `electron/wiki/parse.ts` reads — there is no fixed container class to key off, only a person's own
 * heading structure and prose. Checked against the guide's real wikitext (fetched directly, not
 * guessed from the rendered page) before writing a single regex here, the same discipline
 * `specs/log-watching/README.md` and ADR 0219/0220 hold every other parser in this app to.
 *
 * **What's regular enough to trust, and what isn't.** Every race section has a `=== Requirements ===`
 * list and a `=== Recommended Method ===` section — reliable enough to parse. Inside "Recommended
 * Method", the numbered steps and the faction-point breakdowns underneath them are *mostly* uniform
 * ("* Faction Name +5") but drift in small ways from race to race — a stray space before the number,
 * a trailing "(-5/-10 for named)" qualifier, an "or -2" alternative. Rather than normalize those away
 * silently, a hit's line is matched only up to its number; anything the guide wrote afterward rides
 * along as `note` instead of being discarded. "=== Alternative Methods ===" is **not** parsed at all —
 * its prose is far less regular (extra turn-in stages mid-paragraph, nested sub-quests), and the guide
 * page itself is one `ItemLink` away, so reproducing it here would only be a second, staler copy.
 *
 * **Never merge hit lines across blocks.** Two different turn-in actions under the same race can name
 * the same faction with different numbers (Halfling's Pickclaw vs. Runnyeye goblins both raise
 * "Guardians of the Vale", but by different amounts, and they're alternatives to each other, not
 * additive) — so a `RaceUnlockHitGroup` transcribes one block's bullets verbatim, labeled by the
 * nearest heading above it, and nothing here ever sums or dedupes across groups.
 *
 * Throws with the specific race/section name on anything that doesn't fit this shape, rather than
 * silently emitting a race with no factions or no hits — see `fetch-race-unlocks.mjs`'s header for why
 * that matters more here than in most generators.
 */

/** A heading line at any level (`== X ==` through `====== X ======`), or `null`. */
const HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/;

function headingLine(line) {
  const m = HEADING_RE.exec(line);
  return m ? { level: m[1].length, title: m[2].trim() } : null;
}

/** Every heading of exactly `level` in `lines`, with the line index right after it. */
function headingsAt(lines, level) {
  const out = [];
  lines.forEach((line, i) => {
    const h = headingLine(line);
    if (h && h.level === level) out.push({ title: h.title, bodyStart: i + 1 });
  });
  return out;
}

/** From `start` up to (not including) the next heading whose level is `<= level` — the standard
 *  wikitext sectioning rule (the same one `fetch-zone-expansions.mjs` uses for an expansion's zone
 *  table): a heading *deeper* than `level` is a subsection, not a boundary. */
function sectionLines(lines, start, level) {
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const h = headingLine(lines[i]);
    if (h && h.level <= level) break;
    out.push(lines[i]);
  }
  return out;
}

/** `[[Title]]` / `[[Title|Display]]` → the display text a reader would see. */
function linkDisplay(text) {
  return text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, title, display) => display || title);
}

/** "* Faction Name +5", "* Faction Name - 300", "* Faction Name -1 (-5/-10 for named)" — a name, a
 *  signed amount, and whatever the guide wrote after it. Deliberately a *prefix* match: the lazy name
 *  group stops at the first `sign digits` it finds, which is the actual amount in every real line
 *  surveyed (see the module header) and never a number embedded earlier in a faction's own name
 *  ("Miners Guild 249", which has no sign next to its digits). */
const HIT_RE = /^\*\s*(.+?)\s+([+-])\s*(\d+)\b(.*)$/;

function hitIn(line) {
  const m = HIT_RE.exec(line);
  if (!m) return undefined;
  const [, name, sign, digits, rest] = m;
  const note = rest.replace(/^[\s.,;:()-]+/, "").trim();
  return { faction: linkDisplay(name).trim(), amount: Number(`${sign}${digits}`), ...(note && { note }) };
}

/** The `=== Recommended Method ===` section, split into its numbered steps — kept **raw**, `[[...]]`
 *  markup and all, so the UI can render each step's own quest/item/NPC links inline rather than as a
 *  second, disconnected list — and every faction-hit block found anywhere underneath, each labeled by
 *  its nearest heading. */
function parseMethod(lines) {
  let i = 0;
  const steps = [];
  // Steps come first, before the first subheading (if any) — "==== Details ====" or straight to a
  // "===== Sub-heading =====" (Wood Elf skips straight from level 3 to level 5; both are handled the
  // same way, since only *whether* a heading appears is asked, never which level).
  for (; i < lines.length; i++) {
    if (headingLine(lines[i])) break;
    if (/^[#*]+\s*\S/.test(lines[i])) steps.push(lines[i].replace(/^[#*]+\s*/, "").trim());
  }

  const hitGroups = [];
  let label = "Recommended Method";
  let buffer = [];
  const flush = () => {
    if (buffer.length) hitGroups.push({ label, hits: buffer });
    buffer = [];
  };
  for (; i < lines.length; i++) {
    const h = headingLine(lines[i]);
    if (h) {
      flush();
      label = h.title;
      continue;
    }
    const hit = hitIn(lines[i]);
    if (hit) buffer.push(hit);
  }
  flush();

  return { steps, hitGroups };
}

/** "Get maximum faction with [[X]]." repeated — the ordinary shape every race but two uses. */
function factionsRequirement(text) {
  const re = /Get maximum faction with \[\[([^\]|]+)\|?([^\]]*)\]\]/g;
  const factions = [];
  let m;
  while ((m = re.exec(text))) factions.push((m[2] || m[1]).trim());
  return factions;
}

/** Half Elf's shape: "Unlock Human or Wood Elf as a race". */
function prerequisiteRaces(text) {
  const m = /Unlock (.+?) as a race/i.exec(text);
  if (!m) return undefined;
  return m[1]
    .split(/\s*,\s*|\s+or\s+/i)
    .map((s) => linkDisplay(s).trim())
    .filter(Boolean);
}

/** Kerran's shape: "Complete the [[X]] Task". */
function taskRequirement(text) {
  const m = /Complete the \[\[([^\]|]+)\|?([^\]]*)\]\] Task/i.exec(text);
  if (!m) return undefined;
  return { task: (m[2] || m[1]).trim(), taskWikiTitle: m[1].trim() };
}

/** One race's `== Heading ==` body → its requirement (one of three shapes) plus its recommended
 *  method, or throws naming exactly what didn't fit. */
function parseRace(race, lines) {
  const req = headingsAt(lines, 3).find((h) => h.title === "Requirements");
  if (!req) throw new Error(`${race}: no "Requirements" heading`);
  const reqText = sectionLines(lines, req.bodyStart, 3).join("\n");

  const methodHeading = headingsAt(lines, 3).find((h) => h.title === "Recommended Method");
  if (!methodHeading) throw new Error(`${race}: no "Recommended Method" heading`);
  const method = parseMethod(sectionLines(lines, methodHeading.bodyStart, 3));

  const factions = factionsRequirement(reqText);
  if (factions.length) {
    if (method.hitGroups.length === 0) {
      throw new Error(`${race}: has ${factions.length} required faction(s) but no faction-point breakdown was found under Recommended Method`);
    }
    return { race, kind: "factions", factions, method };
  }
  const requires = prerequisiteRaces(reqText);
  if (requires?.length) return { race, kind: "prerequisite-race", requires, method };
  const task = taskRequirement(reqText);
  if (task) return { race, kind: "task", ...task, method };

  throw new Error(`${race}: "Requirements" matched none of the known shapes:\n${reqText}`);
}

/** The whole page → one entry per race, in the order the guide lists them. Throws on the first race
 *  whose shape doesn't fit, naming it — see the module header for why this doesn't fail softer. */
export function parseRaceUnlockGuide(wikitext) {
  const lines = (wikitext ?? "").split(/\r?\n/);
  const races = headingsAt(lines, 2).filter((h) => h.title !== "Introduction");
  if (races.length < 15) {
    throw new Error(`only found ${races.length} race sections (expected at least 15) — has the page's structure changed?`);
  }
  return races.map((r, i) => {
    const end = races[i + 1] ? races[i + 1].bodyStart - 1 : lines.length;
    return parseRace(r.title, lines.slice(r.bodyStart, end));
  });
}
