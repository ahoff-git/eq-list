/**
 * gazetteer.ts — **what a zone is called, and which map file it is.** One table, two views.
 *
 * The app has to reconcile four vocabularies (the log, the map packs' exit labels, fandom's
 * expansion tables, and whatever a player types), and until now the part no rule can derive was two
 * hand-written lists that had grown one painfully-verified entry at a time: `CURATED_ZONES` (which
 * *file* a zone is) and `ZONE_ALIASES` (which *name*). Both are now **derived from a supplied
 * gazetteer** — `eql-classic-zone-maps.json`, the EQL wiki's own in-era Zones page mapped to the
 * EverQuest short names, dropped in as a source of truth
 * ([ADR 0076](../../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
 *
 * **Why trust it.** Of the thirty-one names this repo had verified the hard way it confirms
 * **twenty-four exactly** — same name, same file — including the two that cost the most to get right:
 * `qey2hh1` is **West Karana** (not the Qeynos Hills its own exit label names) and `qeytoqrg` is
 * **Qeynos Hills**. Of the seven left over, five are files it simply doesn't carry (three alternate
 * short names, plus Legends' own two) and two are names we deliberately keep — see below. It also
 * explains the solver's worst confident-wrong answer: `neriaka` is the Foreign Quarter, and the Fourth
 * Gate it kept offering is `neriakd`, a file we had no name for at all.
 *
 * **The supplied table does not overrule what we verified**, though: `VERIFIED` comes first, and
 * first wins. Two reasons, both about a name being load-bearing rather than cosmetic — a canonical
 * name is what the expansion lookup and stored pins are keyed by, and where the two disagree about a
 * *file* (`tox` / `toxxulia`, `steamfont` / `steamfontmts`, `nro` / `northro`) the entry we kept is
 * the one that exists in a real install. Nothing is lost by ordering it this way: the loser stays in
 * the list as a **candidate** (a folder with only `tox` names it Toxxulia Forest, where before it
 * showed "Tox"), and every other spelling becomes an alias, so both resolve.
 *
 * Pure data and pure shaping — deliberately **no fold**, because folding a name is `names.ts`'s job
 * and it is the module that consumes the alias pairs. That keeps this dependency-free (the JSON
 * aside) and the import graph acyclic.
 */

import supplied from "./eql-classic-zone-maps.json";

/** One searchable map identity in the supplied table. */
export interface SuppliedMap {
  /** EverQuest short name, lowercase — `null` where the source couldn't state one. */
  map_name: string | null;
  display_name: string;
  aliases?: string[];
  status?: string;
}

/** One wiki zone label, which may cover several map files (Freeport is three). */
export interface SuppliedZone {
  zone: string;
  region: string;
  maps: SuppliedMap[];
}

const SUPPLIED = supplied as { zones: SuppliedZone[] };

/** A zone name we can state outright, and the file it belongs to. */
export interface CuratedZone {
  name: string;
  file: string;
  /** Sorts related zones together in the picker (all four Karanas, both Faydarks). */
  sortingStr?: string;
}

/**
 * **Names we worked out ourselves, from the maps and from a real log** — first in line, because each
 * was checked and because a canonical name is keyed on elsewhere.
 *
 * Every one is a standard EverQuest short name, and a name is only ever used if that file exists — so
 * a *missing* file here fails closed (the zone keeps its file name). A **wrong** one does not: it
 * draws a different zone's map under the right name, and every position plotted on it is somewhere
 * else entirely.
 *
 * So the solver's rule applies to hand-written entries too, and it is the check to run before adding
 * one: **a map that links "to X" is a neighbour of X, not X**. `qey2hh1` was curated as Qeynos Hills
 * on that mistake — its own exit label says `to Qeynos Hills`, because it is West Karana next door,
 * and Qeynos Hills is `qeytoqrg` ("Qeynos to Surefall Glade", whose exits are Blackburrow, Northern
 * Qeynos, Surefall Glade and West Karana). Confirmed against a real log's `/loc` fixes: all 20
 * recorded positions in Qeynos Hills sit inside `qeytoqrg`'s geometry and outside `qey2hh1`'s — and
 * the supplied gazetteer now says the same.
 *
 * That check is the price of an entry, and it has two halves worth running: **the exits** (a file's
 * neighbours identify it) and **your own positions** (you cannot stand outside the zone you are in).
 * A new entry only belongs here if the gazetteer *lacks* it or *contradicts* something measured;
 * otherwise the gazetteer is the place to correct.
 */
const VERIFIED: CuratedZone[] = [
  { name: "Greater Faydark", file: "gfaydark", sortingStr: "Faydark" },
  { name: "Lesser Faydark", file: "lfaydark", sortingStr: "Faydark" },
  // `toxxulia` over the gazetteer's `tox`: both are the same forest and this is the file a real
  // install has. `tox` stays a candidate below, so a folder with only that one is still named.
  { name: "Toxxulia Forest", file: "toxxulia" },
  { name: "Qeynos Hills", file: "qeytoqrg" },
  // EQ named West Karana for the road it carries ("Qeynos to HighHold, part 1"), which no spelling
  // rule can reach — the other three Karanas are `eastkarana` / `northkarana` / `southkarana`.
  { name: "West Karana", file: "qey2hh1", sortingStr: "Karana" },
  // The zone is "Clan Crushbone" in the game; the wiki's page is "Crushbone", which is an alias.
  { name: "Clan Crushbone", file: "crushbone" },
  { name: "Northern Felwithe", file: "felwithea", sortingStr: "Felwithe" },
  { name: "Southern Felwithe", file: "felwitheb", sortingStr: "Felwithe" },
  // The solver offers `neriaka` the *Fourth* Gate; the gazetteer confirms that's `neriakd`.
  { name: "Neriak Foreign Quarter", file: "neriaka", sortingStr: "Neriak" },
  { name: "Neriak Commons", file: "neriakb", sortingStr: "Neriak" },
  { name: "Neriak Third Gate", file: "neriakc", sortingStr: "Neriak" },
  { name: "Nektulos Forest", file: "nektulos" },
  { name: "Oggok", file: "oggok" },
  { name: "The Feerrott", file: "feerrott" },
  // `steamfontmts` over the gazetteer's `steamfont`, same reasoning as `toxxulia`.
  { name: "Steamfont Mountains", file: "steamfontmts" },
  { name: "Ak'Anon", file: "akanon" },
  { name: "RunnyEye Citadel", file: "runnyeye" },
  // Fandom's name for `northro`, and the one the expansion lookup is keyed by. `nro` follows below.
  { name: "Northern Desert of Ro", file: "northro", sortingStr: "Ro" },
  { name: "East Commonlands", file: "ecommons", sortingStr: "Commonlands" },
  { name: "The Estate of Unrest", file: "unrest" },
  // EQ Legends' own zone, which no EverQuest gazetteer will ever carry — the supplied table lists
  // the label and admits it has no short name for it.
  { name: "New Sebilis Expedition", file: "newsebexp" },
  // The log's own wording: "You have entered EverQuest Legends Tutorial."
  { name: "EverQuest Legends Tutorial", file: "tutoriala" },
  /*
   * Zones a real log caught us visiting, each identified by its own exits (the neighbours a zone
   * links to are its fingerprint) — and all but `oot` since confirmed by the gazetteer:
   *
   *   kerraridge  to Toxxulia Forest — Kerra Isle's only neighbour, and 454 of 463 positions
   *               recorded there sit inside its lines. Named "Kerra Ridge" by both packs, which is
   *               why the log's "Kerra Isle" and the wiki's "Kerra Island" are aliases rather than
   *               the name shown: the map is the thing on screen.
   *   qeynos2     to Qeynos Hills, South Qeynos, the Catacombs, the Aqueducts
   *   qeynos      to North Qeynos, the Aqueducts, and the Erud's Crossing translocator
   *   qrg         to Qeynos Hills and Jaggedpine Forest
   *   freporte    to West Freeport, the Northern Desert of Ro, and a boat to Butcherblock/Ocean of
   *               Tears/Qeynos
   *   erudsxing   to Erudin and South Qeynos
   *   erudnext    to Erud's Crossing by boat, ferry and translocator, plus "Erudin City" — the
   *               outer city, where `erudnint` (exits: "Erudin") is the palace inside it
   *   butcher     to the Greater Faydark, South Kaladim, Dagnor's Cauldron and the Ocean of Tears.
   *               The game's own maps name it "The Butcherblock Mountains" unaided; Brewall's say
   *               "Butcherblock", which folds to neither the log's name nor that one.
   */
  { name: "Kerra Ridge", file: "kerraridge" },
  { name: "North Qeynos", file: "qeynos2", sortingStr: "Qeynos" },
  { name: "South Qeynos", file: "qeynos", sortingStr: "Qeynos" },
  { name: "Surefall Glade", file: "qrg" },
  { name: "East Freeport", file: "freporte", sortingStr: "Freeport" },
  { name: "Erud's Crossing", file: "erudsxing" },
  { name: "Erudin", file: "erudnext", sortingStr: "Erudin" },
  { name: "Butcherblock Mountains", file: "butcher" },
  /*
   * `oot` is the weaker one, stated because the alternative is silence: it carries no exit labels of
   * its own, so the neighbour test can't confirm it — but two files that *do* label their boats name
   * "The Ocean of Tears" (`butcher`, `freporte`), no other file claims that name, `oot` is the
   * standard short name, and the gazetteer agrees. Brewall ships `oceanoftears`, which its own labels
   * name, so this only matters for the game's own maps.
   */
  { name: "The Ocean of Tears", file: "oot" },
];

/**
 * Families the gazetteer can't name for us. It groups maps under a wiki *zone label*, which is a
 * family where the label is one place ("Freeport", "Neriak") and a slash-list where it isn't ("East
 * Karana / North Karana / …"). These are the slash-lists worth grouping in the picker; purely
 * cosmetic, so a missing one costs nothing but alphabetical order.
 */
const FAMILIES: Record<string, string> = {
  eastkarana: "Karana",
  northkarana: "Karana",
  southkarana: "Karana",
  nro: "Ro",
  sro: "Ro",
  guktop: "Guk",
  gukbottom: "Guk",
  commons: "Commonlands",
  soldunga: "Solusek",
  soldungb: "Solusek",
};

/**
 * How short is too short to be worth folding forever. Declared up here with the other dials rather
 * than beside its user, because the derived tables below are built at module load and a `const`
 * declared after them isn't initialised yet when they run.
 */
const MIN_ALIAS_LENGTH = 4;

/**
 * A wiki zone label that is a **name** rather than a heading: "Neriak" and "Kerra Island" are, while
 * "East Karana / North Karana / …" is a list and "Kelethin (Greater Faydark)" carries a gloss the fold
 * would strip to the wrong thing.
 */
const plainLabel = (zone: SuppliedZone): boolean => !zone.zone.includes("/") && !zone.zone.includes("(");

/** ...worth offering as an **alias**: it has to name exactly one map, or it means none of them. */
const usableLabel = (zone: SuppliedZone): boolean => zone.maps.length === 1 && plainLabel(zone);

/** ...worth using as a **family**: it names several maps, so it's the thing they have in common. */
const familyLabel = (zone: SuppliedZone): string | undefined =>
  zone.maps.length > 1 && plainLabel(zone) ? zone.zone : undefined;

/**
 * Every zone name we can state, with its file — **verified first, then the gazetteer's.**
 *
 * A file named twice keeps its first name; a *name* claimed by two files is settled downstream by
 * `zonesFromFiles`, which reserves it for whichever file the folder actually has and lets the other
 * fall back to its own name. That is what makes a second candidate free: `tox` and `toxxulia` are one
 * forest, and only the file on disk is ever offered.
 */
export const CURATED_ZONES: CuratedZone[] = buildCurated();

function buildCurated(): CuratedZone[] {
  const out = [...VERIFIED];
  const files = new Set(out.map((z) => z.file));
  for (const zone of SUPPLIED.zones) {
    for (const map of zone.maps) {
      const file = map.map_name?.trim().toLowerCase();
      // No short name means nothing to attach a map to — the source says so rather than inventing
      // one, and this keeps that promise.
      if (!file || files.has(file)) continue;
      files.add(file);
      const sortingStr = FAMILIES[file] ?? familyLabel(zone);
      out.push({ name: map.display_name, file, ...(sortingStr ? { sortingStr } : {}) });
    }
  }
  return out;
}

/** One name that means another: `alias` is a spelling in the wild, `canonical` is what we call it. */
export interface ZoneNamePair {
  alias: string;
  canonical: string;
}

/**
 * Every other name for a zone, paired with the one we show. `names.ts` folds both sides and builds
 * the lookup — see `ZONE_ALIASES` there for what an alias costs, and why the fold is where this ends
 * up rather than in a resolver.
 *
 * The canonical side is **the name this file already has**, so the gazetteer's own display name
 * becomes an alias wherever `VERIFIED` calls the place something else. Two filters:
 *
 *   - **Short forms are dropped** (under four characters). "EC", "SK", "OOT" and friends are player
 *     shorthand no source we read ever emits, and an alias is believed everywhere and forever, so
 *     they're cost without benefit.
 *   - **A wiki zone label counts only when it names one map.** "Freeport" covers three files and
 *     means none of them; "Kerra Island" covers one and is exactly the name we needed.
 *   - **A parenthesised spelling is dropped**, and this one is load-bearing: the fold reads a trailing
 *     parenthetical as a *ruleset tag* and strips it ("The Steamfont Mountains 2 (Adaptive)",
 *     [ADR 0057](../../../specs/decisions/0057-a-grade-is-not-an-identity.md)), so the table's
 *     `Qeynos (North)` folds to the key **`qeynos`** — and left in, it renamed the whole city to one
 *     of its halves, everywhere and forever. Each of these spellings is also listed unparenthesised
 *     ("North Qeynos", "Kelethin"), so nothing is lost by refusing them.
 */
export const ZONE_NAME_PAIRS: ZoneNamePair[] = buildPairs();

function buildPairs(): ZoneNamePair[] {
  const canonicalOf = new Map(CURATED_ZONES.map((z) => [z.file, z.name]));
  const pairs: ZoneNamePair[] = [];
  const add = (alias: string, canonical: string) => {
    const trimmed = alias.trim();
    if (trimmed.length < MIN_ALIAS_LENGTH) return;
    if (/[()]/.test(trimmed)) return; // folds to the name *outside* the brackets — see the note above
    pairs.push({ alias: trimmed, canonical });
  };

  for (const zone of SUPPLIED.zones) {
    for (const map of zone.maps) {
      const file = map.map_name?.trim().toLowerCase();
      const canonical = file && canonicalOf.get(file);
      if (!canonical) continue;
      add(map.display_name, canonical);
      for (const alias of map.aliases ?? []) add(alias, canonical);
      if (usableLabel(zone)) add(zone.zone, canonical);
    }
  }
  return pairs;
}
