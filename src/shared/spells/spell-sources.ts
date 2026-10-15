/**
 * Where a spell comes from — a vendor, a quest, a drop, research — as the Spells tab shows and sorts it.
 *
 * The data is generated (`spell-sources.generated.ts`, from every spell page's `where_to_obtain`,
 * [ADR 0296](../../../specs/decisions/0296-spell-sources-are-generated-static-data.md)); this is the
 * part that isn't: what each kind is called, and what order puts the spells you have to *go and do
 * something for* first. A spell can be several kinds at once; one the wiki says nothing about has no
 * entry at all, which reads as "—", not as "vendor".
 */
import { SPELL_SOURCES, type SpellSourceEntry, type SpellSourceKind } from "./spell-sources.generated";

export type { SpellSourceEntry, SpellSourceKind };

const KIND_LABEL: Record<SpellSourceKind, string> = {
  quest: "Quest",
  research: "Research",
  drop: "Drop",
  vendor: "Vendor",
  other: "See wiki",
};

const BY_TITLE = new Map(Object.entries(SPELL_SOURCES).map(([title, s]) => [title.toLowerCase(), s]));

/** How the wiki says this spell is obtained, or `undefined` when its page doesn't say. */
export function spellSource(title: string): SpellSourceEntry | undefined {
  return BY_TITLE.get(title.toLowerCase());
}

/** `"Quest"`, `"Drop · Quest"` — the kinds alone; the quest names are links, so the table draws those. */
export function sourceKindsLabel(source: SpellSourceEntry): string {
  return source.kinds.map((k) => KIND_LABEL[k]).join(" · ");
}

/**
 * Sorting rank: a spell **only** a quest gives you (Ice Comet, Tashania) first, then one a quest is
 * one way to (the Kunark 50+ spells, which also drop), then research, drops, vendors. Within a rank,
 * by quest, so one quest's spells sit together.
 */
function rank(source: SpellSourceEntry): number {
  if (source.kinds.includes("quest")) return source.kinds.length === 1 ? 0 : 1;
  if (source.kinds.includes("research")) return 2;
  if (source.kinds.includes("drop")) return 3;
  if (source.kinds.includes("vendor")) return 4;
  return 5;
}

/** What a spell is worth in a Source sort; `undefined` (sorted last) when the wiki doesn't say. */
export function spellSourceSortValue(title: string): string | undefined {
  const source = spellSource(title);
  return source && `${rank(source)} ${(source.quests?.[0] ?? "").toLowerCase()}`;
}
