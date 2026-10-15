/**
 * spell-source-parse.mjs — how a spell is obtained, read off its page's `where_to_obtain` field.
 *
 * Every eqlwiki spell page is one `{{Spellpage|…}}` (or `Spellpagesmart`) template call, and the
 * field is hand-written there, so it comes in a handful of shapes rather than one. Each was counted
 * across all ~2050 spells before this was written:
 *
 *   - **vendor** — a `{{SpellWhereTable|…}}` of merchant rows, or a `[[Druid#Spell Vendors|…]]` link
 *     list. (A merchant standing in a "Caster Quest NPC Area" is still a merchant — the table wins.)
 *   - **quest** — prose naming the quest: `obtained via a quest - [[Coin of Tash (Tashania)]]`,
 *     `Quest: [[Tarton's Wheel]]`, `[[Magician Epic Quest]]`, or a `==Related Quests==` sub-heading
 *     (Kunark's 50+ spells, which also drop).
 *   - **drop** — `Kunark Level 50+ Mob Drop`, `Drops from …`, `(Named mobs)`.
 *   - **research** — crafted with the Research skill (`{{Wizard Recipe|…}}`, `Research`).
 *   - **other** — something written that none of the above recognise (a bare list of mobs, "Unknown").
 *
 * A spell can be several at once, and on EQL that's often a quest spell a vendor *also* sells — the
 * wiki writes it three ways, all read here:
 *
 *   - both in one field (Selo's Accelerando: a vendor list with a `[[Winds of Karana]] quest` line);
 *   - **two `where_to_obtain` fields** in one template (Fire Flux: the quest, then a vendor list added
 *     after it) — MediaWiki would render only the last, so every one is read, not just the first;
 *   - a vendor field with the quest as its own page section outside it (Spirit Pouch's
 *     `== Quest Reward of ==`, Talisman of Jasinth's `==Related Quests==`).
 *
 * An empty or missing field is no kinds at all — the wiki didn't say, which is not the same as "vendor".
 */

const FIELD = /^\|\s*where_to_obtain\s*=([\s\S]*?)(?=^\|\s*\w+\s*=|^\}\})/gm;
const QUEST_HEADING = /^(==+)\s*[^=\n]*quest[^=\n]*\1\s*$/i;

/**
 * Everything the page says about where to get it: every `where_to_obtain` field, then every
 * quest-titled section of the page under one `==Related Quests==` heading, which is how
 * `classifySpellSource` reads links as quests.
 */
export function whereToObtain(wikitext) {
  const fields = [...wikitext.matchAll(FIELD)].map((m) => m[1].trim()).filter(Boolean);
  const questLinks = questSections(wikitext).filter((l) => /\[\[/.test(l));
  return [...fields, ...(questLinks.length ? ["==Related Quests==", ...questLinks] : [])].join("\n");
}

/** The lines under every quest-titled heading on the page, each up to the next heading or `}}`. */
function questSections(wikitext) {
  const lines = wikitext.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    if (!QUEST_HEADING.test(line.trim())) return;
    for (let j = i + 1; j < lines.length && !/^=|^\}\}/.test(lines[j].trim()); j++) out.push(lines[j]);
  });
  return out;
}

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** `[[Target|Shown]]` → the page title it opens, which is what the app looks a quest up by. */
function linkTargets(text) {
  return [...text.matchAll(LINK)].map((m) => m[1].trim().replace(/_/g, " "));
}

/** A link's text with every link blanked out — so "quest" inside `[[Magician Epic Quest]]` isn't prose. */
const prose = (text) => text.replace(LINK, " ");

/** Where the first "quest" that isn't inside a `[[link]]` starts, or -1. */
function firstProseQuest(line) {
  for (const m of line.matchAll(/\bquests?\b/gi)) {
    const before = line.slice(0, m.index);
    if ((before.match(/\[\[/g) ?? []).length === (before.match(/\]\]/g) ?? []).length) return m.index;
  }
  return -1;
}

/**
 * The quests one line of prose names. Links after the word "quest" (`via quests: [[A]] or [[B]]`);
 * failing that, links before it (`via [[The Etched Stone]] quest`); and any link that is itself a
 * quest page by name (`[[Call of Flame Quest]]`). "This spell's scroll, [[McMerin's Feast]], is
 * obtained via quests: …" is why "after" is tried first — the scroll is a link too.
 */
function questsOnLine(line) {
  const named = linkTargets(line).filter((t) => /\bquest\b/i.test(t));
  const split = firstProseQuest(line);
  if (split < 0) return named;
  const after = linkTargets(line.slice(split));
  return [...new Set([...(after.length ? after : linkTargets(line.slice(0, split))), ...named])];
}

/** Links on the `**` lines straight after a line that names quests but links none itself. */
function subBulletLinks(lines, i) {
  if (firstProseQuest(lines[i]) < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length && /^\s*\*\*/.test(lines[j]); j++) out.push(...linkTargets(lines[j]));
  return out;
}

/** Text → `{ kinds, quests }`, both in a stable order; empty arrays when the wiki said nothing. */
export function classifySpellSource(text) {
  const kinds = new Set();
  const quests = [];
  if (!text.trim()) return { kinds: [], quests };

  const [main, ...after] = text.split(/^==\s*Related Quests\s*==\s*$/im);
  const related = after.join("\n");
  if (related) {
    kinds.add("quest");
    quests.push(...linkTargets(related));
  }

  const plain = prose(main);
  if (/\{\{SpellWhere(Table|Row)/i.test(main) || /\b(spell|song) vendors?\b|merchants?\b/i.test(main)) kinds.add("vendor");
  if (/\bdrops?\b|\bmobs?\b/i.test(plain)) kinds.add("drop");
  if (/research|\{\{\w+ Recipe/i.test(main)) kinds.add("research");
  // A merchant table's "Caster Quest NPC Area" column is a place, not a quest — skip table rows.
  const lines = main.split("\n");
  lines.forEach((line, i) => {
    if (/\{\{SpellWhere/i.test(line)) return;
    // "obtained via the quests:" with the quests as `**` sub-bullets beneath it (Sacrifice).
    const own = questsOnLine(line);
    const found = own.length ? own : subBulletLinks(lines, i);
    if (found.length || firstProseQuest(line) >= 0) {
      kinds.add("quest");
      quests.push(...found);
    }
  });

  if (!kinds.size) kinds.add("other");
  return { kinds: KIND_ORDER.filter((k) => kinds.has(k)), quests: [...new Set(quests)] };
}

/** Display and storage order. */
export const KIND_ORDER = ["quest", "research", "drop", "vendor", "other"];
