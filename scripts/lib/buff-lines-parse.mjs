/**
 * buff-lines-parse.mjs — turning eqlwiki's "Buff Lines" guide into structured stacking data.
 *
 * Like Alanna's Race Unlock Guide, this is a single hand-maintained page, not a wiki template —
 * there's no fixed container class to key off, only the author's own heading structure. Checked
 * against the guide's real wikitext (fetched via the API) before writing a single regex, the same
 * discipline `race-unlocks-parse.mjs` holds itself to and for the same reason
 * (see [ADR 0264](../../specs/decisions/0264-buff-line-data-is-generated-static-data.md)).
 *
 * **The shape.** `== Category ==` (Attribute Enhancing, Other Buffs, Resistances, Speed) contains
 * `=== Stat ===` (Agility, AC, Cold Resistance, …), which contains `==== Line ====` — one heading
 * per group of spells/items that can't be up together, sometimes named `Stat (Label)` and
 * sometimes just `Label` (the Resistances sections drop the stat prefix). Each line's body is a
 * flat bullet list: `* +52 [[Deliriously Nimble]] ([[Shaman]] 53)<br>`. `Description`, `Filters`
 * and `To Do` are prose, not data, and are skipped outright.
 *
 * **A spell that contributes to more than one line just appears as a bullet under more than one
 * `====` heading** — a "combination" buff needs no special handling here, because membership by
 * heading already says "conflicts with everything under either heading" on its own.
 *
 * **Only the bullet's number, spell and trailing text are read.** The trailing text (class/level,
 * Group/Self-only, item source, a footnote) is kept as one free-text `detail` rather than broken
 * further down — the point of this data is "what shares a line with what," not a second class/level
 * table, and this page is exactly the kind of irregular prose `race-unlocks-parse.mjs`'s own header
 * already explains why not to over-parse. A line inside a line's body that isn't a bullet in this
 * shape (a blank line, the one asterisk-footnote paragraph) is skipped rather than rejected — the
 * floor below catches an actual change in the page's structure instead.
 *
 * The maximum-value summary tables at the top of each stat section are never read: they're a
 * derived convenience, not a fact this feature needs, and skipping them costs nothing since they
 * sit before a stat's first `====` heading and are never walked into.
 *
 * Throws, naming what didn't fit, when the page looks structurally different from what this was
 * built against — a bad regen must be impossible to commit by accident, since nothing else
 * re-checks this data against the live wiki.
 */
import { headingsAt, linkDisplay } from "./wikitext.mjs";

const SKIP_CATEGORIES = new Set(["Description", "Filters", "To Do"]);

/**
 * "* +52 [[Deliriously Nimble]] ([[Shaman]] 53)<br>" → spell, signed bonus, and whatever trails.
 *
 * A leading `*` is normal but not required — a handful of rows on the real page (bard-instrument
 * continuations) lose theirs, and this is already scoped to one line-heading's own body, so a bare
 * `+N [[Spell]]` there is still a member, not prose. The gap between the bonus and the spell link
 * is read loosely (`(.*?)`, lazy) rather than "whitespace only", because it sometimes holds a
 * second, wiki-documented number instead — a bard song's bonus with a maximum instrument
 * (`+18 (+50) [[...]]`), or a resource cost the guide states inline (`+31 (-48 HP) [[Demi Lich]]`)
 * — and sometimes a unit word (`+4000 Damage Absorb [[Can o' Whoop Ass]]`). None of that is
 * discarded: it's folded into `detail` alongside whatever trails the link, unparsed.
 */
const MEMBER_RE = /^\*?\s*([+-]\d+)(%)?\s*(.*?)\[\[([^\]|]+)\|?([^\]]*)\]\]\s*(.*)$/;

function memberIn(line) {
  const m = MEMBER_RE.exec(line);
  if (!m) return undefined;
  const [, signedBonus, percent, middle, title, display, trailing] = m;
  const detail = linkDisplay(`${middle} ${trailing}`)
    .replace(/<br\s*\/?>/gi, "")
    .replace(/'''/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    spell: (display || title).trim(),
    bonus: Number(signedBonus),
    // A handful of Haste rows state a percentage rather than a flat amount — kept apart rather than
    // silently treating "+70%" as a flat +70, which it very much isn't.
    ...(percent && { unit: "%" }),
    ...(detail && { detail }),
  };
}

/** The label a reader would call this line: the text inside a trailing "(...)" on the heading
 *  ("Agility (Primary)" → "Primary"), or the whole heading when there isn't one (Resistances' bare
 *  "Primary"/"Potion"/...) — one rule covers both heading styles the page actually uses. */
function bareLabel(heading) {
  const m = /\(([^)]+)\)\s*$/.exec(heading);
  return m ? m[1].trim() : heading;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** One stat's body → its buff lines. A `====` heading whose body names no real member (an aside,
 *  or a heading this regex doesn't recognize the contents of) is dropped rather than emitted
 *  empty — every real line on this page names at least one spell or item. */
function parseStat(category, stat, lines) {
  const headings = headingsAt(lines, 4);
  return headings
    .map((h, i) => {
      const end = headings[i + 1] ? headings[i + 1].bodyStart - 1 : lines.length;
      const members = lines.slice(h.bodyStart, end).map(memberIn).filter(Boolean);
      const label = bareLabel(h.title);
      return { id: `${slug(stat)}--${slug(label)}`, category, stat, label, members };
    })
    .filter((line) => line.members.length > 0);
}

function parseCategory(category, lines) {
  const stats = headingsAt(lines, 3);
  return stats.flatMap((h, i) => {
    const end = stats[i + 1] ? stats[i + 1].bodyStart - 1 : lines.length;
    return parseStat(category, h.title, lines.slice(h.bodyStart, end));
  });
}

/** A floor on categories found, not an exact count — `Description`/`Filters`/`To Do` are excluded
 *  by name above, so this only has to catch the page losing its real sections outright. */
const MIN_CATEGORIES = 3;
/** The real page has 112 buff lines at time of writing; this floor is meant to catch "the page's
 *  structure changed," not to reject one odd section. */
const MIN_LINES = 100;

/** The whole "Buff Lines" guide → one entry per buff line, in the order the guide lists them. */
export function parseBuffLines(wikitext) {
  const lines = (wikitext ?? "").split(/\r?\n/);
  const categories = headingsAt(lines, 2).filter((h) => !SKIP_CATEGORIES.has(h.title));
  if (categories.length < MIN_CATEGORIES) {
    throw new Error(`only found ${categories.length} category section(s) (expected at least ${MIN_CATEGORIES}) — has the page's structure changed?`);
  }

  const buffLines = categories.flatMap((h, i) => {
    const end = categories[i + 1] ? categories[i + 1].bodyStart - 1 : lines.length;
    return parseCategory(h.title, lines.slice(h.bodyStart, end));
  });

  if (buffLines.length < MIN_LINES) {
    throw new Error(`only found ${buffLines.length} buff line(s) (expected at least ${MIN_LINES}) — has the page's structure changed?`);
  }
  const ids = buffLines.map((l) => l.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) throw new Error(`duplicate buff line id(s), the page named two lines the same: ${dupes.join(", ")}`);

  return buffLines;
}
