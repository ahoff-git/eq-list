/**
 * item-stats.ts — an item's stat card, read as numbers instead of as lines of text.
 *
 * Every item this app has ever opened is already on disk, and each carries an `ItemCard`: the
 * tooltip the wiki (or Lucy) prints, kept verbatim as `lines` because that is what a hover wants to
 * show. Verbatim is exactly wrong for a *search*, though — "is this the best wisdom ring I can
 * wear?" is a question about numbers, and `"WIS: +9 INT: +4 MANA: +25"` is a string.
 *
 * So this is the one place that turns a card into facts: which stats and how much of each, what it
 * fits, who can wear it, and what it's flagged. Pure and DOM-free — it is handed lines and returns
 * numbers, which is what makes it testable against real cards
 * ([testing](../../specs/testing/README.md)).
 *
 * **It reads what's there and invents nothing.** A card is a quotation from a source that describes
 * an older build ([wiki-data](../../specs/wiki-data/README.md)), so an absent stat is absent, never
 * zero: `stats.wis === undefined` means "this card didn't say", and every consumer here treats that
 * as *unknown* rather than as *none*. The one derived number is `ratio`, and only because dmg and
 * delay are meaningless apart — nobody compares two weapons by damage alone.
 *
 * The parsing is deliberately **table-driven and label-anchored**: a stat is found by looking for a
 * name we already know, not by matching "anything before a colon". The general form was tried and
 * it reads `Skill: 1H Slashing Atk Delay: 20` as a stat called "Slashing Atk Delay", which is how a
 * weapon quietly loses its delay. Adding a stat is one row in `STAT_ALIASES`.
 *
 * See [ADR 0152](../../specs/decisions/0152-an-item-search-is-a-filter-with-your-own-yardstick.md)
 * for what this is read *for*.
 */

/** One number an item can carry. The union is closed so a criteria/weight key can't be a typo. */
export type StatKey =
  | "ac"
  | "hp"
  | "mana"
  | "str"
  | "sta"
  | "agi"
  | "dex"
  | "wis"
  | "int"
  | "cha"
  | "svFire"
  | "svCold"
  | "svMagic"
  | "svDisease"
  | "svPoison"
  | "dmg"
  | "delay"
  | "ratio"
  | "backstab"
  | "haste"
  | "wt";

/** Which part of a card a stat comes from — the grouping every stat picker and weight editor uses. */
export type StatGroup = "defence" | "attribute" | "resist" | "weapon";

export interface StatMeta {
  key: StatKey;
  /** How the card itself writes it, so a column header matches what you hovered. */
  label: string;
  group: StatGroup;
  /**
   * True when *less is better* — delay and weight. Sorting still puts the biggest number first
   * (a column means one thing), but a value weight for one of these wants to be negative, and the
   * editor can only say so if the fact is recorded somewhere.
   */
  lowerIsBetter?: boolean;
  /** Fractional stats exist (WT: 1.5, a dmg/delay ratio); most don't. */
  places?: number;
}

/**
 * Every stat, in the order a card prints them: what it protects, what it adds, what it resists,
 * what it hits for. The order is the display order everywhere — one list, so the weight editor and
 * the results table can't disagree about where INT belongs.
 */
export const STATS: readonly StatMeta[] = [
  { key: "ac", label: "AC", group: "defence" },
  { key: "hp", label: "HP", group: "defence" },
  { key: "mana", label: "Mana", group: "defence" },
  { key: "str", label: "STR", group: "attribute" },
  { key: "sta", label: "STA", group: "attribute" },
  { key: "agi", label: "AGI", group: "attribute" },
  { key: "dex", label: "DEX", group: "attribute" },
  { key: "wis", label: "WIS", group: "attribute" },
  { key: "int", label: "INT", group: "attribute" },
  { key: "cha", label: "CHA", group: "attribute" },
  { key: "svFire", label: "SV Fire", group: "resist" },
  { key: "svCold", label: "SV Cold", group: "resist" },
  { key: "svMagic", label: "SV Magic", group: "resist" },
  { key: "svDisease", label: "SV Disease", group: "resist" },
  { key: "svPoison", label: "SV Poison", group: "resist" },
  { key: "dmg", label: "DMG", group: "weapon" },
  { key: "delay", label: "Delay", group: "weapon", lowerIsBetter: true },
  { key: "ratio", label: "Ratio", group: "weapon", places: 2 },
  { key: "backstab", label: "Backstab", group: "weapon" },
  { key: "haste", label: "Haste", group: "weapon" },
  { key: "wt", label: "Weight", group: "weapon", lowerIsBetter: true, places: 1 },
];

const STAT_BY_KEY = new Map<StatKey, StatMeta>(STATS.map((s) => [s.key, s]));

/** What a stat is called and how it behaves; every renderer asks here rather than hard-coding it. */
export function statMeta(key: StatKey): StatMeta {
  // A closed union means this is total; the fallback exists only so a value crossing IPC from an
  // older stored criteria can't throw a panel down.
  return STAT_BY_KEY.get(key) ?? { key, label: key, group: "attribute" };
}

/**
 * How each stat is spelled on a card, longest spelling first — the alternation is built in this
 * order, so `ATK DELAY` is claimed before a bare `DELAY` could take half of it.
 *
 * `ratio` has no entry: it is the one number no card prints.
 */
const STAT_ALIASES: readonly (readonly [StatKey, readonly string[]])[] = [
  ["svFire", ["SV FIRE", "SV FR"]],
  ["svCold", ["SV COLD", "SV CR"]],
  ["svMagic", ["SV MAGIC", "SV MR"]],
  ["svDisease", ["SV DISEASE", "SV DR"]],
  ["svPoison", ["SV POISON", "SV PR"]],
  ["delay", ["ATK DELAY", "DELAY"]],
  ["backstab", ["BACKSTAB"]],
  ["haste", ["HASTE"]],
  ["mana", ["MANA"]],
  ["dmg", ["DMG"]],
  ["ac", ["AC"]],
  ["hp", ["HP"]],
  ["str", ["STR"]],
  ["sta", ["STA"]],
  ["agi", ["AGI"]],
  ["dex", ["DEX"]],
  ["wis", ["WIS"]],
  ["int", ["INT"]],
  ["cha", ["CHA"]],
  ["wt", ["WT"]],
];

const ALIAS_TO_KEY = new Map<string, StatKey>();
for (const [key, spellings] of STAT_ALIASES) {
  for (const spelling of spellings) ALIAS_TO_KEY.set(spelling, key);
}

/**
 * `LABEL: number`, where LABEL is one we know.
 *
 * The leading boundary keeps `AC` from being found inside a word, and the trailing one keeps
 * `Skill: 1H Slashing` from reading as the number 1 — a digit glued to a letter is not a stat.
 * Whitespace inside a two-word label is flexible because the wiki writes both `SV Magic` and
 * `SV  MAGIC`.
 */
const STAT_LINE = new RegExp(
  `(?:^|[\\s(,])(${[...ALIAS_TO_KEY.keys()].map((a) => a.replace(/ /g, "\\s+")).join("|")})\\s*:\\s*([+-]?\\d+(?:\\.\\d+)?)(?![A-Za-z0-9.])`,
  "gi",
);

/** The classes EQ has, in the order a card lists them — what `Class: ALL` expands to. */
export const EQ_CLASSES: readonly string[] = [
  "WAR", "CLR", "PAL", "RNG", "SHD", "DRU", "MNK", "BRD", "ROG", "SHM", "NEC", "WIZ", "MAG", "ENC", "BST", "BER",
];

/**
 * Where an item can be worn.
 *
 * A vocabulary rather than only a set of strings read off `Slot:` lines, because one live page puts
 * the slot on a **bare line of its own** — `Primary`, with no label, as the last line of the card —
 * and without something to recognise it against, that weapon is the one item in the catalogue with
 * no slot at all and falls out of the slot filter entirely.
 */
export const EQ_SLOTS: readonly string[] = [
  "CHARM", "EAR", "HEAD", "FACE", "NECK", "SHOULDERS", "ARMS", "BACK", "WRIST", "RANGE", "HANDS",
  "PRIMARY", "SECONDARY", "FINGER", "CHEST", "LEGS", "FEET", "WAIST", "AMMO",
];

/** The playable races, likewise. */
export const EQ_RACES: readonly string[] = [
  "HUM", "BAR", "ERU", "ELF", "HIE", "DEF", "HFE", "DWF", "TRL", "OGR", "HFL", "GNM", "IKS", "VAH", "FRG", "DRK",
];

/** The "everyone" answers, shared rather than copied per item — see `parseItemStats`. */
const ALL_CLASSES: string[] = Object.freeze([...EQ_CLASSES]) as unknown as string[];
const ALL_RACES: string[] = Object.freeze([...EQ_RACES]) as unknown as string[];

/**
 * The flags worth filtering on, and every spelling of each the corpus actually contains.
 *
 * The variants are not hypothetical: `NO DROP`, `NODROP` and `No Trade` all appear, on pages written
 * years apart, and to a player they are one fact — "you cannot hand this to anyone". Folding them
 * here is what stops the filter offering the same flag three times.
 */
const FLAG_SPELLINGS: readonly (readonly [string, readonly string[]])[] = [
  ["MAGIC", ["MAGIC ITEM", "MAGIC"]],
  ["LORE", ["LORE ITEM", "LORE EQUIPPED", "LORE"]],
  ["NO DROP", ["NO DROP", "NODROP"]],
  ["NO TRADE", ["NO TRADE", "NOTRADE"]],
  ["QUEST", ["QUEST ITEM", "QUEST"]],
  ["TEMPORARY", ["TEMPORARY"]],
  ["ATTUNABLE", ["ATTUNABLE", "ATTUNEABLE"]],
  ["PLACEABLE", ["PLACEABLE"]],
  ["EXPENDABLE", ["EXPENDABLE"]],
];

export const ITEM_FLAGS: readonly string[] = FLAG_SPELLINGS.map(([flag]) => flag);

/**
 * A stated requirement to use the item: `Req Level: 30`, `Required Level: 49`, `Required level of 55.`
 *
 * The guards matter more than the pattern. The same words appear on **effect** lines, where they gate
 * the *effect* rather than the item — `Combat Effect: Knee Shot (Req Level 15)` is a level-15 proc on
 * an axe anybody can hold, and `Click Effect: Whirl Bolt (Must Equip) - Cast Time: 1.0 seconds,
 * Required Level: 46` is the same trap without the parentheses. Effect lines are skipped before this
 * is reached, and a line carrying a cast time is treated as one of them however it begins.
 */
const REQUIRED_LEVEL = /\bReq(?:uired)?\s*level\s*(?::\s*|of\s+)(\d+)/i;

/** A cast time means the line is describing a spell, whatever it starts with. */
const CASTING_LINE = /\bCast(ing)?\s*Time\b/i;

/**
 * Which kind of effect a line describes, from its label and its parenthetical.
 *
 * `Focus Effect:` and `Combat Effect:` say so outright. A bare `Effect:` does not, and the answer is
 * in the qualifier — see `EffectKind` for the shapes, measured across the catalogue.
 *
 * Anything unrecognised is a **click**, which is both the commonest kind and the safer default: it
 * is the one that says "there is a button here", and a worn effect mislabelled as a click sends the
 * reader to look for a button that isn't there — while a click mislabelled as worn would have them
 * believe they already had it.
 */
function effectKind(label: string, line: string): EffectKind {
  if (/^focus/i.test(label)) return "focus";
  if (/^combat/i.test(label)) return "proc";
  const qualifier = /\(([^)]*)\)/.exec(line)?.[1] ?? "";
  if (/\b(combat|proc)\b/i.test(qualifier)) return "proc";
  if (/\bworn\b/i.test(qualifier)) return "worn";
  return "click";
}

/**
 * A line that describes a spell, not the item's own condition.
 *
 * Flags are hunted across every line (they have no label of their own — `MAGIC ITEM LORE ITEM NO
 * DROP` is a whole line), so an effect named "Quest of Fire" would otherwise flag the item as a
 * quest item. Effect lines announce themselves, so they're skipped.
 */
const EFFECT_LINE = /^(Focus Effect|Combat Effect|Click Effect|Worn Effect|Effect)\s*:\s*(.+)$/i;

/** Everything a card says about one item, as facts rather than as text. */
export interface ItemStats {
  /**
   * The numbers the card printed. **Sparse on purpose**: a missing key means the card was silent,
   * which is not the same as a zero — see the module note.
   */
  stats: Partial<Record<StatKey, number>>;
  /** Where it's worn, uppercase (`["PRIMARY", "SECONDARY"]`). Empty for something you can't equip. */
  slots: string[];
  /** Who can use it, `ALL`/`ALL except …` already expanded. Empty means the card said `NONE`. */
  classes: string[];
  /** Likewise for race. */
  races: string[];
  /** `MAGIC`, `LORE`, `NO DROP`, … — folded to one spelling each (see `FLAG_SPELLINGS`). */
  flags: string[];
  /**
   * The level the card says you must be to **use** it, when it says so at all.
   *
   * Rare and authoritative: 19 of 11,155 item cards state one, and where they do it outranks anything
   * derived from where the item comes from — an item off a level-5 gnoll that says `Required level
   * of 46` is a level-46 item. See `REQUIRED_LEVEL` for the two lines it is *not* read from.
   */
  requiredLevel?: number;
  /** The weapon skill, as written (`1H Slashing`, `Piercing`, `Archery`). */
  skill?: string;
  /** `TINY` … `GIANT`. */
  size?: string;
  /** What it *does*, beyond its numbers — and how you get at it. See `EFFECT_KINDS`. */
  effects: ItemEffect[];
}

/**
 * How an item's effect is reached, which is the thing a player is actually choosing between.
 *
 * A worn haste and a clicky haste are not substitutes: one is free and permanent, one costs a button
 * press and a cooldown, and a proc is neither — it happens to you. Lumped into one "effects" list the
 * dropdown would be unusable, because the *kind* is most of what you are shopping for.
 *
 * Measured across 1,672 effect lines in the catalogue, the wiki writes the kind in the parenthetical:
 * `(Combat, …)` and `(Proc)` are procs, `(Worn)` is worn, `(Any Slot…)` and `(Must Equip…)` are
 * clickies, and `Focus Effect:` labels itself. `Must Equip` is a click that has to be equipped rather
 * than a fifth kind — you still press it.
 */
export type EffectKind = "worn" | "click" | "proc" | "focus";

export interface ItemEffect {
  /** The spell's name, as the card writes it — `Spell Haste I`, `Feet like Cat`. */
  name: string;
  kind: EffectKind;
}

/** The kinds in the order a picker offers them, with the word a reader uses for each. */
export const EFFECT_KINDS: readonly { key: EffectKind; label: string; blurb: string }[] = [
  { key: "worn", label: "Worn effect", blurb: "always on, just for wearing it" },
  { key: "click", label: "Click effect", blurb: "you press it — some need the item equipped" },
  { key: "proc", label: "Proc", blurb: "fires on its own in combat" },
  { key: "focus", label: "Focus", blurb: "improves your own spells" },
];

/**
 * A blank reading, for an item whose source gave no card at all.
 *
 * One shared frozen object rather than a fresh `{}` per card-less item: a thousand-row catalogue
 * would otherwise allocate a thousand identical empties, and every one of them would be a `useMemo`
 * dependency that changes on every render.
 */
export const NO_ITEM_STATS: ItemStats = Object.freeze({
  stats: Object.freeze({}) as Partial<Record<StatKey, number>>,
  slots: Object.freeze([]) as unknown as string[],
  classes: Object.freeze([]) as unknown as string[],
  races: Object.freeze([]) as unknown as string[],
  flags: Object.freeze([]) as unknown as string[],
  effects: Object.freeze([]) as unknown as ItemEffect[],
});

/**
 * Every number the card gave, in card order, as one readable line — "AC 2 · Mana 75 · STA -10".
 *
 * The results table's fallback column. Before any stat has been weighted or asked for there are no
 * numeric columns to show, and a table of names with nothing beside them is a table that hasn't
 * answered anything: this puts the item's own numbers in front of you so the first thing you see is
 * what there is to weight.
 */
export function statLine(stats: ItemStats): string {
  return STATS.filter((s) => stats.stats[s.key] !== undefined)
    .map((s) => `${s.label} ${stats.stats[s.key]}`)
    .join(" · ");
}

/**
 * Fold a wiki typo that would otherwise split one slot into two filter options.
 *
 * `SECONDAY` is on a live page today. A dropdown offering both spellings of the off-hand is a
 * dropdown that hides half the off-hand items behind the wrong one, so the single-character slips
 * are corrected — and only those. Anything else is left as the source wrote it.
 */
const SLOT_TYPOS: Record<string, string> = { SECONDAY: "SECONDARY", FINGERS: "FINGER", SHOULDER: "SHOULDERS" };

const SLOT_WORDS = new Set(EQ_SLOTS);

/**
 * A line that is *nothing but* slot names, and so is one — the unlabelled `Primary` described on
 * `EQ_SLOTS`. Deliberately all-or-nothing: a line has to be entirely slots to be read as slots, so
 * an effect or a flag that happens to contain the word can't be mistaken for one.
 */
function bareSlots(line: string): string[] {
  if (line.includes(":")) return [];
  const parts = tokens(line).map((t) => SLOT_TYPOS[t] ?? t);
  return parts.length && parts.every((t) => SLOT_WORDS.has(t)) ? parts : [];
}

const tokens = (text: string): string[] =>
  text
    .split(/[\s,/]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

/**
 * Read a `Class:` / `Race:` list, expanding the two forms that name a set rather than its members.
 *
 * `ALL except CLR PAL DRU SHM` has to become the other twelve classes, or "usable by a warrior"
 * can't be asked of it — which is the single most useful question anyone brings to an item search.
 */
function expandWhoList(text: string, everyone: readonly string[]): string[] {
  const parts = tokens(text);
  if (!parts.length || parts[0] === "NONE") return [];
  if (parts[0] !== "ALL") return parts;
  const except = new Set(parts.slice(parts[1] === "EXCEPT" ? 2 : 1));
  return everyone.filter((who) => !except.has(who));
}

/** The flags a line carries, longest spelling first so `LORE ITEM` isn't read as a bare `LORE`. */
function flagsIn(line: string): string[] {
  const upper = ` ${line.toUpperCase().replace(/[,]/g, " ")} `;
  const found: string[] = [];
  for (const [flag, spellings] of FLAG_SPELLINGS) {
    if (spellings.some((s) => upper.includes(` ${s} `))) found.push(flag);
  }
  return found;
}

/**
 * A card's lines, read as facts.
 *
 * Every line is offered to every reader rather than being classified first: the wiki prints stats,
 * slots and flags in an order that varies by page age, and a parser that assumed "line 3 is the
 * stats" would be wrong on a third of the corpus.
 */
export function parseItemStats(lines: readonly string[] | undefined): ItemStats {
  if (!lines?.length) return NO_ITEM_STATS;

  const out: ItemStats = { stats: {}, slots: [], classes: [], races: [], flags: [], effects: [] };
  const addAll = (into: string[], values: string[]) => {
    for (const v of values) if (!into.includes(v)) into.push(v);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const effect = EFFECT_LINE.exec(line);
    if (effect) {
      // "Feet like Cat (Combat, Casting Time: Instant) at Level 20" — the name is what precedes the
      // parenthetical, and the parenthetical is what says *how you get at it*.
      const name = effect[2].split(/\s*\(|\s+at Level\b/i)[0].trim();
      // 44 lines in the catalogue are a bare `Effect:` with nothing after it. A nameless effect is
      // not an effect.
      if (name && !out.effects.some((e) => e.name === name)) {
        out.effects.push({ name, kind: effectKind(effect[1], line) });
      }
      continue; // never scanned for stats or flags: a spell's words are not the item's (see EFFECT_LINE)
    }

    STAT_LINE.lastIndex = 0;
    for (let m = STAT_LINE.exec(line); m; m = STAT_LINE.exec(line)) {
      const key = ALIAS_TO_KEY.get(m[1].toUpperCase().replace(/\s+/g, " "));
      const value = Number(m[2]);
      // Two spellings of one stat on one line would be a malformed card; the first wins, since a
      // card reads top-to-bottom and left-to-right and so should this.
      if (key && Number.isFinite(value) && out.stats[key] === undefined) out.stats[key] = value;
    }

    const slot = /^Slot\s*:\s*(.+)$/i.exec(line);
    const named = slot ? tokens(slot[1]).map((s) => SLOT_TYPOS[s] ?? s) : bareSlots(line);
    if (named.length) addAll(out.slots, named);

    const klass = /^Class\s*:\s*(.+)$/i.exec(line);
    if (klass) addAll(out.classes, expandWhoList(klass[1], EQ_CLASSES));

    const race = /^Race\s*:\s*(.+)$/i.exec(line);
    if (race) addAll(out.races, expandWhoList(race[1], EQ_RACES));

    if (!CASTING_LINE.test(line)) {
      const required = REQUIRED_LEVEL.exec(line);
      // `Required level of 0` is the wiki saying there is no requirement, not a requirement of zero.
      const wanted = required ? Number(required[1]) : 0;
      if (wanted > 0 && out.requiredLevel === undefined) out.requiredLevel = wanted;
    }

    const skill = /\bSkill\s*:\s*([A-Za-z0-9][A-Za-z0-9 ]*?)(?=\s+Atk\b|\s*$)/i.exec(line);
    if (skill && !out.skill) out.skill = skill[1].trim();

    const size = /\bSize\s*:\s*([A-Za-z]+)/i.exec(line);
    if (size && !out.size) out.size = size[1].toUpperCase();

    addAll(out.flags, flagsIn(line));
  }

  /**
   * Most items say `Class: ALL` and `Race: ALL`, so most items end up holding an identical
   * sixteen-string array. Handing back the **shared** constant instead of a private copy costs
   * nothing here and saves 1.5 MB every time the catalogue crosses to a window: structured clone
   * preserves shared references, so eight thousand items pointing at one array send it once.
   *
   * Frozen at the source, so nobody can discover this by mutating one item's list and changing
   * everybody's.
   */
  if (out.classes.length === EQ_CLASSES.length) out.classes = ALL_CLASSES;
  if (out.races.length === EQ_RACES.length) out.races = ALL_RACES;

  // The only number nobody prints, and the only one anyone compares weapons by. Two places, because
  // the difference between a 1.75 and a 1.8 ratio is the whole argument.
  const { dmg, delay } = out.stats;
  if (dmg !== undefined && delay) out.stats.ratio = Math.round((dmg / delay) * 100) / 100;

  return out;
}
