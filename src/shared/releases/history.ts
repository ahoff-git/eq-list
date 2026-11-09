/**
 * history.ts — what the app did before release notes existed, newest first, rebuilt from the project's own log
 * (commits, and the dated decision records beside them).
 *
 * This is **not** the changelog and is never announced: every install is on `0.1.x`, so a numbered note for
 * something they already have would tell them it was new. It is read, under "Before release notes" in Settings →
 * What's new. See `HistoryNote`, and
 * [ADR 0374](../../../specs/decisions/0374-history-before-release-notes-is-read-never-announced.md).
 *
 * It is written to be less detailed the further back it goes: the last week is feature by feature, the autumn is
 * month by month, and the first months are a paragraph. Nothing is added here any more — new changes are release
 * notes (`changelog.ts`); this only ends where those begin, and `changelog.test.ts` checks that it does.
 */
import type { HistoryNote } from "./release-notes";

export const HISTORY: readonly HistoryNote[] = [
  {
    from: "2026-11-01",
    to: "2026-11-07",
    title: "Loadout goals, and advice from your fights",
    changes: [
      { kind: "new", text: "Loadout goals are sliders: say what matters — health, AC, mana, melee damage — and the planner turns it into weights for you." },
      { kind: "new", text: "A goal can be a floor: once it is reached the planner stops chasing that stat and spends everything else on the rest." },
      { kind: "new", text: "The planner suggests more resists, armour, mana or health after fights you took heavy damage in, ran dry in, or died in — and says how to survive the next one." },
      { kind: "new", text: "When you win comfortably, a damage-first loadout suggests trading some survivability for more damage." },
      { kind: "new", text: "Item pages say which of your peers have the item, with counts." },
      { kind: "better", text: "The loadout can leave your own gear out, to plan what you would hunt for. Stones narrow down the item they go into when planning sockets." },
      { kind: "better", text: "The spawn board learns from your whole kill history." },
    ],
  },
  {
    from: "2026-10-26",
    to: "2026-10-31",
    title: "A search bar in the frame, and loadouts for peers",
    changes: [
      { kind: "new", text: "Search is a bar in the frame of every screen, with autocomplete from your recent picks, and a palette to jump to any tab." },
      { kind: "new", text: "Plan a loadout for a peer who shares their inventory." },
      { kind: "new", text: "Fight search finds any combatant and shows trends across your fights." },
      { kind: "new", text: "Damage tables show resists and avoidance, and debuffs show how often they landed against how often they were resisted." },
      { kind: "new", text: "Item pages say how many you have, by place, and how old your inventory dump is." },
      { kind: "new", text: "A zone page opens the map and lists the spawns and items known there; zone names link to it everywhere." },
      { kind: "better", text: "Weapons are weighed by what they hit for in the hand, haste and proc damage included." },
      { kind: "better", text: "A travel graph now ships with the app, so routes work without building one first." },
    ],
  },
  {
    from: "2026-10-20",
    to: "2026-10-25",
    title: "Best in slot, and seven areas",
    changes: [
      { kind: "new", text: "Best in slot: the planner picks the best item for each slot by your own weights, from what you hold and what you could hunt — with locks, wanted effects, benched items and saved presets. HP, mana and AC count through the stats that make them." },
      { kind: "better", text: "The twenty tabs are grouped into seven areas, the status bar doubles as a way in, and every table sorts by every column." },
      { kind: "new", text: "Search's one box also finds what you hold, stances and AAs." },
      { kind: "new", text: "Upgraded items and spells are shown and counted at their upgraded level, with a slider to compare grades." },
      { kind: "new", text: "Peers can share their inventory live, tradeskill guides count what you and sharing peers already hold, and every inventory export is kept." },
      { kind: "new", text: "Rare creatures are tracked when the game says they are rare, any mob you have killed has a page, and mob locations come from your kills and your peers'." },
      { kind: "better", text: "The Crafting log is its own section." },
      { kind: "fixed", text: "A broad sweep of fixes: tradeskill steps and costs, faction standings, loot parsing (Reward Chests, identical drops), spawn timers, and half-written log lines." },
    ],
  },
  {
    from: "2026-10-01",
    to: "2026-10-19",
    title: "Self-updating, long quests and spells",
    changes: [
      { kind: "new", text: "The app updates itself: it downloads new builds in the background and offers a restart." },
      { kind: "new", text: "Long multi-zone quests become step-by-step plans, with quest pickups, NPC pins on the map, and sightings of NPCs you never kill." },
      { kind: "new", text: "Tradeskill guides follow your skill and say what a section costs and where to buy it. Log search finds lines in your EverQuest log." },
      { kind: "new", text: "A spell says how to get it and which classes can cast it; the spell list uses the game's own categories and keeps out what is past the live level cap." },
      { kind: "better", text: "A fight lasts until everything in it is dead or charmed, resist rates count every cast that reached a target, and bards' songs are tracked." },
      { kind: "new", text: "A peer's drop of an item you both track can celebrate on your overlay, and faction-cause evidence is pooled across peers." },
      { kind: "fixed", text: "A big log backlog can no longer freeze the app at startup." },
    ],
  },
  {
    from: "2026-09-01",
    to: "2026-09-30",
    title: "Goals, achievements, factions and the game clock",
    changes: [
      { kind: "new", text: "A game clock that runs forward from your /time readings, calibrates its own pace and can be shared with peers." },
      { kind: "new", text: "Timeboxed goals and streak goals for farming sessions." },
      { kind: "new", text: "Achievements that watch your log — counted and custom criteria included — and stay quiet during replayed gaps." },
      { kind: "new", text: "Faction tracking: standings from the log, race-unlock guides, a guess at what caused each hit, and corrections for when you know your true total." },
      { kind: "new", text: "A floating damage meter and a debuff tracker for crowd control; healing is tracked, and overlapping fights with your party are merged." },
      { kind: "new", text: "A spell catalogue, plus stances and invocations and AAs, each with its own tab, and named spawns marked on the map." },
      { kind: "better", text: "Kills, loot, fights and faction moved to a database with unlimited history, and every table gets a pager and a column menu." },
    ],
  },
  {
    from: "2026-08-01",
    to: "2026-08-31",
    title: "Maps, alerts, timers and the room",
    changes: [
      { kind: "new", text: "Maps drawn from your game's own map files, with floors, pins, and a graph of zone lines that works out routes between zones." },
      { kind: "new", text: "Cast alerts you write as rules — a library of stock rules, testing against your log, sharing, styles you place on screen, and scheduled alerts — plus loot alerts for items on your list." },
      { kind: "new", text: "Spawn timers learned from your kills, high scores, and countdowns pinned to the overlay." },
      { kind: "new", text: "Sessions and fights tracked from the log, in-game money in two ledgers, and buffs and debuffs followed until they fade." },
      { kind: "new", text: "Item pages say who drops each item, with a second opinion from Lucy's data on names and era; a setup check finds what is wrong with your install." },
      { kind: "new", text: "The peer room: share your location, rules and observations; public wiki pages are shared by default." },
    ],
  },
  {
    from: "2026-07-22",
    to: "2026-07-31",
    title: "EQ List becomes a desktop overlay",
    changes: [
      { kind: "new", text: "A translucent, always-on-top window that watches your EverQuest log and lights up when something on your list drops." },
      { kind: "new", text: "Screengrab lookup: drag a box over an item name on screen and it is read and searched. Pages open inside the app, with back and forward." },
      { kind: "new", text: "A peer room, a map window, a damage meter, and an installer built automatically on every change." },
    ],
  },
  {
    from: "2025-08-10",
    to: "2026-01-12",
    title: "A web page for farming lists",
    changes: [{ kind: "new", text: "The first version: an EverQuest-themed web page listing items and monsters as grids with checklists, several item sources and recipe selection." }],
  },
];
