# 0215: A raceKill criterion reads the wiki's own mob card, off the log's own parsed kill

## Status

Accepted

## Context

"Kill 50 dwarves" doesn't fit either existing matcher. A `"watch"`/`"count"` criterion matches raw
text, so it can only reach a race whose name happens to sit inside the mob's own words — `"hill
giant"` and `"spider"` (ADR 0212, ADR 0214) work exactly because the species is spelled out in the
common name. Most humanoid trash isn't: `"a dwarven miner"` says dwarf, but `"Prak"`, `"Klok
Margar"`, `"Judge Monosty"` — named or generic NPCs across a dozen zones — say nothing about race in
the text a kill line prints. There is no sentence to watch for; the race is a *fact about the mob*,
not a word in the log.

The fact exists, though, and this repo already has a cache of it: every mob page's stat card states
its own `Race:` line (`wiki-data`'s `.mobStatsBox`/`.eql-mobpage-stats` parse), and `public/data/
wiki-cache` already ships 8,465 of them. A one-off scan turned up genuine density for a curated set
of playable races — Human (667 mob pages), Dark Elf (297), Erudite (218), Iksar (117, plus 187 more
under "Iksar Citizen"), Gnome (163), Dwarf (145), Troll (96), Ogre (97) — enough to make "kill 50" a
real, finishable target for each rather than a technicality.

Turning a kill line's name into a race needs the name *cleanly separated* from the rest of the
sentence, which is exactly the job `log-parser.ts`'s `parseKill` already does — into a `KillEvent`
with a `target` field, already consumed by `goal-tracker.ts` and `high-scores.ts`. Matching a
`"raceKill"` criterion off that structured field, rather than re-deriving a mob name from raw text a
second way, is the same reuse discipline ADR 0212 opened with: no new parser, only a new consumer of
one that already exists.

## Decision

**A `"raceKill"` criterion** — `{ kind: "raceKill", race: string, watch omitted, count?: {atLeast} }`
— is checked against a `KillEvent`, not a log line. `src/shared/mob-races.ts` looks the kill's
`target` up in a generated table (`mob-races.generated.ts`, `scripts/build-mob-races.mjs` — reads
the `Race:` line off every cached `kind: "mob"` page, no network fetch of its own) and compares it to
`race`, generously: `isRace("Iksar")` also matches `"Iksar Citizen"` and `"Spectral Iksar"`, the same
either-contains-the-other rule `goalWantsMob` already applies to a farming goal's mob target. A mob
the table has never heard of — added since the cache refreshed, or invented by this server — answers
`undefined` rather than a guess, so it simply doesn't count instead of counting wrong.

**A `"raceKill"` criterion always tallies**, sharing every rule a `"count"` criterion already has
(`AchievementProgress.tally`, a progress banner naming the running total below threshold, folding
into `done` the moment it crosses `count.atLeast`) — the two now differ only in *how* a kill is
recognised as counting, never in what the tracker does once it is. `electron/achievement-tracker.ts`
reflects that: `applyMatch`'s tallying branch is keyed on "does this kind tally" rather than
"`kind === "count"`" specifically.

**A new hook, `AchievementTracker.kill(event: KillEvent)`, fed from `watcher.onKill` in `main.ts`** —
the same event `goals.noteKill`/`scores.noteKill` already read, added as one more line beside them.
**Self-scoped by `event.killer === SELF`**, checked first and unconditionally, before the criterion
matcher ever runs — the log's own kill sentence already keeps a bystander's kill
(`"<name> has been slain by <killer>!"`) structurally apart from the player's own credit
(`"You have slain <name>!"`), and `parseKill` folds both into one event with a `killer` field stating
which; this is that field's one and only reader here. The same discipline ADR 0214 applied to a
cast — an achievement answers "did *I* kill this", never "did anything nearby die" — extended to the
one event kind that hadn't needed it yet.

**The race table is generated, not fetched live**, following the exact pattern
`zones/expansions.generated.ts` already set: a committed script (`scripts/build-mob-races.mjs`)
reads data this repo already ships, a hand-written module (`mob-races.ts`) holds the lookup rule
beside it, and nothing else imports the generated file directly. Raw and unfolded in the generated
table, the same "store raw, fold on read" split ADR 0083 already uses for a zone name — the fold
(case, whitespace) lives once, in the lookup, not duplicated into the generator.

**The player-facing achievement wizard does not expose `"raceKill"`**, for the same reason it
already excludes `"zone"` and `"highscore"` (ADR 0212): it depends on a generated table an author
can't see or extend from the create form, so it stays a tool this codebase uses to build stock
content.

Rejected alternatives:

- **A giant regex alternation of every mob name for a race, built into a `"watch"`/`"count"`
  criterion at library-load time.** Considered, since it would have needed no new criterion kind or
  event hook at all — but a race with a couple hundred mob pages produces a pattern that size, which
  is exactly the kind of thing ADR 0203's regex guard exists to be wary of, and re-deriving "which
  mobs belong to this race" as *text* when the wiki cache already states it as *data* is the
  duplication ADR 0212 was written to avoid in the first place.
- **Reading `combat.countsKill(event.target)`** (the same party-fight-scope gate `goal-tracker.ts`
  and the kill-streak high score use) instead of `event.killer === SELF`. That gate answers "was
  this really my fight", which matters for a *streak* that a stranger's kill at a busy camp could
  otherwise inflate — a question a `"raceKill"` tally doesn't have, since `killer === SELF` already
  means the game itself credited the kill to the player. Adding it would have meant a new dependency
  from the achievement tracker into `combat-stats.ts` for a distinction this feature doesn't need.

## Consequences

- `src/shared/mob-races.generated.ts` is committed and sizeable (7,790 entries) — regenerate it with
  `node scripts/build-mob-races.mjs` whenever the wiki cache refreshes and a race-based achievement
  wants a mob it doesn't have yet; nothing regenerates it automatically.
- A `"raceKill"` achievement is only as good as the wiki cache's own `Race:` field — a handful of
  pages state something unusable (`"?"`, `"N/A"`, `"Need Info"`, a comma-joined guess) and are
  skipped by the generator rather than filed under a nonsense key.
- The self-only rule now covers all three ways a criterion can watch the log (line, cast/fade, kill),
  which is the property worth re-checking first if achievements content is ever extended past these.

## See also

[0212](./0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md) ·
[0214](./0214-a-counted-criterion-tallies-and-a-cast-criterion-is-always-yours.md) ·
[0027](./0027-only-your-kills-count.md) ·
[0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md) ·
[0203](./0203-a-regex-condition-refuses-its-own-danger.md)
