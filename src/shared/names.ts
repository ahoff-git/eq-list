/**
 * names.ts — the numbers EQL decorates a name with, and which name is the thing's identity.
 *
 * There are two, and they work the same way: an item can be **graded** ("Dragoon Dirk +2") and a
 * zone can be made **harder** ("Blackburrow 3"). Either number describes *this* copy of the thing
 * rather than which thing it is — the wiki has a page for "Dragoon Dirk" and none for "Dragoon
 * Dirk +2", and one map draws Blackburrow however hard its gnolls hit. A harder zone also names the
 * ruleset it scales by — "The Steamfont Mountains 2 (Adaptive)" — which is the same kind of fact
 * about this copy, so it folds away with the number.
 *
 * So a name is folded to its base wherever names are *matched* — the wiki, the map, the shopping
 * list, a drop rate — and kept verbatim wherever the log is *shown*, because the grade is the
 * point of the loot line and the difficulty is the point of comparing two camps.
 *
 * Both readers live here so the shapes the number comes in are stated once; see
 * [ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md). The only thing it depends on
 * is the zone gazetteer, which is data.
 */

import { ZONE_NAME_PAIRS } from "./zones/gazetteer";

/** An item's grade is written as a plus and a number, always last: "Crushbone Belt +5". */
const ITEM_GRADE_RE = /\s*\+\s*(\d+)\s*$/;

/**
 * A harder zone's number follows its name. The plain form is what the game writes; the `+N` and
 * parenthesised forms are accepted too rather than betting on one spelling of it. A separator is
 * required, so a name that merely *ends* in a digit keeps it.
 */
const ZONE_DIFFICULTY_RE = /\s+\+?\(?(\d+)\)?\s*$/;

/**
 * The ruleset the zone was opened under, tagged on after the difficulty: the log's own
 * "The Steamfont Mountains 2 (Adaptive)". It says how the zone scales, not which zone it is, so it
 * folds away with the number. The tag has to start with a letter, because "Blackburrow (3)" is a
 * difficulty written the other way round and belongs to the rule above.
 */
const ZONE_MODE_RE = /\s*\(\s*([A-Za-z][^()]*?)\s*\)\s*$/;

/**
 * The same fact, written the game's *other* way: `Nagafen's Lair - Solo`, `Kedge Keep - Solo`. Found in
 * a real peer's observations — so this is the game's wording, not a guess — and it means a zone opened
 * under a ruleset exactly as the parenthesised form does.
 *
 * Safe to fold because **no zone name contains " - "**: measured across all 361 the app ships (the
 * hyphens it does have are inside a word — `Cazic-Thule`, `Takish-Hiz`), and a test pins it. Requires
 * spaces around the dash for that reason.
 */
const ZONE_DASH_MODE_RE = /\s+-\s+([A-Za-z][A-Za-z ]*?)\s*$/;

const numberIn = (name: string, re: RegExp): number | undefined => {
  const m = re.exec(name.trim());
  return m ? Number(m[1]) : undefined;
};

const nameWithout = (name: string, re: RegExp): string => name.trim().replace(re, "").trim();

/** The `+N` an item name carries ("Dragoon Dirk +2" → 2), or undefined when it carries none. */
export function itemGrade(name: string): number | undefined {
  return numberIn(name, ITEM_GRADE_RE);
}

/** An item name without its grade — what the wiki, the shopping list and a drop rate key on. */
export function itemBaseName(name: string): string {
  return nameWithout(name, ITEM_GRADE_RE);
}

/** The ruleset tag a zone carries ("Blackburrow 2 (Adaptive)" → "Adaptive", "Kedge Keep - Solo" → "Solo"). */
export function zoneMode(name: string): string | undefined {
  const trimmed = name.trim();
  const m = ZONE_MODE_RE.exec(trimmed) ?? ZONE_DASH_MODE_RE.exec(trimmed);
  return m ? m[1] : undefined;
}

/** How much harder a zone was made ("Blackburrow 3" → 3), or undefined for the ordinary zone. */
export function zoneDifficulty(name: string): number | undefined {
  return numberIn(withoutMode(name), ZONE_DIFFICULTY_RE);
}

/** A zone name without its difficulty or ruleset — the zone one map and one wiki page describe. */
export function zoneBaseName(name: string): string {
  return nameWithout(withoutMode(name), ZONE_DIFFICULTY_RE);
}

/**
 * **What the game calls each difficulty.** The number is an index into this: 0 is the ordinary zone,
 * and 1–4 are the rulesets a harder copy of it is opened under.
 *
 * Supplied by the player rather than harvested, which is why it is a table and not a parse: the log
 * writes the tag beside the number only sometimes ("The Steamfont Mountains 2 (Adaptive)") and often
 * writes the bare number ("Blackburrow 3"), and the two have to read the same. A tier the table
 * hasn't got is not an error — a build may add one — so it simply goes unnamed.
 */
const DIFFICULTY_TIERS: readonly string[] = ["", "Awakened", "Adaptive", "Fused", "Refined"];

/** The name of a difficulty, or undefined for the ordinary zone and for a tier we can't name. */
const tierName = (level: number): string | undefined => DIFFICULTY_TIERS[level] || undefined;

/**
 * **How hard this copy of the zone was, said out loud** — `D3 Fused`, `Solo`, or undefined for an
 * ordinary zone. No punctuation of its own: it is read inside a `·`-separated title.
 *
 * This is the half of a zone name that the map fold throws away
 * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md),
 * [ADR 0134](../../specs/decisions/0134-a-map-reference-resolves-to-a-place.md)): one map draws
 * Blackburrow however hard its gnolls hit, so the name a map is looked up by cannot carry it — and
 * folding it away silently would leave a window unable to say which Blackburrow you are standing in.
 * So the fold and this reader are two halves of one rule, and they live next to each other.
 *
 * **The log's own tag wins** where it wrote one. It is the game speaking, so it survives a build that
 * renames a tier or adds a fifth; the table only fills in for the bare number.
 */
export function zoneDifficultyLabel(name: string): string | undefined {
  const level = zoneDifficulty(name);
  const tier = zoneMode(name) ?? (level === undefined ? undefined : tierName(level));
  if (level === undefined) return tier; // a ruleset with no number: "Nagafen's Lair - Solo"
  return tier ? `D${level} ${tier}` : `D${level}`;
}

/** Either spelling of the ruleset tag off — the game writes both, and they mean the same thing. */
function withoutMode(name: string): string {
  return nameWithout(nameWithout(name, ZONE_MODE_RE), ZONE_DASH_MODE_RE);
}

/**
 * **Zones our sources call different things** — the other half of the mapping list, beside
 * `CURATED_ZONES`. That table says which *file* a zone is; this one says which *name*, for a place
 * the log, the mapmakers and the wikis never agreed on. Both are now **two views of one gazetteer**
 * (`zones/gazetteer.ts`), so a name learned once is known to both
 * ([ADR 0076](../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
 *
 * Both sides are stored folded (lower case, no leading "the"), because that is the form every
 * comparison reaches this table with. Fold to the **map's** name: the map is the thing on screen, so
 * that is the name the picker and the title should show.
 *
 * An alias is the one naming mistake that doesn't fail closed: unlike the resolver, it has no
 * candidate list to be outvoted by, so it is believed everywhere and forever — which is why the
 * gazetteer's are checked by `electron/tests/zone-gazetteer.test.ts` (no alias may rename a different
 * zone, and no two may disagree) rather than merely trusted.
 */
const HAND_ALIASES: Record<string, string> = {
  // Fandom's name for `northro`, which the gazetteer knows only as "North Ro". The words don't
  // overlap enough to match ("northern"/"north" is an edit apart, "desert" is in neither the other's
  // name), and "South Ro" is the same distance away — so the pair still has to be stated, and it
  // must fold *to* the fandom spelling, since that's what the expansion lookup is keyed by.
  "north ro": "northern desert of ro",
  /*
   * **The three names a real EQL log turned out to use.** Found in a peer's shared observations, which
   * are derived from *their* log — so this is the game's own wording, which is the wording data is
   * stored under (ADR 0083) and therefore the wording that has to resolve.
   *
   * Each is identified, per the warning above, not guessed:
   *
   *   city of guk / ruins of old guk — EverQuest's long names for `guktop` and `gukbottom`. The peer
   *     has both and neither "Upper Guk" nor "Lower Guk", which is what the gazetteer calls them;
   *     fandom lists exactly two Guk zones in Original Release, so there is nothing else they could be.
   *   temple of cazic-thule — fandom's own name for `cazicthule`, where the gazetteer's display name is
   *     the bare "Cazic-Thule". One zone in Original Release, not two, and the words overlap too little
   *     for the order tier to pair them ("temple" is in one name only). Folding them also lets the
   *     expansion lookup place the zone, which it couldn't before.
   */
  "city of guk": "upper guk",
  "ruins of old guk": "lower guk",
  "temple of cazic-thule": "cazic-thule",
};

/**
 * Every name that means another zone's name, folded: the gazetteer's pairs, then the hand table,
 * which wins.
 *
 * Three rules, each of which a test pins:
 *  - **identity pairs are dropped** — a spelling that already folds onto its canonical is a no-op;
 *  - **first wins** among the gazetteer's own, so a re-supplied table can't silently flip a name;
 *  - **chains are resolved here**, once, because `zoneKey` does a single lookup — an alias pointing
 *    at a name that is itself an alias would otherwise fold only half way.
 */
const ZONE_ALIASES: Record<string, string> = buildZoneAliases();

function buildZoneAliases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { alias, canonical } of ZONE_NAME_PAIRS) {
    const key = zoneFold(alias);
    const value = zoneFold(canonical);
    if (!key || !value || key === value) continue;
    if (out[key] === undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(HAND_ALIASES)) out[key] = value;

  // Follow each value while it is itself a key, so one lookup is always enough. Bounded by the
  // number of entries, so a cycle can't spin.
  for (const key of Object.keys(out)) {
    let value = out[key];
    for (let hops = 0; out[value] !== undefined && out[value] !== value && hops < 8; hops++) value = out[value];
    out[key] = value;
  }
  return out;
}

/**
 * A zone name folded by **rule alone** — the part of `zoneKey` that needs no vocabulary, which is
 * also what the alias table's own keys are built with (so it can't be self-referential).
 *
 * Exported for the resolver, which needs to see a name *as written* as well as after an alias
 * replaced it (`spellings` in `zones/resolve.ts`). Nothing should key on this: two spellings of one
 * zone fold differently here, which is the whole reason the alias table exists.
 */
export function zoneFold(name: string): string {
  return zoneBaseName(name)
    .toLowerCase()
    // **The apostrophe.** EverQuest's map labels write a backtick — `Erud\`s Crossing`,
    // `Kurn\`s Tower`, `Dagnor\`s Cauldron` — while the log writes a typewriter one (verified
    // against a real log: `Ak'Anon`, `Erud's Crossing`), and people type that too. Left unfolded,
    // a zone the solver named off a label could never match the zone line that takes you there.
    .replace(/[`’]/g, "'")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one fold behind every "is this the same zone?" — the key that kill records, mob knowledge, the
 * map lookup, hunt grouping and the wiki's drop zones all compare on.
 *
 * Decoration off (difficulty, ruleset), then case, a leading "the" and spacing normalised, then any
 * alias applied. `normalizeZone` in `sources.ts` is this function; it lives here because the rule is
 * about what a zone *name* means.
 */
export function zoneKey(name: string): string {
  const folded = zoneFold(name);
  return ZONE_ALIASES[folded] ?? folded;
}
