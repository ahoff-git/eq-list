# Neighbours — the other EQ Legends tools

Eleven projects solve overlapping problems for the same game and the same players. Several items in
[todo.md](./todo.md) and [ideas.md](./ideas.md) start "a neighbour does this", so this page is the
address book: what each one is, and **which file to open** when a note here says a thing exists.

Nothing is vendored and nothing is a dependency. Ten of the eleven are read by cloning them
(**EQLGS** is the exception — a website with no public repo, so it is read by browsing it):

```bash
git clone --depth 50 https://github.com/<owner>/<repo>.git
```

Paths are relative to each repo's root and were accurate on the 2026-08-12 read; these are active
projects, so treat a path that has moved as moved rather than as a mistake in the note that cites it.

A caution that applies to all of them: **EQ Legends is not classic EQ, and it is not Quarm.** Every
one of these tools carries data inherited from an older game, and each is explicit about the gap. So
are we — [ADR 0025](./decisions/0025-observation-over-the-wiki.md) is the same argument.

---

## EQBuddy — the session tracker

`DranakCorps-bot/EQBuddy` · C# / WPF + Avalonia · [github](https://github.com/DranakCorps-bot/EQBuddy)

The largest of them: an always-on-top widget over the log with DPS, spawn timers, buff and mez
timers, a quest tracker, watch rules, maps, travel, and session history in SQLite. Framework-neutral
logic in `Core` and `UI.Shared`, thin views over it — the same split as our `src/shared` vs `src/app`.

| Open this | For |
|---|---|
| `README.md` | The feature surface, at length. It is also the best writing in the space about *why* each feature is shaped the way it is |
| `CONTRIBUTING.md` | The shared-first rule, testing without the game, the log-privacy rule for fixtures, and a written-down non-goal (no ranking other players) |
| `src/EQBuddy.Core/FadeMessageCatalog.cs` | The hand-built map from wear-off flavor text to candidate spells — the problem `spells_us_str.txt` solves properly. Its doc comment is worth reading whole |
| `src/EQBuddy.Core/TrackedRule.cs` | Per-rule alert delay (`AlertDelaySeconds`, capped at 30 min; `IsCombatCue` is the short-cue-dies-with-you rule) and the regex path with its `RegexMatchTimeoutException` handling |
| `src/EQBuddy.Core/SpawnTimers.cs` · `SpawnCatalog.cs` · `SpawnOverrides.cs` | Seeded timers, observed tightening, and never overwriting a hand-typed value |
| `src/EQBuddy.Core/WatchRuleShare.cs` | The `EQB1` share string, and rebuilding a rule field-by-field on import |
| `src/EQBuddy.Core/WikiContribution.cs` · `DropsReport.cs` | "Copy for wiki" — observations formatted as a wiki contribution |

## eql-tooltip — the cursor lookup

`DavisChappins/eql-tooltip` · C# / WPF · [github](https://github.com/DavisChappins/eql-tooltip)

23 files doing one thing: hold a hotkey, OCR the item name at your cursor, show its eqlwiki
acquisition sections. The narrowest tool here and the most polished at its one job.

| Open this | For |
|---|---|
| `EqWikiOverlay/Wiki/EqlWikiProvider.cs` | `OcrVariants()` — the EQ-font confusion table (`rn`→`m`, `q`→`g`, `0`→`o`) applied *before* searching, and `NormalizedEditDistance()` for picking among search hits |
| `EqWikiOverlay/Core/TooltipReader.cs` | The two-pass read (tight tooltip box → wide box with description-window detection) and `PickItemName()`, which scores OCR lines by proximity to the cursor |
| `EqWikiOverlay/Wiki/WikiCache.cs` | Two-tier cache with a `format_version` column — the same idea as our `CACHE_VERSION`, arrived at separately |

## eql-log-reader — the overlay suite

`blastlaster/eql-log-reader` · Python / Tkinter, pure stdlib · [github](https://github.com/blastlaster/eql-log-reader)

The closest analogue to us: five always-on-top overlays (launcher, friends, DPS meter, session
report, Atlas) all tailing one log, no IPC because every tool just reads the same file. ~18.5k lines.

| Open this | For |
|---|---|
| `ARCHITECTURE.md` | Read this first. Design tenets, a source table, and a per-applet tour. Its "claims vs. observations" tenet is our ADR 0025 in someone else's words |
| `eql_spell_db.py` | Reading the game's own `spells_us.txt`; the docstring is a model of honest sourcing (which columns are stable, what's an estimate and why) |
| `eql_verified_spells.py` | Gating ~74k shipped spells down to what's obtainable at L1–50 |
| `eql_atlas_baseline.json.gz` + `eql_atlas_baseline_build.py` | The Quarm distillation — named spawn points, respawn timers, drop tables with percentages, zone adjacency — and the script that regenerates it |
| `eql_quest_db.json.gz` + `eql_quest_db_build.py` | ~3,300 item turn-ins parsed from Quarm quest scripts |
| `eql_quest.py` | `QuestState.confirmed` — the ✔-confirmed-on-EQL ratchet, promoted when logged NPC dialogue matches a quest's recorded success text |
| `eql_combat_tracker.py` | The shared combat parser, and `CombatTracker.unmatched` (a bounded deque) — surfaced by `show_unmatched()` in `eql_dps_meter.py` and the Diagnostics tab in `eql_session_report.py` |
| `eql_atlas.py` | The command channel: the `find`/`guide`/`quest`/`note` verbs and the lock model. `--demo` opens the whole Atlas on a synthetic Befallen |
| `eql_atlas_map.py` | `_nav_graph()` / `_nav_path()` — the in-zone A*, and the evidence that it paths along the drawn lines rather than over walkable space (see the todo item) |
| `eql_overlay_common.py` | The shared keel: log tailing, settings, themes, text-size presets |

## eql-info / EQL Spell Explorer — the spell file, decoded

`Amerzel/eql-info` · Python / Flask · [github](https://github.com/Amerzel/eql-info)

A browsable spell catalog built from the client's own files. Code only — no game data is committed.
Its value to us is one document.

| Open this | For |
|---|---|
| `SPELL_FORMAT.md` | **The reason this repo is on the list.** The 171-column `spells_us.txt` layout, derived by statistically diffing EQL's file against Live EverQuest's and the EQEmu 237-field reference. Establishes that EQL's format *is* Live's plus five trailing columns, with a full column map |
| `parse_spells.py` | A working parser for that format, usable standalone |
| `spa_data.py` · `skills_data.py` | The 485 SPA (spell-affect) names and the 77-skill table, lifted from EQEmu headers |
| `verified/*.txt` | Hand-verified per-class obtainable-on-EQL spell lists |

## everquest-legends-mcp — public sources, structured

`ArtSabintsev/everquest-legends-mcp` · TypeScript · [github](https://github.com/ArtSabintsev/everquest-legends-mcp)

A read-only MCP server over EQL's public sources — wiki, official news, eqlbuilds, and snapshots
extracted from a local client install. Not a competitor; a data layer, and a provenance model.

| Open this | For |
|---|---|
| `src/data/eql-client/manifest.json` | The provenance pattern: every source file with bytes, mtime and **sha256**, plus `extractedAt` and `extractorVersion` |
| `src/data/eql-client/zones.json` | A client-derived zone inventory — 192 map files' labelled POIs with x/y/z, and a `classicExpansionHint` per zone |
| `scripts/extract-eql-reference.mjs` · `extract-eql-client.mjs` | How the client install becomes a committed dataset |
| `docs/local-client-extraction.md` | The written procedure |
| `VERSIONING.md` | Conventional-commit-driven automatic releases, and the rule that humans never hand-edit the version |

## everquest-legends-companion — the planning app

`risadams/everquest-legends-companion` · Vite + React 19 + TS, PWA · [github](https://github.com/risadams/everquest-legends-companion) · live at [eql.quest](https://eql.quest)

A browser companion, not an overlay: 68 zones, class/AA/spell tables, a build advisor. No log
parsing at all. It renders the client's map geometry as parchment charts, which makes it the third
project to independently land on [ADR 0039](./decisions/0039-render-the-game-s-own-maps.md).

| Open this | For |
|---|---|
| `src/lib/maps.test.ts` | The data-integrity test shape: *every zone has imported map geometry*, then structural assertions over every file. This is the category we're missing |
| `src/lib/*.test.ts` | The rest of the same idea — cross-reference checks over committed data, not logic tests |
| `scripts/import-classdata.mjs` · `import-unbound-aas.mjs` | Harvests that **merge rather than overwrite**, with a documented precedence rule |
| `scripts/verify-*.mjs` | Headless-browser checks of the built app — a rung above our manual QA list |

## eqltools-companion — the site, as an overlay

`sowoky/eqltools-companion` · Electron · [github](https://github.com/sowoky/eqltools-companion) ·
companion to [eqltools.com](https://eqltools.com)

**The nearest thing to us on this list.** Electron, an always-on-top translucent overlay, quest-item
loot alerts, item tooltips, a zone browser that follows your character — and the same two hotkeys we
chose (`Ctrl+Shift+O` show/hide, `Ctrl+Shift+L` click-through), picked independently. The repo is an
*export* of a private one: `vendor/` and `data-snapshot/` are generated, and PRs against them are
refused. It runs the website's own `shared.js` verbatim so the app and the site can never disagree
about the same rules.

| Open this | For |
|---|---|
| `main.js` (`startInvWatch` / `pollInv`, ~line 285) | Watching for `/out inventory` dumps: the file lands in the EQ install dir — the **parent** of the `Logs` folder we tail — and is polled by path+mtime |
| `renderer/app.js` (the inventory tab, ~line 595) | The dump's actual format, validated against real play: TSV, `Location/Name/ID/Count/Slots`, CRLF, `Empty` placeholder rows, and the section matchers (`INV_SECTIONS`, `WORN_RX`) with their gotchas |
| `data-snapshot/` | How a wiki-derived dataset is baked in at export time rather than fetched |

## eql-alerts — GINA, rebuilt

`kpxcoolx/eql-alerts` · TypeScript + Tauri (Rust) · [github](https://github.com/kpxcoolx/eql-alerts) ·
[eqlalerts.com](https://eqlalerts.com)

Log triggers: match text or regex, fire a toast, a countdown timer, a sound, or a spoken callout.
A deliberate modern take on [GINA](https://quarm.guide/gina), and it imports GINA's `.gtp` packs.
The most direct overlap with our watches — read this one before building the alert items in
[todo.md](./todo.md).

| Open this | For |
|---|---|
| `README.md` — *"Self-only combat clocks"* | The best idea in it: zone-visible land emotes are gated on **having recently seen your own `You begin casting`** of that spell. Two correlated lines instead of a heuristic on one |
| `README.md` — *"EQL vs classic GINA timers"* + `samples/eql_permanent_buffs.json` | The EQL-specific trap: many classic short self-buffs are **permanent** on Legends, so their countdowns are simply wrong. A ready-made list |
| `src-tauri/src/engine.rs` | Matching, timers and early-enders; also where rank-aware duration scaling lands (unranked wiki base × roman rank) |
| `CHANGELOG.md` — v0.1.29 (2026-08-13) | The emote gate's **second half**: one shared `mesmerized` sentence resolved to Mesmerize / Mesmerization / Dazzle / Fascination and scaled by rank, and a pending cast **withdrawn** on a fizzle or a same-name kill rather than left to expire |
| `src-tauri/src/gina_import.rs` · `scripts/import_gina_gtp.py` | Reading the existing GINA trigger-pack corpus |
| `src-tauri/src/starter.rs` · `scripts/rebuild_eql_starter.py` | Shipping a curated starter library with everything but essentials disabled |
| `src-tauri/src/tts.rs` · `src/speech.ts` | Native OS TTS (macOS `say`, Windows SAPI) — they found Web Speech unreliable inside Tauri, which is a Tauri problem, not ours |

## eql-meter — the combat meter

`kpxcoolx/eql-meter` · TypeScript + Tauri (Rust) · [github](https://github.com/kpxcoolx/eql-meter)

Same author and shape as eql-alerts, pointed at combat: live fights, ability breakdown, overlay,
`/who all raid` roster, heals and loot tabs.

| Open this | For |
|---|---|
| `src-tauri/src/fight/mod.rs` (~735, ~975) | Pet→owner learning from three signals, the cleanest being a **pet engage tell** — `"Garn told you, 'Attacking … Master.'"` — which only ever reaches the pet's own owner, so receiving it is proof |
| same file, `looks_like_npc` guard | The bystander rule: *only you or your pet can open a fight*, so "Orc hits Bob" in an open-world camp never creates a fight named after a stranger. Our [ADR 0067](./decisions/0067-the-meter-counts-your-party-s-fights.md) from the other end |
| `src-tauri/src/parse/` | Damage-shield and proc attribution, both recent bug-fix areas for them |
| `src-tauri/src/parse/misc.rs` (`PET_LEADER`, `PET_CLAIM`, `PET_BERSERK`) | v0.1.28's **three further pet proofs**, added 2026-08-13: the `/pet who leader` answer (`"Jaber says, 'My leader is Kenkyo.'"` — names the *leader*, so it places a group-mate's pet, not only yours), the failed-wake tell (`"… 'I am unable to wake a skeleton, Master.'"`), and a pet-only buff landing (`You begin casting Burnout.` → `"Jabektik goes berserk."`, `is_pet_buff_spell`) |

## EQLGS — the gear search, and the era field we haven't got

`Convection` · Python/Flask, server-rendered · [eqlgs.net](https://eqlgs.net) · no public repo

The only neighbour on this list that is **a website rather than a program**, and the only one that is
a *data* neighbour rather than a feature one. It does one thing: find gear that fits a loadout —
filter by slot, up to three classes, item type and focus/worn effect, weight the stats you care
about, and rank what comes back. It is explicit that it is narrow, and points you at eqlwiki and
Allakhazam for everything else.

Read it for what it knows, not how it works. Four things, and the first two matter a great deal to
[lucy-data](./lucy-data/README.md):

| What | Why it matters here |
|---|---|
| **It is keyed on the same item ids as Lucy.** `/item/detail/1649` is the Loam Encrusted Bracelet, which is `lucy.allakhazam.com/item.html?id=1649`; its own Links tab offers "Lucy Item Information" | Our `LucyItem.id` is therefore already a **join key** to this site. Nothing has to be matched by name |
| **It has the era field Lucy hasn't.** An expansion badge per item (`/static/exp0.png` = Classic) *and* a hand-curated availability flag — hover text reads verbatim "Item is verified as available in EverQuest Legends" or "Item has not been verified as available…", with the item page carrying a `Verified` mark and a line saying "This item is dropped by an NPC" | This is [ADR 0124](./decisions/0124-lucy-is-a-second-opinion.md)'s weakest point answered outright by somebody who plays here. We *derive* era from drop zones and are often reduced to "unknown"; this states it. See [todo.md](./todo.md) |
| **Its zone names are already in our vocabulary, and its drop lists are EQL's.** For that bracelet it names **ten** elemental NPCs in `The Hole`, where Lucy names two in `Ruins of Old Paineel 2.0 (The Hole)` | Lucy's zone strings need a decoder (`lucy-era.ts`); these need none. And the drop list is this server's, not Live's |
| **`/zones` is an independent gazetteer** — ~60 in-era zones with their EverQuest short names in brackets, and it calls `qey2hh1` **The Western Plains of Karana** | A third independent confirmation of ADR 0076's most expensive fact. `qey2hh1` is West Karana, not the Qeynos Hills its own exit label claims |

Its changelog is also worth a read as a record of a fellow scraper's bruises — `Befallen is a good
example of this, as several items that were "added" on EQL were actually resident in the item database
just not attached to any NPC` is our ADR 0025 discovered from the other end.

Caveats before treating it as a source: **no public repo**, so there is nothing to clone and no
licence to read; the data is behind form POSTs and HTML, so it would be a scrape like Lucy's; the
availability flag is one person's curation rather than a measurement; and it says so itself —
`WARNING: Out of era items may be listed!` sits above its own results.

## eqdps — the Go one

`uija/eqdps` · Go · [github](https://github.com/uija/eqdps)

A DPS meter with **both** a TUI and a GUI over one set of parsers, plus a Plane of Sky quest tracker.
Notable for being the only non-JS, non-C# entry, and for tracking every engaged mob independently.

| Open this | For |
|---|---|
| `internal/combat/combat.go` (`EndReason`, `ForgetEnemies`) | Every fight records **why it ended** — a death, an `idle timeout`, or `enemies forgot you` — rather than just ending. Compare [ADR 0036](./decisions/0036-a-fight-ends-on-death-not-a-lull.md) |
| `internal/inventorysync/observer.go` | The third independent reader of `/out inventory`, here correlating a dump with the `/who` that identifies whose it is |
| `internal/skyquest/database.go` | A Plane of Sky tracker, as in EQBuddy — the second time this specific feature has been built |
| `internal/eqldb/`, `internal/updatecheck/`, `internal/xp/` | A clean small-module layout worth a glance |

## Which neighbour backs which item

The tables above go repo → file. This one goes the other way, for picking up a
[todo.md](./todo.md) item cold and wanting the prior art in front of you first.

| Item in `todo.md` | Read this, in this repo |
|---|---|
| OCR corrected before it is searched *(shipped — [ADR 0081](./decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md))* | `OcrVariants()`, `EqWikiOverlay/Wiki/EqlWikiProvider.cs` — **eql-tooltip** |
| An alert can be scheduled, not just raised | `TrackedRule.cs` (`AlertDelaySeconds`, `IsCombatCue`) — **EQBuddy** · `src-tauri/src/engine.rs` — **eql-alerts** |
| A watch can hold a regex, and can't hang the watcher | `TrackedRule.cs` (`RegexMatchTimeoutException`) — **EQBuddy** |
| A named's respawn is learned from your own kills | `SpawnTimers.cs` · `SpawnCatalog.cs` · `SpawnOverrides.cs` — **EQBuddy** · `eql_atlas_baseline.json.gz` — **eql-log-reader** |
| An alert can be spoken | `src-tauri/src/tts.rs`, `src/speech.ts` — **eql-alerts** · watch-rule speech in `README.md` — **EQBuddy** |
| The game's own data files | `SPELL_FORMAT.md` — **eql-info** · `eql_spell_db.py`, `eql_verified_spells.py` — **eql-log-reader** · `FadeMessageCatalog.cs` — **EQBuddy** |
| A Project Quarm baseline | `eql_atlas_baseline_build.py`, `eql_quest_db_build.py`, `ARCHITECTURE.md` §2 — **eql-log-reader** |
| A borrowed claim promoted to proven | `QuestState.confirmed` in `eql_quest.py` — **eql-log-reader** |
| Unmatched log lines *(shipped — [ADR 0079](./decisions/0079-an-unread-line-is-counted-by-its-shape.md))* | `CombatTracker.unmatched` in `eql_combat_tracker.py` — **eql-log-reader** |
| In-zone A\* (and why not) | `_nav_graph()` / `_nav_path()` in `eql_atlas_map.py` — **eql-log-reader** |
| Provenance manifests / client-derived datasets | `src/data/eql-client/manifest.json`, `scripts/extract-eql-reference.mjs` — **everquest-legends-mcp** |
| Data-integrity tests | `src/lib/maps.test.ts` — **everquest-legends-companion** |
| An item's era, stated rather than derived *(the open half of [ADR 0124](./decisions/0124-lucy-is-a-second-opinion.md))* | the expansion badge and "verified as available in EverQuest Legends" flag on `/item/search` — **EQLGS**, keyed on the same item ids we already hold |
| `/out inventory` | `main.js` (`pollInv`) + `renderer/app.js` (`INV_SECTIONS`, `WORN_RX`) — **eqltools-companion** · `internal/inventorysync/observer.go` — **eqdps** |
| Gate a shared emote on your own cast | `README.md` → *Self-only combat clocks*, then `CHANGELOG.md` v0.1.29 for the withdraw-on-fizzle half — **eql-alerts** |
| Permanent buffs on Legends | `samples/eql_permanent_buffs.json` — **eql-alerts** |
| Rank-aware costs *(shipped — [ADR 0080](./decisions/0080-the-game-s-own-spell-file.md))* | `src-tauri/src/engine.rs` — **eql-alerts** · `SPELL_FORMAT.md` — **eql-info** |
| A fight records why it ended *(shipped — [ADR 0078](./decisions/0078-a-fight-records-why-it-ended.md))* | `internal/combat/combat.go` (`EndReason`, `ForgetEnemies`) — **eqdps** |
| Pet proof and the bystander rule *(shipped — [ADR 0077](./decisions/0077-a-pet-is-proven-not-guessed.md); three further proofs are open in [todo.md](./todo.md))* | `src-tauri/src/fight/mod.rs` (~735, ~975, `looks_like_npc`) · `src-tauri/src/parse/misc.rs` — **eql-meter** |

Two items on this page have **no** prior art to read, and that's worth knowing before starting them:
the *command channel* in [ideas.md](./ideas.md) exists only in eql-log-reader's `eql_atlas.py`, and
nothing anyone has built reads a fade line back to its spell from `spells_us_str.txt` — EQBuddy hand-
maintains the mapping instead, so we'd be first.

## See also

[todo.md](./todo.md) `## From the neighbours` and `## From the neighbours, second pass` ·
[ideas.md](./ideas.md) · [wiki-data](./wiki-data/README.md) · [lucy-data](./lucy-data/README.md) ·
[ADR 0003](./decisions/0003-eqlwiki-runtime-data-source.md) ·
[ADR 0025](./decisions/0025-observation-over-the-wiki.md) ·
[ADR 0124](./decisions/0124-lucy-is-a-second-opinion.md)
