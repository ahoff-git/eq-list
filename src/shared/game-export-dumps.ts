/**
 * game-export-dumps.ts — what's inside the game's `/outputfile` dumps, read into shapes a panel can
 * show. Pure: text in, rows out. The formats here are the ones the EQL client actually wrote
 * (2026-10-20), which differ from Live's documentation in places — each parser says where.
 */
import { itemBaseName, itemGrade } from "./names";

// ─── Inventory ──────────────────────────────────────────────────────────────

/** Where in the character's belongings a row sits. `elsewhere` catches locations not named here. */
export type InventoryArea = "worn" | "bags" | "cursor" | "bank" | "sharedBank" | "depot" | "hoard" | "storage" | "elsewhere";

/** Areas in the order a reader looks through them, with the heading each one gets. */
export const INVENTORY_AREAS: readonly { area: InventoryArea; label: string }[] = [
  { area: "worn", label: "Worn" },
  { area: "bags", label: "Bags" },
  { area: "cursor", label: "Cursor" },
  { area: "bank", label: "Bank" },
  { area: "sharedBank", label: "Shared bank" },
  { area: "depot", label: "Tradeskill depot" },
  { area: "hoard", label: "Dragon's hoard" },
  { area: "storage", label: "Storage" },
  { area: "elsewhere", label: "Elsewhere" },
];

/**
 * One filled socket. EQL's socket numbers are its socket *types* — 7 focus, 8 click, 9 worn, 10 proc,
 * 1/2 ornament — each opened by the host's grade (`EXALTATION_SOCKETS` in `items/exaltations.ts`).
 */
export interface InventorySocket {
  name: string;
  socket: number;
}

export interface InventoryItem {
  /** The dump's own location, e.g. `General 3-Slot5`. */
  location: string;
  area: InventoryArea;
  /** The top-level slot it is in or under (`General 3`, `Bank14`, `Fingers`), or its Storage tab. */
  slot: string;
  /** As the dump writes it, minus the trailing `*` marker. */
  name: string;
  /** Without its `+N` grade — the name the wiki and the shopping list use. */
  baseName: string;
  id: number;
  count: number;
  /** What's in this item's sockets (`(Exaltation)` rows on EQL), with which socket each is in. */
  sockets: InventorySocket[];
  /** True for a bag that sits in a bag/bank slot, so a view can show its contents under it. */
  container: boolean;
  /** For an item inside a bag: the bag's location. */
  inside?: string;
}

/**
 * Worn slot names. EQL writes `Any Slot` twice where Live has Charm and Power Source — it is gear
 * you're wearing, so it reads as worn.
 */
const WORN_SLOTS = new Set(
  ["Any Slot", "Charm", "Ear", "Head", "Face", "Neck", "Shoulders", "Arms", "Back", "Wrist", "Range", "Hands",
    "Primary", "Secondary", "Fingers", "Chest", "Legs", "Feet", "Waist", "Ammo", "Power Source"].map((s) => s.toLowerCase()),
);

/** A top-level location's area. Spacing varies (`General 1` vs `Bank1`), so the digits are optional-spaced. */
function areaOf(slot: string): InventoryArea {
  const s = slot.toLowerCase();
  if (WORN_SLOTS.has(s)) return "worn";
  if (/^general ?\d+$/.test(s)) return "bags";
  if (/^sharedbank ?\d+$/.test(s)) return "sharedBank";
  if (/^bank ?\d+$/.test(s)) return "bank";
  if (s === "held" || s === "cursor") return "cursor";
  if (s.includes("depot")) return "depot";
  if (s.includes("hoard") || s.includes("dragon")) return "hoard";
  return "elsewhere";
}

/**
 * The Storage window's tab for a key-ring kind, where the window and the dump disagree: the dump
 * says `Augmentation` for the tab the game shows as Exaltation (every entry is "… (Exaltation)").
 */
const STORAGE_TAB: Readonly<Record<string, string>> = { Augmentation: "Exaltation", Activated: "Activated items" };

/**
 * Areas the dump only carries when their window is open at the time — so their absence says
 * nothing about whether they are empty. Each with the window to open.
 */
export const CONDITIONAL_AREAS: readonly { area: InventoryArea; window: string }[] = [
  { area: "depot", window: "the Tradeskill Depot (at a banker), or tick Personal Depot in a tradeskill window" },
  { area: "hoard", window: "the Dragon's Hoard window" },
];

/** Areas whose top-level slots hold bags, so one `-SlotN` under them is a bag's contents, not a socket. */
const BAG_AREAS: ReadonlySet<InventoryArea> = new Set(["bags", "bank", "sharedBank", "elsewhere"]);

/**
 * An `/outputfile inventory` dump, occupied rows only.
 *
 * The main table is `Location/Name/ID/Count/Slots`. EQL then appends a second table under its own
 * `KeyRing Name ID` header — the Storage window's tabs, one row per entry, the first column naming
 * the tab (`Equipment`, `Augmentation` for Exaltation, `Activated`) — which Live's notes don't
 * mention. The depot (`Personal-DepotN`) and the hoard (`Hoard N`) appear only when their windows
 * were open (`CONDITIONAL_AREAS`).
 *
 * A `-SlotN` suffix means "inside": inside a bag for a bag/bank slot, or in an augment socket for
 * an item. Both can stack (`General 3-Slot1-Slot7` is the socket of the first item in bag 3).
 * Socketed items are folded onto their host rather than listed as belongings of their own.
 */
export function parseInventoryDump(text: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  const byLocation = new Map<string, InventoryItem>();
  let inKeyRing = false;

  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.split("\t");
    if (cols[0] === "Location" && cols[1] === "Name") continue;
    if (cols[0] === "KeyRing" && cols[1] === "Name") {
      inKeyRing = true;
      continue;
    }
    const name = (cols[1] ?? "").trim().replace(/\*$/, "").trim();
    if (!name || name === "Empty") continue;

    if (inKeyRing) {
      const kind = cols[0].trim() || "Other";
      const tab = STORAGE_TAB[kind] ?? kind;
      items.push(makeItem({ location: `Storage-${tab}`, area: "storage", slot: tab, name, id: Number(cols[2]) || 0, count: 1 }));
      continue;
    }

    const location = cols[0].trim();
    const parts = location.split("-Slot");
    const slot = parts[0];
    const area = areaOf(slot);
    const count = Number(cols[3]) || 1;
    const id = Number(cols[2]) || 0;
    const depth = parts.length - 1;
    const socketDepth = BAG_AREAS.has(area) ? 2 : 1;

    if (depth >= socketDepth) {
      // An augment: hang it on the item it is socketed into.
      const host = byLocation.get(location.slice(0, location.lastIndexOf("-Slot")));
      if (host) host.sockets.push({ name, socket: Number(parts.at(-1)) || 0 });
      continue;
    }

    const item = makeItem({ location, area, slot, name, id, count });
    if (depth === 1) {
      item.inside = slot;
      const bag = byLocation.get(slot);
      if (bag) bag.container = true;
    }
    byLocation.set(location, item);
    items.push(item);
  }
  return items;
}

function makeItem(base: Pick<InventoryItem, "location" | "area" | "slot" | "name" | "id" | "count">): InventoryItem {
  return { ...base, baseName: itemBaseName(base.name), sockets: [], container: false };
}

/** One place a counted item is in: an area (a Storage tab counts as its own), and which slots. */
export interface InventoryPlace {
  /** `Bags`, `Bank`, `Storage: Exaltation`… — Storage is one area but several windows in the game. */
  label: string;
  /** Where in it: a bag or bank slot's number, a worn slot's name; empty where there's no slot. */
  slots: string[];
  count: number;
}

export interface InventoryTotal {
  baseName: string;
  count: number;
  /** Where `count` is, in `INVENTORY_AREAS` order. */
  places: InventoryPlace[];
}

const AREA_LABELS = Object.fromEntries(INVENTORY_AREAS.map((a) => [a.area, a.label])) as Record<InventoryArea, string>;
const AREA_ORDER = Object.fromEntries(INVENTORY_AREAS.map((a, n) => [a.area, n])) as Record<InventoryArea, number>;

/** The place an item is in, as `InventoryPlace.label` names it. */
export function inventoryPlaceLabel(item: Pick<InventoryItem, "area" | "slot">): string {
  return item.area === "storage" ? `${AREA_LABELS.storage}: ${item.slot}` : AREA_LABELS[item.area];
}

/**
 * The slot an item is in, as a reader would say it: `3` for `General 3` / `Bank3` / `Hoard 3` /
 * `Personal-Depot3`, the slot's own name for worn gear, nothing for a Storage tab or the cursor.
 */
function slotText(item: Pick<InventoryItem, "area" | "slot">): string | undefined {
  if (item.area === "storage" || item.area === "cursor") return undefined;
  return item.slot.match(/(\d+)$/)?.[1] ?? item.slot;
}

/**
 * Everything the character owns, one line per item regardless of where it is or what grade —
 * "how many Bone Chips have I got?" Bags count as items; socketed augments don't.
 */
export function inventoryTotals(items: readonly InventoryItem[]): InventoryTotal[] {
  const totals = new Map<string, InventoryTotal>();
  for (const item of items) {
    const key = item.baseName.toLowerCase();
    const total = totals.get(key) ?? { baseName: item.baseName, count: 0, places: [] };
    total.count += item.count;
    const label = inventoryPlaceLabel(item);
    let place = total.places.find((p) => p.label === label);
    if (!place) {
      place = { label, slots: [], count: 0 };
      total.places.push(place);
    }
    place.count += item.count;
    const slot = slotText(item);
    if (slot && !place.slots.includes(slot)) place.slots.push(slot);
    totals.set(key, total);
  }
  const order = (label: string) => AREA_ORDER[INVENTORY_AREAS.find((a) => label.startsWith(a.label))?.area ?? "elsewhere"];
  for (const t of totals.values()) t.places.sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));
  return [...totals.values()].sort((a, b) => a.baseName.localeCompare(b.baseName));
}

// ─── Faction ────────────────────────────────────────────────────────────────

export interface FactionDumpRow {
  id: number;
  name: string;
  standing: number;
  pointsToMax: number;
}

/** An `/outputfile faction` dump: `ID/Name/StandingValue/PointsToMax`, one faction per row. */
export function parseFactionDump(text: string): FactionDumpRow[] {
  const rows: FactionDumpRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [id, name, standing, toMax] = raw.split("\t");
    if (!name || id === "ID") continue;
    const value = Number(standing);
    if (!Number.isFinite(value)) continue;
    rows.push({ id: Number(id) || 0, name: name.trim(), standing: value, pointsToMax: Number(toMax) || 0 });
  }
  return rows;
}

/**
 * The consider wording a standing earns, by the long-standing EQ thresholds. EQL's dump gives the
 * number but not the word, and the word is what a player recognises from `/con`.
 */
const CON_THRESHOLDS: readonly [number, string][] = [
  [1100, "Ally"],
  [750, "Warmly"],
  [500, "Kindly"],
  [100, "Amiably"],
  [0, "Indifferently"],
  [-100, "Apprehensively"],
  [-500, "Dubiously"],
  [-750, "Threateningly"],
];

export function factionConText(standing: number): string {
  return CON_THRESHOLDS.find(([floor]) => standing >= floor)?.[1] ?? "Scowls";
}

// ─── Achievements ───────────────────────────────────────────────────────────

export interface AchievementObjective {
  text: string;
  complete: boolean;
  /** For counting objectives, the `have/need` the dump appends (`1718/10000`). */
  progress?: { have: number; need: number };
}

export interface DumpAchievement {
  name: string;
  complete: boolean;
  objectives: AchievementObjective[];
}

export interface AchievementCategory {
  name: string;
  achievements: DumpAchievement[];
}

/**
 * An `/outputfile achievements` dump: a three-level tree by tab depth. A bare line is a category;
 * `C`/`I` then one tab is an achievement (complete / incomplete); then two tabs, one of its
 * objectives, with a counting objective's `have/need` in a trailing column.
 */
export function parseAchievementsDump(text: string): AchievementCategory[] {
  const categories: AchievementCategory[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cols = raw.split("\t");
    if (cols.length === 1) {
      categories.push({ name: raw.trim(), achievements: [] });
      continue;
    }
    const complete = cols[0] === "C";
    const category = categories.at(-1) ?? pushed(categories, { name: "Other", achievements: [] });
    if (cols[1]) {
      category.achievements.push({ name: cols[1].trim(), complete, objectives: [] });
      continue;
    }
    const achievement = category.achievements.at(-1);
    if (!achievement || !cols[2]) continue;
    const m = (cols[3] ?? "").match(/^(\d+)\/(\d+)$/);
    achievement.objectives.push({
      text: cols[2].trim(),
      complete,
      ...(m ? { progress: { have: Number(m[1]), need: Number(m[2]) } } : {}),
    });
  }
  return categories;
}

function pushed<T>(list: T[], value: T): T {
  list.push(value);
  return value;
}

// ─── Anything else ──────────────────────────────────────────────────────────

export interface DumpTable {
  header: string[];
  rows: string[][];
}

/**
 * A dump with no reader of its own (spellbook, missing spells, guild bank, recipes…) as a plain
 * table: the first line is the header when the file has more than one column, so it still shows.
 */
export function parseDumpTable(text: string, columns?: readonly string[]): DumpTable {
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split("\t").map((c) => c.trim()));
  // A header is all words (`RealEstateLocation  RealEstateName …`); a spellbook's first line is
  // `1  Blast of Cold`, which is data. A dump can be a header and nothing else — that's "none".
  const hasHeader = rows.length > 0 && rows[0].length > 1 && rows[0].every((c) => !/^-?\d+$/.test(c));
  if (hasHeader) return { header: rows[0], rows: rows.slice(1) };
  return { header: columns ? [...columns] : [], rows };
}

// ─── What you own, for the Items tab ────────────────────────────────────────

/** One place an owned item is, written for a reader: `Bank 14`, `Worn Fingers`, `Exaltation in …`. */
export interface OwnedPlace {
  text: string;
  count: number;
  /** True when what's there is the item's exaltation, not the item. */
  exaltation: boolean;
}

/** `Bank 14`, `Worn Fingers`, `Storage: Equipment` — an item's place as one phrase. */
export function inventoryPlaceText(item: Pick<InventoryItem, "area" | "slot">): string {
  const slot = slotText(item);
  return slot ? `${inventoryPlaceLabel(item)} ${slot}` : inventoryPlaceLabel(item);
}

const EXALTATION_RE = /\s*\(Exaltation\)$/i;

/**
 * Everything the character holds, keyed by the name an item page has — so the Items tab can answer
 * "which of *my* things fits this slot" and say where each one is.
 *
 * Grades fold (`Gnoll Slayer +3` is a Gnoll Slayer). An exaltation (`Minotaur Horn (Exaltation)`) is
 * the **base item's** exaltation, so it lands under `minotaur horn` too, marked as one — and where it
 * is socketed is the useful part, so a socketed one is placed by the item it's in.
 */
export function ownedItems(items: readonly InventoryItem[], key: (name: string) => string): Map<string, OwnedPlace[]> {
  const owned = new Map<string, OwnedPlace[]>();
  const add = (name: string, text: string, count: number) => {
    const exaltation = EXALTATION_RE.test(name);
    const k = key(itemBaseName(name.replace(EXALTATION_RE, "")));
    const places = owned.get(k) ?? [];
    const same = places.find((p) => p.text === text && p.exaltation === exaltation);
    if (same) same.count += count;
    else places.push({ text, count, exaltation });
    owned.set(k, places);
  };
  for (const item of items) {
    const where = inventoryPlaceText(item);
    add(item.name, where, item.count);
    for (const socket of item.sockets) add(socket.name, `in ${item.name} (${where})`, 1);
  }
  return owned;
}

/**
 * The best grade you hold of each item, keyed like `ownedItems` — what the Items tab weighs your copy
 * at (ADR 0312). Only items you hold graded are in it; an exaltation is an effect, not the item's grade.
 */
export function heldGrades(items: readonly InventoryItem[], key: (name: string) => string): Map<string, number> {
  const best = new Map<string, number>();
  for (const item of items) {
    if (EXALTATION_RE.test(item.name)) continue;
    const grade = itemGrade(item.name);
    if (!grade) continue;
    const k = key(item.baseName);
    if (grade > (best.get(k) ?? 0)) best.set(k, grade);
  }
  return best;
}

/** An owned item's places as one line: `Bank 14 · Exaltation in Gnoll Slayer +3 (Worn Secondary)`. */
export function ownedText(places: readonly OwnedPlace[]): string {
  return places
    // A socketed one says what it is ("Exaltation in …"); one in Storage's Exaltation tab already does.
    .map((p) => `${p.exaltation && p.text.startsWith("in ") ? "Exaltation " : ""}${p.text}${p.count > 1 ? ` ×${p.count}` : ""}`)
    .join(" · ");
}
