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
 * **The tiers this server runs**, indexed by difficulty: 0 is the ordinary zone, and 1-4 are the
 * rulesets a harder copy of it is opened under.
 *
 * Supplied rather than harvested, and it is doing two jobs. It **names** a difficulty read off a bare
 * number (`zoneDifficultyLabel`), and it is the **vocabulary** that recognises one written out in
 * words — which is what lets `Blackburrow Fused` reach Blackburrow's map at all. A supplied table
 * outranking our guesses is the same rule the gazetteer runs on
 * ([ADR 0076](../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
 */
const DIFFICULTY_TIERS: readonly string[] = ["", "Awakened", "Adaptive", "Fused", "Refined"];

/** The name of a difficulty, or undefined for the ordinary zone and for a tier we can't name. */
const tierName = (level: number): string | undefined => DIFFICULTY_TIERS[level] || undefined;

/**
 * The table read the other way: which difficulty a ruleset **name** is.
 *
 * The number and the name are two spellings of one fact, so a zone that states only the name states
 * the number too — `Blackburrow (Fused)` is difficulty 3, and reading it as "some ruleset, level
 * unknown" would throw away something the table plainly says. Undefined for a tag that isn't one of
 * ours (`Hardcore`, `Solo`), which stays a ruleset with no number.
 */
function tierLevel(tag: string | undefined): number | undefined {
  if (!tag) return undefined;
  const found = DIFFICULTY_TIERS.findIndex((tier) => tier && tier.toLowerCase() === tag.trim().toLowerCase());
  return found > 0 ? found : undefined;
}

/** One `(a|b|c)` of the named tiers, built from the table so the table stays the only place they live. */
const TIER_WORDS = DIFFICULTY_TIERS.filter(Boolean).join("|");

/**
 * A difficulty **number**, in every shape the game and its players write one. All measured against the
 * 472 zone names the app ships: none of them ends in any of these, so all of it folds unguarded.
 *
 *   `Blackburrow 3`  `Blackburrow (3)`  `Blackburrow +3`  `Blackburrow D3`  `Blackburrow [D3]`
 *   `Blackburrow Difficulty 3`
 *
 * A separator is required, so a name that merely *ends* in a digit keeps it. The `D` is optional and
 * the word `Difficulty` is optional, because the tier list the players quote is written both ways
 * ("Difficulty 3", "D3").
 */
const ZONE_DIFFICULTY_RE = new RegExp(String.raw`\s+(?:difficulty\s+)?[+([]?\s*d?(\d+)\s*[)\]]?\s*$`, "i");

/**
 * The ruleset the zone was opened under, tagged on after the difficulty: the log's own
 * "The Steamfont Mountains 2 (Adaptive)". It says how the zone scales, not which zone it is, so it
 * folds away with the number.
 *
 * **Brackets count as parentheses.** Nothing in the shipped corpus ends in `[...]` either, and betting
 * on which of two enclosures a build chose is exactly the bet this file exists not to make.
 *
 * The tag has to start with a letter, because `Blackburrow (3)` is a difficulty written the other way
 * round and belongs to the rule above — and `(D3)` is caught by that rule *first* for the same reason.
 */
const ZONE_MODE_RE = /\s*[([]\s*([A-Za-z][^()[\]]*?)\s*[)\]]\s*$/;

/**
 * The same fact, written the game's *other* way: `Nagafen's Lair - Solo`, `Kedge Keep - Solo`. Found in
 * a real peer's observations — so this is the game's wording, not a guess — and it means a zone opened
 * under a ruleset exactly as the parenthesised form does.
 *
 * Safe to fold because **no zone name contains " - "**: measured across all the app ships (the
 * hyphens it does have are inside a word — `Cazic-Thule`, `Takish-Hiz`), and a test pins it. Requires
 * spaces around the dash for that reason.
 */
const ZONE_DASH_MODE_RE = /\s+-\s+([A-Za-z][A-Za-z ]*?)\s*$/;

/**
 * A **named tier standing on its own**, with no enclosure and no separator: `Blackburrow Fused`,
 * `Blackburrow 3 Fused`.
 *
 * This is the one shape that **cannot** be folded unguarded, and it is worth saying why precisely. Of
 * the 472 zone names the app ships, exactly one ends in a tier word: `Crystallos, Lair of the
 * Awakened`. Folding this by rule would rename a real zone to `Crystallos, Lair of the` — the same
 * failure the gazetteer's own notes warn about, where `Qeynos (North)` renamed a whole city to one of
 * its halves.
 *
 * So it splits in two. With a **number beside it** the shape is unambiguous and folds here, because a
 * real name has no "<digits> <word>" ending either. **Alone**, it is only ever read by the resolver,
 * which has the candidate list in hand and tries the name as written first — so Crystallos matches
 * itself before anything is stripped
 * ([ADR 0139](../../specs/decisions/0139-a-difficulty-can-never-cost-a-map.md)).
 */
const ZONE_TIER_WORD_RE = new RegExp(String.raw`\s+(${TIER_WORDS})\s*$`, "i");

/**
 * A tag inside an enclosure that is really the **number**, not a ruleset name: `(D3)`, `[D3]`,
 * `(Difficulty 3)`.
 *
 * `ZONE_MODE_RE` claims any enclosed tag starting with a letter, and `D3` starts with one — so without
 * this, `Blackburrow (D3)` folds to the right map (the tag comes off either way) while reporting a
 * ruleset *named* "D3" and no difficulty at all. The map was right and the analytics half was wrong,
 * which is the worst of the two to get wrong silently.
 */
const TAG_IS_DIFFICULTY_RE = /^(?:difficulty\s+)?d?(\d+)$/i;

/**
 * Sentence punctuation a name picked up on its way here.
 *
 * The zone line's own parser strips the full stop, so the live path never sees one — but a name lifted
 * out of **prose** does: a wiki page's `Zone: Blackburrow 3.`, a pasted sentence, a peer's note. Every
 * ornament rule anchors at the end of the string, so one stray full stop blocked all of them and
 * `Blackburrow 3.` reached no map at all, while the undecorated `Blackburrow.` was fine (the resolver's
 * word tiers split punctuation out). Fixing the peel rather than the resolver keeps the two agreeing.
 *
 * Measured: of the 472 zone names the app ships, **none** ends in `. , ; : ! ?`. Deliberately not `)`
 * or `"` — nine names end in a parenthesis and eight in a quote (`The Void "A"`), so those are part of
 * a name rather than punctuation around one.
 */
const ZONE_TRAILING_PUNCTUATION_RE = /[.,;:!?]+\s*$/;

const numberIn = (name: string, re: RegExp): number | undefined => {
  const m = re.exec(name.trim());
  return m ? Number(m[1]) : undefined;
};

const nameWithout = (name: string, re: RegExp): string => name.trim().replace(re, "").trim();

/**
 * Peel every ruleset ornament off the end of a zone name, whatever order they were written in.
 *
 * A loop rather than a fixed sequence of replacements, because the ornaments **compose** and the game
 * does not commit to an order: `Cazic-Thule 3 - Solo` is a number then a dash tag, `Blackburrow 3
 * (Fused)` is a number then a parenthesised one, `Blackburrow Difficulty 2 [Adaptive]` is both the
 * other way about. Peeling until nothing more comes off is the only version that doesn't need a list
 * of the combinations somebody thought of.
 *
 * Bounded by `MAX_ORNAMENTS`: each pass must shorten the name to continue, so this terminates on its
 * own, and the cap is a second belt for a regex that could ever match the empty string.
 *
 * `bareTier` allows the one guarded shape — a tier word with no number beside it. Off for the identity
 * fold, on for the resolver. See `ZONE_TIER_WORD_RE`.
 */
const MAX_ORNAMENTS = 6;

function peelOrnaments(name: string, bareTier: boolean): { base: string; difficulty?: number; mode?: string } {
  let base = name.trim();
  let difficulty: number | undefined;
  let mode: string | undefined;

  for (let pass = 0; pass < MAX_ORNAMENTS; pass++) {
    const before = base;

    // Punctuation first: every rule below anchors at the end, so a stray full stop hides all of them.
    const punctuation = ZONE_TRAILING_PUNCTUATION_RE.exec(base);
    if (punctuation) {
      base = base.slice(0, punctuation.index).trim();
      continue;
    }

    // A tag in brackets or after a dash. Read before the number, so `(Adaptive)` is a mode and the
    // `2` in front of it is still there to be read as a difficulty on the next pass.
    const tag = ZONE_MODE_RE.exec(base) ?? ZONE_DASH_MODE_RE.exec(base);
    if (tag) {
      // …unless the tag *is* the number, enclosed: `(D3)`, `(Difficulty 3)`. See `TAG_IS_DIFFICULTY_RE`.
      const enclosedNumber = TAG_IS_DIFFICULTY_RE.exec(tag[1]);
      if (enclosedNumber) difficulty ??= Number(enclosedNumber[1]);
      else mode ??= tag[1];
      base = base.slice(0, tag.index).trim();
      continue;
    }

    // A bare tier word. Allowed unguarded only when a number is left behind it, which is the shape no
    // real zone name has; otherwise it needs the resolver's permission.
    const word = ZONE_TIER_WORD_RE.exec(base);
    if (word) {
      const remainder = base.slice(0, word.index).trim();
      if (bareTier || ZONE_DIFFICULTY_RE.test(remainder)) {
        mode ??= word[1];
        base = remainder;
        continue;
      }
    }

    const level = numberIn(base, ZONE_DIFFICULTY_RE);
    if (level !== undefined) {
      difficulty ??= level;
      base = nameWithout(base, ZONE_DIFFICULTY_RE);
      continue;
    }

    if (base === before) break; // nothing came off — done
  }

  // A named tier states its own number, so `(Fused)` alone is still difficulty 3 (see `tierLevel`).
  return { base, difficulty: difficulty ?? tierLevel(mode), mode };
}

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
  return peelOrnaments(name, false).mode;
}

/** How much harder a zone was made ("Blackburrow 3" → 3), or undefined for the ordinary zone. */
export function zoneDifficulty(name: string): number | undefined {
  return peelOrnaments(name, false).difficulty;
}

/**
 * A zone name without its difficulty or ruleset — the zone one map and one wiki page describe.
 *
 * Every shape a *rule* can be sure of. The one it deliberately leaves is a bare tier word, which
 * `zoneTierBaseName` handles for a caller that has candidates to check against.
 */
export function zoneBaseName(name: string): string {
  return peelOrnaments(name, false).base;
}

/**
 * The same, **plus a bare tier word** — `Blackburrow Fused` → `Blackburrow`.
 *
 * Only for the resolver (`zones/resolve.ts`), which tries the name as written first and so can afford
 * a reading that a rule alone must not take: `Crystallos, Lair of the Awakened` matches itself before
 * this is ever consulted. Nothing should key on it
 * ([ADR 0139](../../specs/decisions/0139-a-difficulty-can-never-cost-a-map.md)).
 */
export function zoneTierBaseName(name: string): string {
  return peelOrnaments(name, true).base;
}

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
 * **The fold is memoised, because it is the app's most-asked question.**
 *
 * Every "is this the same zone?" goes through here — kill records, the map's zone list, the travel
 * graph's labels, the resolver's own tiers — and the answer is a pure function of a string drawn from a
 * small vocabulary. Uncached it is `peelOrnaments` (up to six passes of five regexes) plus four more
 * replacements, and the zone list alone asked it ~100k times to name 402 zones: ~100ms of blocked
 * renderer, twice over, every time a pack's names landed.
 */
const MAX_ZONE_FOLDS = 20_000;
const ZONE_FOLDS = new Map<string, string>();

function foldZoneName(name: string): string {
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
  const seen = ZONE_FOLDS.get(name);
  if (seen !== undefined) return seen;
  const folded = foldZoneName(name);
  // A vocabulary, not a cache of everything ever asked: zone names come from map files, the log and a
  // shipped table, so the live set is a few thousand strings. The cap is only there so a caller that
  // somehow feeds it free text can't grow it without bound — dropping the lot is fine, since every
  // entry is recomputable.
  if (ZONE_FOLDS.size >= MAX_ZONE_FOLDS) ZONE_FOLDS.clear();
  ZONE_FOLDS.set(name, folded);
  return folded;
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
