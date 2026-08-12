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
 * Pure and dependency-free. Both readers live here so the shapes the number comes in are stated
 * once; see [ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md).
 */

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

/** The ruleset tag a zone carries ("Blackburrow 2 (Adaptive)" → "Adaptive"), or undefined. */
export function zoneMode(name: string): string | undefined {
  const m = ZONE_MODE_RE.exec(name.trim());
  return m ? m[1] : undefined;
}

/** How much harder a zone was made ("Blackburrow 3" → 3), or undefined for the ordinary zone. */
export function zoneDifficulty(name: string): number | undefined {
  return numberIn(nameWithout(name, ZONE_MODE_RE), ZONE_DIFFICULTY_RE);
}

/** A zone name without its difficulty or ruleset — the zone one map and one wiki page describe. */
export function zoneBaseName(name: string): string {
  return nameWithout(nameWithout(name, ZONE_MODE_RE), ZONE_DIFFICULTY_RE);
}

/**
 * **Zones our sources call different things** — the other half of the mapping list, beside
 * `CURATED_ZONES` in `map/zones.ts`. That table says which *file* a zone is; this one says which
 * *name*, for a place the log, the mapmakers and the wikis never agreed on.
 *
 * Both sides are written folded (lower case, no leading "the"), because that is the form every
 * comparison reaches this table with. Fold to the **map's** name: the map is the thing on screen, so
 * that is the name the picker and the title should show.
 *
 * **This is the short list on purpose.** Rephrasings resolve on their own now — "The Castle of
 * Mistmoore" finds "Castle Mistmoore" without being told, and a sub-zone finds its parent — so an
 * entry here is only for a pair *no rule can reach*, where the two names share no useful spelling
 * ([ADR 0068](../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)). Each one
 * below is a pair the resolver was measured against and could not place.
 *
 * Add an entry only once the zone is *identified* — by the zones its file links to, and by whether
 * your own recorded positions land inside its geometry. A guess here is the one naming mistake that
 * doesn't fail closed: unlike the resolver, an alias has no candidate list to be outvoted by, so it
 * is believed everywhere and forever. See the warning on `CURATED_ZONES`.
 */
const ZONE_ALIASES: Record<string, string> = {
  // Kerra Isle is `kerraridge`, named "Kerra Ridge" by both packs' own labels: its only exit is to
  // Toxxulia Forest, which is Kerra Isle's only neighbour, and 454 of 463 positions recorded there
  // sit inside its lines.
  "kerra isle": "kerra ridge",
  // Fandom's name for `runnyeye`. Unreachable by spelling *and* by rank: scored against the whole
  // expansion table, "RunnyEye Citadel" likes "Estate of Unrest" (0.38) better than "Clan Runnyeye"
  // (0.32), so no threshold could have rescued it — which is exactly what this table is for. The
  // later "The Liberation of Runnyeye" is a different zone and stays one.
  "clan runnyeye": "runnyeye citadel",
  // Fandom's name for `northro`. The words don't overlap enough to match ("northern"/"north" is an
  // edit apart, "desert" is in neither the other's name), and "South Ro" is the same distance away.
  "north ro": "northern desert of ro",
};

/**
 * The one fold behind every "is this the same zone?" — the key that kill records, mob knowledge, the
 * map lookup, hunt grouping and the wiki's drop zones all compare on.
 *
 * Decoration off (difficulty, ruleset), then case, a leading "the" and spacing normalised, then any
 * alias applied. `normalizeZone` in `sources.ts` is this function; it lives here because the rule is
 * about what a zone *name* means, and nothing else in this module has dependencies either.
 */
export function zoneKey(name: string): string {
  const folded = zoneBaseName(name)
    .toLowerCase()
    // **The apostrophe.** EverQuest's map labels write a backtick — `Erud\`s Crossing`,
    // `Kurn\`s Tower`, `Dagnor\`s Cauldron` — while the log writes a typewriter one (verified
    // against a real log: `Ak'Anon`, `Erud's Crossing`), and people type that too. Left unfolded,
    // a zone the solver named off a label could never match the zone line that takes you there.
    .replace(/[`’]/g, "'")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return ZONE_ALIASES[folded] ?? folded;
}
