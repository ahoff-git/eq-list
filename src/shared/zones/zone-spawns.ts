import { npcNameKey } from "../mob/named-mobs";
import { parseLevelClaim } from "../mob/levels";
import type { MobArea, MobKnowledge } from "../mob/mob-stats";

/** One mob known to spawn in a zone: from the zone page's roster, from kills there, or both. */
export interface ZoneSpawn {
  /** The roster's spelling when it lists the mob (it's the mob's page title), else the kill log's. */
  name: string;
  /** The roster's level text (`33-37`), absent for a mob only kills know. */
  level?: string;
  /** Named by the roster's spelling (`rosterNamed`); false for a mob only kills know. */
  named: boolean;
  /** Kills here, pooled with peers', and how many of them were yours. */
  kills: number;
  myKills: number;
  /** Where the kills put it, when they do. */
  area?: MobArea;
  /** False for a mob the roster doesn't list — the page is stale, or the mob is a pet or event. */
  onRoster: boolean;
}

/** The top of a spawn's roster level (`33-37` → 37), or 0 when the roster states none. */
export function spawnTopLevel(s: Pick<ZoneSpawn, "level">): number {
  return s.level ? (parseLevelClaim(`Level: ${s.level}`)?.high ?? 0) : 0;
}

/**
 * A roster row is a named when it has no indefinite article: the game and the wiki write a spawn as
 * "a froglok slave" and a named as "Raster of Guk" or "The Ghoul Lord". eqlwiki's `Category:Named
 * Mobs` (`isNamedMob`) can't answer this — it holds nearly every mob with a page. A kill's name has
 * already lost its article (`parseKill`), so it can't answer either.
 */
export function rosterNamed(name: string): boolean {
  return !/^an?\s/i.test(name.trim());
}

/**
 * A zone's known spawns: the wiki zone page's NPC roster (ADR 0163) joined with what killing things
 * there taught us (`mobs.all(zone)`), matched by `npcNameKey` so "A basilisk (Lower Guk)" meets the
 * log's "basilisk". A kill the roster doesn't list is still a spawn you've met, so it's kept.
 *
 * Ordered for a reader deciding what's here: named mobs first, then what's been killed most, then
 * the highest level, then by name.
 */
export function zoneSpawns(npcs: readonly { name: string; level: string }[], known: readonly MobKnowledge[]): ZoneSpawn[] {
  const byKey = new Map<string, ZoneSpawn>();
  for (const npc of npcs) {
    byKey.set(npcNameKey(npc.name), { name: npc.name, level: npc.level, named: rosterNamed(npc.name), kills: 0, myKills: 0, onRoster: true });
  }
  for (const k of known) {
    const key = npcNameKey(k.mob);
    const spawn = byKey.get(key) ?? { name: k.mob, named: false, kills: 0, myKills: 0, onRoster: false };
    spawn.kills += k.kills;
    spawn.myKills += k.myKills;
    spawn.area ??= k.area;
    byKey.set(key, spawn);
  }
  const top = spawnTopLevel;
  return [...byKey.values()].sort(
    (a, b) => Number(b.named) - Number(a.named) || b.kills - a.kills || top(b) - top(a) || a.name.localeCompare(b.name),
  );
}
