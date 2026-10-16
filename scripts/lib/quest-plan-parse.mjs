/**
 * quest-plan-parse.mjs — a long quest as stages of steps: what each step has you hand in, what you get
 * back, who it's with, and where.
 *
 * A class epic is thirty-odd steps across a dozen zones. eqlwiki writes them as a checklist: a bold
 * line per stage, then bullets in a small set of shapes —
 *
 *   * '''Jeweled Dragon Head Hilt'''                                        ← a stage
 *   ** Loot [[Lord Bergurgle's Crown]] from [[Lord Bergurgle]] in [[Lake Rathetear]]
 *   :* Give [[Damaged Goblin Crown]] to [[Natasha Whitewater]] -- receive [[Ornate Sea Shell]]
 *   * [[Tainted Darksteel Sword]] - [[Keeper of the Tombs]], the Hole.     ← "item - who drops it"
 *
 * The Plane of Sky class tests are a table instead (`skyTestStages`), one row per test.
 *
 * Every step keeps its links. **What a link is** (an item, an NPC or mob, a zone, another quest) is
 * not knowable from the bullet, so the caller says, from the linked page (`kindOf`). This module turns
 * the sentence plus those kinds into facts.
 *
 * Pure: wikitext in, plain data out.
 */
import { parseLoc, plainText } from "./pickup-table-parse.mjs";

const LINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
const LOC_TEMPLATE = /\{\{\s*loc\s*\|\s*([^|}]+?)\s*\|([^}|]*)/i;
const COORDS = /([-+]?\d{1,5}(?:\.\d+)?)\s*,\s*([-+]?\d{1,5}(?:\.\d+)?)(?:\s*,\s*([-+]?\d{1,5}(?:\.\d+)?))?/;
/** A stage title: a line that is nothing but bold, bulleted or not — `* '''Orb of Frozen Water'''`. */
const STAGE = /^\*?\s*'''\s*(.+?)\s*'''\s*:?\s*$/;
const BULLET = /^([*:#]+)\s*(.*)$/;

/** Links this module never treats as part of a step: files, categories, interwiki. */
const IGNORED_LINK = /^(file|image|category|media):/i;

const HEADING = /^(=+)\s*(.*?)\s*\1\s*$/;
/** Section headings that name the checklist itself, never a stage of it. */
const NOT_A_STAGE = /^(checklist|walkthrough|steps?)$/i;

/**
 * Every checklist on a quest page, as stages.
 *
 * A checklist runs from `{{CheckboxList}}` to `{{End}}` or the next top-level (`==`) heading, and a
 * page may have several (the Enchanter epic has one per part). Inside one, a stage starts at a bold
 * line (`* '''Orb of Frozen Water'''`) or a sub-heading (`==== Maestro's Symphony Page 24 Top ====`).
 * Steps before any of those belong to the heading just above the checklist, or failing that to a
 * stage named for the quest.
 */
export function checklistStages(wikitext, quest) {
  const stages = [];
  let inList = false;
  let heading = null;
  let stage = null;
  const open = (title) => {
    stage = { title, steps: [] };
    stages.push(stage);
  };
  for (const raw of wikitext.split("\n")) {
    const line = raw.trim();
    const h = HEADING.exec(line);
    if (/\{\{\s*CheckboxList\s*\}\}/i.test(line)) {
      inList = true;
      stage = null;
      continue;
    }
    if (!inList) {
      if (h) heading = plainText(h[2].replace(/'''/g, ""));
      continue;
    }
    if (/^\{\{\s*End\s*\}\}/i.test(line) || (h && h[1].length <= 2)) {
      inList = false;
      if (h) heading = plainText(h[2]);
      continue;
    }
    if (!line) continue;
    const title = h ? h[2].replace(/'''/g, "") : STAGE.exec(line)?.[1];
    if (title) {
      open(plainText(title));
      continue;
    }
    const bullet = BULLET.exec(line);
    if (!bullet || !plainText(bullet[2])) continue;
    if (!stage) open(heading && !NOT_A_STAGE.test(heading) ? heading : quest);
    stage.steps.push({ depth: bullet[1].length, text: bullet[2] });
  }
  return stages.filter((s) => s.steps.length);
}

/**
 * The Plane of Sky's islands by the number its quest-item codes use — `3-Gorga` is island 3 — from the
 * zone page's own `== Island 3: Harpy Island ==` headings.
 */
export function skyIslands(planeWikitext) {
  const out = {};
  for (const m of planeWikitext.matchAll(/^==\s*Island\s+([\d.]+)\s*:\s*(.+?)\s*==\s*$/gm)) out[m[1]] = `Island ${m[1]}: ${m[2]}`;
  return out;
}

/** The `=== [[Wizard]] Tests ===` section of the Plane of Sky page, for one class. */
export function skyTestSection(planeWikitext, cls) {
  const heading = new RegExp(`^===\\s*\\[\\[${cls}\\]\\]\\s+Tests\\s*===\\s*$`, "m");
  const m = heading.exec(planeWikitext);
  if (!m) return "";
  const after = planeWikitext.slice(m.index + m[0].length);
  const end = after.search(/^={2,3}[^=]/m);
  return end < 0 ? after : after.slice(0, end);
}

/**
 * The pages a Plane of Sky item code could mean — `(3-Gorga)`, `(4-KoS)`, `(7-SotS)` name the island
 * and the boss that drops it, abbreviated. Every page the zone page links whose name the code is the
 * initials of (with or without "the", case kept: Sister of the Spire is "SotS"), or the start of
 * ("Gorga" → Gorgalosk). Several can match ("KoS": Keeper of Souls, Key of Swords) — the caller keeps
 * the one that is a person.
 */
export function skyCodeCandidates(planeWikitext, code) {
  const links = [...new Set([...planeWikitext.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((m) => m[1].trim()))];
  const initials = (name, keepThe) =>
    name
      .split(/\s+/)
      .filter((w) => keepThe || !/^the$/i.test(w))
      .map((w) => w[0])
      .join("");
  return links.filter(
    (l) => initials(l, true) === code || initials(l, false) === code || (code.length >= 4 && l.toLowerCase().startsWith(code.toLowerCase())),
  );
}

/**
 * One class's Plane of Sky tests as stages, one per test: collect its quest items (each tagged with the
 * island that drops it, and — where `bossFor` knows the code — the boss) and its rune, then hand them all
 * to the class's quest giver for the reward. Written as the same step sentences a checklist would use,
 * so `describeStep` reads them alike.
 */
export function skyTestStages(section, islands, bossFor = () => undefined) {
  const giver = /'''Quest Giver:'''\s*(\[\[[^\]]+\]\])/.exec(section)?.[1] ?? "";
  const rows = section.split(/^\|-\s*$/m).slice(1);
  const stages = [];
  for (const row of rows) {
    const cells = row.split(/^\|(?!-)/m).slice(1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const reward = /\{\{:([^}]+)\}\}/.exec(cells[0])?.[1]?.trim();
    const test = plainText(cells[1]);
    const runes = [...cells[3].matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
    const items = [...cells[4].matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
    const steps = [];
    for (const li of [...runes, ...items]) {
      const link = /\[\[[^\]]+\]\]/.exec(li)?.[0];
      if (!link) continue;
      const tag = /\((\d+(?:\.\d+)?)-([^)]*)\)/.exec(li);
      const island = tag && islands[tag[1]];
      const boss = tag && bossFor(tag[2]);
      const text = boss ? `Loot ${link} from [[${boss}]] in [[Plane of Sky]]` : `Get ${link} in [[Plane of Sky]]`;
      steps.push({ depth: 1, text, area: island || undefined });
    }
    const handIn = [...runes, ...items].map((li) => /\[\[[^\]]+\]\]/.exec(li)?.[0]).filter(Boolean);
    if (giver && reward) steps.push({ depth: 1, text: `Give ${handIn.join(", ")} to ${giver} in [[Plane of Sky]] -- receive [[${reward}]]` });
    if (test && steps.length) stages.push({ title: test, trigger: plainText(cells[2]) || undefined, steps });
  }
  return stages;
}

/** Every page a step links, in order, with how it was shown. */
export function stepLinks(text) {
  const out = [];
  for (const m of text.matchAll(LINK)) {
    const target = m[1].split("#")[0].trim();
    if (!target || IGNORED_LINK.test(target)) continue;
    out.push({ target, shown: (m[2] ?? m[1]).trim(), at: m.index });
  }
  return out;
}

/**
 * What an item is called in game, from its link: the page title, unless that carries a wiki
 * disambiguator the game never shows — `[[Shimmering Pearl*|Shimmering Pearl]]`.
 */
export function itemName(link) {
  return /[*()]/.test(link.target) && link.shown ? link.shown.replace(/\*$/, "").trim() : link.target;
}

const GIVE = /^(?:give|hand|turn\s*in|return|bring|offer)\b/i;
const TALK = /^(?:tell|say|hail|ask|speak|talk)\b/i;
const BUY = /^(?:buy|purchase)\b/i;
const COMBINE = /^(?:combine|put\b.*\bin(?:to)?\b|fashion)/i;
const KILL = /^(?:kill|slay|camp)\b/i;
const LOOT = /\bloot\b|\bdrops?\b/i;
const GROUND = /ground ?spawn|\bon the ground\b|^pick up|^retrieve/i;
/** Where a hand-in sentence turns from what you give to what you get back. */
const RETURN = /\b(?:receive|recieve|for|get|gets?\s+you)\b|--|–|—|\bto receive\b/i;

/**
 * A step's facts, from its sentence and what each link is.
 *
 * `kindOf(target)` → `"item" | "npc" | "zone" | "quest" | undefined`. Returns `{ kind, gives, gets,
 * who, zone, loc, text }`: `gives`/`gets` are item names, `who` the NPC or mob the step is with, `zone`
 * as linked or stated, `loc` from a `{{Loc}}` or written coordinates.
 */
export function describeStep(rawText, kindOf) {
  // A parenthetical is advice, not the step: "receive [[Orb of Frozen Water]] (wait until you have
  // [[Lord Gimblox's Signet Ring]])" gets you the orb, not the ring. Its links don't count.
  const asides = [...rawText.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  const aside = (at) => asides.some(([a, b]) => at > a && at < b);
  const links = stepLinks(rawText)
    .filter((l) => !aside(l.at))
    .map((l) => ({ ...l, kind: kindOf(l.target) }));
  const text = plainText(rawText);
  const items = links.filter((l) => l.kind === "item");
  const people = links.filter((l) => l.kind === "npc");
  const zones = links.filter((l) => l.kind === "zone");
  const quests = links.filter((l) => l.kind === "quest");

  let kind;
  let gives = [];
  let gets = [];
  let who;
  if (GIVE.test(text)) {
    kind = "give";
    // "Give [[A]] and [[B]] to [[NPC]] … receive [[C]]": what precedes the turn is handed in.
    const turn = rawText.search(RETURN);
    const split = turn < 0 ? Infinity : turn;
    gives = items.filter((l) => l.at < split);
    gets = items.filter((l) => l.at >= split);
    who = people.find((l) => /\bto\s*$/i.test(rawText.slice(0, l.at).replace(/\[\[[^\]]*$/, ""))) ?? people[0];
  } else if (quests.length && /\b(?:quest|complete|do the)\b/i.test(text) && !items.length) {
    kind = "quest";
  } else {
    // "[[Item]] - [[mob]] in Plane of Hate": the item a step is named for, and what drops it.
    const shorthand = items[0] && people[0] && items[0].at < people[0].at && /^\s*\[\[[^\]]+\]\]\s*[-–—:]/.test(rawText);
    if (TALK.test(text)) kind = "talk";
    else if (BUY.test(text)) kind = "buy";
    else if (COMBINE.test(text)) kind = "combine";
    else if (GROUND.test(text)) kind = "ground";
    else if (LOOT.test(text) || shorthand || (KILL.test(text) && items.length)) kind = "loot";
    else if (KILL.test(text)) kind = "kill";
    else kind = items.length ? "get" : "other";
    if (kind === "combine") {
      // "Combine [[A]] and [[B]] in [[C]] to create [[D]]": the last item made, the rest used up.
      gets = items.slice(-1);
      gives = items.slice(0, -1);
    } else {
      gets = items;
    }
    who = people[0];
  }

  const template = LOC_TEMPLATE.exec(rawText);
  const stated = template ? parseLoc(template[2]) : undefined;
  const written = !stated && COORDS.exec(rawText.replace(/\[\[[^\]]*\]\]/g, ""));
  const loc = stated ?? (written ? parseLoc(written[0]) : undefined);

  return {
    kind,
    text,
    gives: distinct(gives.map(itemName)),
    gets: distinct(gets.map(itemName)),
    ...(who ? { who: who.target } : {}),
    ...(zones[0] ? { zone: zones[0].target } : template ? { zone: template[1].trim() } : {}),
    ...(loc ? { loc } : {}),
    ...(quests.length ? { quests: distinct(quests.map((q) => q.target)) } : {}),
  };
}

function distinct(list) {
  return [...new Set(list)];
}
