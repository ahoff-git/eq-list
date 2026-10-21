/**
 * The control window's two-level navigation: a handful of **areas** along the top, each holding the
 * **sections** that used to be tabs of their own
 * ([ADR 0320](../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 *
 * A section keeps its old tab key, so the trail (`nav.tab`), every `openTab("peers")` caller and every
 * remembered place still mean what they did — an area is derived from the section showing, never
 * stored as a second answer to where the window is (ADR 0173).
 *
 * Areas are grouped by what you are doing, not by what the data is: watching the fight (Now), working
 * the list, looking something up, checking yourself, crafting, or reading back what happened.
 */
export type AreaKey = "now" | "list" | "find" | "character" | "craft" | "history" | "settings";

export interface AreaDef {
  key: AreaKey;
  label: string;
  /** Section keys, in the order the section row shows them. The first is the area's default. */
  sections: readonly string[];
}

export const AREAS: readonly AreaDef[] = [
  // Everything that is running or running out — the one area worth a glance mid-fight.
  { key: "now", label: "Now", sections: ["overview", "buffs", "timers", "goals", "achievements", "alerts"] },
  // The list, and the same list read as where to go for it.
  { key: "list", label: "List", sections: ["list", "hunt"] },
  // Looking something up: a page by name, an item by shape, a spell, a stance, an AA.
  { key: "find", label: "Find", sections: ["search", "items", "spells", "stances", "aa"] },
  // You, as your exports describe you: what you carry and where, and who likes you.
  { key: "character", label: "Character", sections: ["exports", "faction"] },
  { key: "craft", label: "Craft", sections: ["tradeskills"] },
  // What already happened: fights, the evening's rates, what dropped.
  { key: "history", label: "History", sections: ["combat", "session", "loot"] },
  // Places you go to decide something and leave — the room you share with is one of them.
  { key: "settings", label: "Settings", sections: ["settings", "peers"] },
];

/** The area a section belongs to, or undefined for a key no area has (a section since dropped). */
export function areaOf(section: string): AreaDef | undefined {
  return AREAS.find((a) => a.sections.includes(section));
}

/**
 * The section to open when an area is picked: the one you last had open there, so coming back lands
 * where you left it — else its first usable section, else its first.
 */
export function sectionToOpen(area: AreaDef, remembered: Readonly<Record<string, string>>, usable: (section: string) => boolean): string {
  const last = remembered[area.key];
  if (last && area.sections.includes(last) && usable(last)) return last;
  return area.sections.find(usable) ?? area.sections[0];
}
