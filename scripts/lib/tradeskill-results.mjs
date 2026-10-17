/**
 * tradeskill-results.mjs — naming what a guide step makes when the guide only names what goes in.
 *
 * Jewelcrafting's guide is a list of `Trivial 17 - [[Silver Bar]] + [[Malachite]]`: the ingredients,
 * never the ring they make. The ring is findable — it's the one recipe on the wiki made of exactly
 * those two things — and the page cache already holds every recipe with its components, so this
 * matches a step's ingredients against that index rather than asking the wiki anything.
 *
 * **Exact sets only.** A step's ingredients must be *all* of a recipe's ingredients, no more and no
 * fewer, so "Silver Bar + Malachite" can't land on a three-part recipe that merely contains both.
 * Counts are ignored (the wiki lists some ingredients twice), and `Enchanted X` is read as `X`: recipe
 * pages list the enchanted bar, and the guide says plainly that the unenchanted one works for skill-ups.
 *
 * **Only where the guide left it out.** A step that already links something crafted ("… Result:
 * [[Platinum Malachite Ring]]", "1 to 31: [[Short Beer]]") has said what it makes, and so has every
 * bullet nested under one — Brewing's "Barley + Cask + Hops + Malt" sits under Short Beer, and
 * repeating it there would only be noise.
 */

/** How a name is compared: case and the enchanted prefix folded away. */
export function ingredientKey(name) {
  return name.trim().toLowerCase().replace(/^enchanted\s+/, "");
}

const setKey = (names) => [...new Set(names.map(ingredientKey))].sort().join("|");

/** A step must name at least this many ingredients — one name alone matches too much to mean anything. */
const MIN_INGREDIENTS = 2;

/** Cached pages that are made of something and are a thing you hold — not a quest's turn-ins or a mob's loot. */
const isRecipe = (p) => (p.kind === "recipe" || p.kind === "item") && p.components?.length > 0;

/** Ingredient set → the recipes made of exactly it, from the page cache. */
export function recipeIndex(pages) {
  const index = new Map();
  for (const p of pages.values()) {
    if (!isRecipe(p)) continue;
    const key = setKey(p.components.map((c) => c.name));
    const list = index.get(key) ?? [];
    if (!list.includes(p.title)) list.push(p.title);
    index.set(key, list);
  }
  for (const list of index.values()) list.sort();
  return index;
}

const linksIn = (runs) => runs.filter((r) => typeof r === "object" && r.link).map((r) => r.link);

/**
 * What a run of ingredients makes, or nothing. `crafted(title)` says whether the cache knows the
 * title as something made — a step that links one has already named its result.
 */
function makes(links, index, crafted) {
  if (links.length < MIN_INGREDIENTS || links.some(crafted)) return undefined;
  const found = index.get(setKey(links));
  return found?.length ? found : undefined;
}

function annotateLines(items, index, crafted, underResult) {
  let found = 0;
  for (const item of items) {
    const links = linksIn(item.runs);
    const named = links.some(crafted);
    if (!underResult) {
      const made = makes(links, index, crafted);
      if (made) {
        item.makes = made;
        found++;
      }
    }
    if (item.children) found += annotateLines(item.children, index, crafted, underResult || named || !!item.makes);
  }
  return found;
}

/** A table that has a result column already says what each row makes. */
const RESULT_COLUMN = /^(?:item|recipe|result|arrow|product)s?$/i;

function annotateTable(block, index, crafted) {
  if (block.header.some((h) => RESULT_COLUMN.test(h.trim()))) return 0;
  let found = 0;
  const all = block.rows.map((row) => {
    const made = makes(row.flatMap(linksIn), index, crafted);
    if (made) found++;
    return made ?? [];
  });
  if (found) block.makes = all;
  return found;
}

/**
 * Write `makes` onto every step that names only ingredients and matches a recipe. Mutates `guides`
 * (they are the generator's own fresh parse) and returns how many steps it named.
 */
export function addMadeItems(guides, index, pages) {
  const crafted = (title) => {
    const p = pages.get(title);
    return !!p && isRecipe(p);
  };
  let found = 0;
  for (const g of guides) {
    for (const b of g.blocks) {
      if (b.kind === "list") found += annotateLines(b.items, index, crafted, false);
      else if (b.kind === "table") found += annotateTable(b, index, crafted);
    }
  }
  return found;
}
