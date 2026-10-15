/**
 * Quest pickups — quest items lying on the ground at a known spot, as the list and the map see them.
 *
 * The data is generated (`quest-pickups.generated.ts`, from eqlwiki's quest-page pickup tables);
 * this is the part that isn't: how a pickup is **named on the list**, and how one is found again from
 * a list entry. Both the map's pins and the Hunt tab go through `pickupFor`, so a pickup can only be
 * on the map while its entry is on the list
 * ([ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md)).
 *
 * **One entry per pickup, named `Item (Label)`** — "Rod (Azia)". The ten Rods share one in-game
 * name, and the list keys entries by name, so ten `Rod`s would fold into one line of "10 needed" that
 * can't say *which* you still lack. The label is what the wiki tells them apart by, and what the map
 * captions them with.
 */
import type { ItemSource, WikiPage } from "../types";
import { distinct } from "../sorting";
import {
  QUEST_NPCS,
  QUEST_PICKUPS,
  QUEST_PICKUPS_SOURCE,
  type QuestNpc,
  type QuestPickup,
} from "./quest-pickups.generated";

export { QUEST_NPCS, QUEST_PICKUPS, QUEST_PICKUPS_SOURCE };
export type { QuestNpc, QuestPickup };

/** The list entry a pickup is filed as. */
export function pickupEntryName(p: QuestPickup): string {
  return `${p.item} (${p.label})`;
}

const BY_ENTRY = new Map(QUEST_PICKUPS.map((p) => [pickupEntryName(p).toLowerCase(), p]));

/** The pickup behind a list entry, or `undefined` for anything else on the list. */
export function pickupFor(entryName: string): QuestPickup | undefined {
  return BY_ENTRY.get(entryName.trim().toLowerCase());
}

/** Every quest the dataset has pickups for, in the dataset's order. */
export const PICKUP_QUESTS: readonly string[] = distinct(QUEST_PICKUPS.map((p) => p.quest));

export function pickupsForQuest(quest: string): QuestPickup[] {
  return QUEST_PICKUPS.filter((p) => p.quest === quest);
}

/** The NPCs a quest sends you to, in the order its page names them (ADR 0293). */
export function npcsForQuest(quest: string): QuestNpc[] {
  return QUEST_NPCS.filter((n) => n.quest === quest);
}

/** `-1159, 2329` — the way `/loc` prints it, so it can be compared by eye. */
export function pickupLocText(p: { loc: QuestPickup["loc"] }): string {
  return [p.loc.y, p.loc.x, p.loc.z].filter((n) => n !== undefined).join(", ");
}

/**
 * Where an entry comes from, in the shape the wiki's sources take — so the Hunt tab's zone picker
 * offers the pickup's zone like any other (`sourceZones` reads `detail`). `ground` is a kind nothing
 * else produces, which keeps these out of `buildHunt`'s drop rows.
 */
export function pickupSources(entryName: string): ItemSource[] | undefined {
  const p = pickupFor(entryName);
  return p && [{ kind: "ground", where: `${p.label} at ${pickupLocText(p)}`, detail: p.zone }];
}

/**
 * A wiki quest page with its bundled pickups added as turn-ins.
 *
 * eqlwiki keeps these in a checklist and a Locations table that the page parser doesn't read as
 * turn-ins, so "Tarton's Wheel" arrived with none. With no turn-ins, **+ Add** put the quest's own name
 * on the list as an item: no rods, so no pins. Applied wherever a page is served, so the page view
 * lists the rods and adding the quest adds them, through the same path as any quest. Turn-ins the
 * parser did find are kept, and a pickup it already found isn't added twice.
 */
export function withQuestPickups(page: WikiPage | null): WikiPage | null {
  const pickups = page ? pickupsForQuest(page.title) : [];
  if (!page || !pickups.length) return page;
  const have = new Set(page.components.map((c) => c.name.toLowerCase()));
  const added = pickups.map((p) => ({ name: pickupEntryName(p), qty: 1 })).filter((c) => !have.has(c.name.toLowerCase()));
  return { ...page, kind: "quest", components: [...page.components, ...added] };
}

/**
 * A quest's pickups shaped as the quest page the list already knows how to add (`list.addFromPage`),
 * so they land grouped under the quest with its runs stepper, exactly as a wiki quest's turn-ins do.
 */
export function pickupQuestPage(quest: string): WikiPage {
  return {
    kind: "quest",
    title: quest,
    wikiPath: quest,
    sources: [],
    components: pickupsForQuest(quest).map((p) => ({ name: pickupEntryName(p), qty: 1 })),
    rewards: [],
    fetchedAt: QUEST_PICKUPS_SOURCE.scrapedAt,
  };
}
