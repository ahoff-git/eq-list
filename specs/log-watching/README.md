# Log watching

## Purpose
Turn the EverQuest Legends text log into a live stream of events — what you looted,
where you are, and what's hitting what — so the store can tick shopping-list items up
as they drop and the damage meter can show how the fight went.

## Responsibilities
- `src/shared/parse-line.ts` — **where text stops being text**. `splitLine` takes the
  timestamp off once, `parseLine` runs the matchers in cost order (combat first) and returns
  the single event a line produces, and every event carries a **`logId`** pointing back at
  its line. Nothing downstream re-reads a string. Before this, each parser re-split every
  line itself — up to seven times per line, which cost about as much as the whole parse does
  now. See [ADR 0019](../decisions/0019-parse-once-and-one-tracker.md).
- `src/shared/log-parser.ts` — a **pure** black box, one small matcher per line type
  (each takes an already-split `LogLine`):
  `parseLoot` (`--You have looted…--`, auto-sell, auto-store into a tradeskill depot,
  loot-and-combine — each reporting a `qty`, since a line can report a stack),
  `parseZone` (`You have entered <zone>.`), `parseXp`
  (`You gain [party] experience! (N%)`), `parseKill`
  (`You have slain X` / `X has been slain by Y`; player death is ignored),
  `parseLevel` (`You have gained a level! Welcome to level N!` — EQL puts both halves
  on one line, and the number is the only place the log states your level), and
  `parseCoin` (`You receive <coins> from the corpse.` / `…from that item.`) and
  `parseLogin` (`Welcome to EverQuest Legends!`). The tail of the coin line is the point of it:
  it's the only thing telling a mob's money from an auto-sold item's, and the two are counted
  separately — see [ADR 0047](../decisions/0047-money-is-copper-in-two-ledgers.md). The login line
  is the only mark in the log for **where one play session ends and the next begins** (12 of them
  in a fortnight's real log), which is what the damage history groups by; it's matched *after*
  `parseLevel`, whose "Welcome to level 14!" shares the opening words. See
  [ADR 0054](../decisions/0054-a-sitting-is-a-login.md).
  Timestamps are kept as the log's naive local wall clock (no zone offset).
  An **item's grade** (`Crushbone Belt +2`) and a **zone's difficulty and ruleset**
  (`The Steamfont Mountains 2 (Adaptive)`) are
  parsed out verbatim, unlike a spell's rank: they're the interesting part of the line, and the
  matching downstream folds them away where a name has to meet the wiki's, the map's or the list's
  (`src/shared/names.ts`, [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md)). "Downstream"
  includes the kill log and mob knowledge, which key by the folded zone so a camp is one camp
  however hard the door was set ([ADR 0059](../decisions/0059-a-zone-s-variants-are-one-zone.md)) —
  the record itself still says `Steamfont Mountains 2 (Adaptive)`.
- `src/shared/money.ts` — a **pure** black box beside the parser: coin in and out of copper,
  which is the canonical unit everywhere (1p = 10g = 100s = 1000c). Denominations exist only
  in its formatters, so nothing else has to normalise them.
- `src/shared/combat-parser.ts` — the same idea for combat, and the bulk of a real log:
  melee swings, spell/proc damage, damage shields, DoT ticks, misses and heals, plus the
  `(Critical)`/`(Riposte)` qualifier that trails *after* the sentence. It also follows the
  **casting lifecycle** — `cast` (`You begin casting X`) and `spell-outcome`
  (fizzle / interrupted / resisted / blocked) — which is what makes cast times and resist
  rates measurable at all, plus your own `death` (`You have been slain by X!`, which
  `parseKill` deliberately ignores), `buff-faded` (`Your [pet's] X spell has worn off.` —
  the pet flag matters, since a pet's buff can't change *your* totals), and the two combat
  **modes**: `stance` (`You assume an evasive stance.`) and `invocation` (`You begin
  reciting the empowering invocation.`). Only the *naming* line is usable — "You begin to
  change your stance." doesn't say which — and the names aren't enumerated, which is how
  "recovery" and "spellblade" showed up in real data without a code change. Modes matter
  because they change multipliers *and* cast times; see
  [ADR 0020](../decisions/0020-split-by-stance-and-invocation.md).
  Names are canonicalized so one thing is one row: `You`/`YOU` →
  `You`, articles folded, and a spell's trailing **rank** stripped (`spellName`), because
  EQL casts "Shock of Lightning VI" but damages "by Shock of Lightning". See
  [ADR 0014](../decisions/0014-damage-meter-from-the-log.md) and
  [ADR 0016](../decisions/0016-combat-history-and-spell-analytics.md).
- `electron/log-watcher.ts` — the side-effecting shell around the parser:
  - Polls the active file every 500ms and reads only newly-appended bytes.
  - Truncation-safe: if the file shrinks (new session / rotation) it resets.
  - Auto mode follows the most-recently-written `eqlog_*.txt`; or pin one file.
    A log that *appears while watching* (new session, or `npm run sim`) is read from the
    top so nothing is missed; a log we have **never** read is anchored at EOF, because
    there we can't tell news from history.
  - **Resumes where the last run stopped.** `electron/log-cursor.ts` keeps each log's read
    position in `log-cursors.json`, so whatever was written while the app was closed is read
    once, through the ordinary event path — the app's state is a function of the log, not of
    when it was launched. The position advances only after a batch is emitted and is written
    through immediately, so a crash costs a repeated batch at worst (and kills/drops are keyed
    by their line anyway). `onCaughtUp` reports the gap so `main.ts` can decide whether the
    live meter carries on (`isSameSitting`) or last night's fights belong to history.
    See [ADR 0044](../decisions/0044-the-log-position-outlives-the-app.md).
  - **Catches up on state, never on news.** Anchoring at EOF skips the two lines that say
    *where you are*, so a log about to be skipped has its tail scanned by `catchUpState`
    (`src/shared/log-catchup.ts`) for the current zone and last `/loc` — emitted on the
    ordinary `zone`/`loc` channels, with their own timestamps, so a mid-session start knows
    what a fresh one learns by zoning. Nothing else is recovered: no kills, loot, experience
    or casts. Runs on `start` and when following a log that already existed (a character who
    was logged in first), and the window grows 64KB → 512KB → 4MB until a zone line turns up.
    See [ADR 0043](../decisions/0043-state-is-not-news-either.md).
  - Splits each line **once** and fans the parsed result out by `event.kind`; the
    combat kinds are also emitted together as `combat`, so the meter takes one
    subscription. It never parses anything itself, and it numbers the lines it reads so
    every event carries a `logId`. **`stance` and `invocation` belong to that `combat` set** —
    they were missing from it, which meant the tracker never heard about a mode change and filed
    everything under "unknown", leaving [ADR 0020](../decisions/0020-split-by-stance-and-invocation.md)
    inert; see [ADR 0055](../decisions/0055-eating-a-log-fills-history.md).
  - Emits the split line itself on **`onLine`**, parsed or not — the channel for what the log says
    and no parser models, like "BunnySlayer invites you to a party". Free: `splitLine` has already
    run by then. See [ADR 0050](../decisions/0050-a-watch-can-read-a-whole-log-line.md).
- `main.ts` tracks the current zone from `zone` events and broadcasts it (overlay /
  status bar) and feeds `xp`/`kill`/`combat` into `combat-stats.ts` — the single session
  tracker — coalescing its snapshots before broadcast, since one poll can carry thousands
  of combat lines.
- `electron/combat-stats.ts` — **the** session tracker: experience-gain counts (solo /
  party) and kills, each gain credited to the mob that died in the last 15s (a heuristic;
  EQ never says which mob paid); per-combatant damage dealt /
  taken / healed, DPS over *active* combat time, max hit, accuracy and crits;
  **per-spell** casts / cast time / damage-per-second-of-casting / resist rate; and
  **per-mob** time-to-kill and experience rate, a per-second damage series, and a recap of
  what was hitting you before each death — for the current fight and the session. Spells are
  tallied **per invocation** and your melee **per stance**, since neither is comparable
  across a mode change ([ADR 0020](../decisions/0020-split-by-stance-and-invocation.md));
  the rows stay blended and the split is on hover. It also
  folds the two capitalizations EQ gives one name (`Obsolete model` / `obsolete model`)
  into a single row, which needs memory a per-line parser doesn't have. Fights are
  delimited by swings in **log time**, but a fight ends on a **death**, not a lull — a mob
  chases until dead, so a gap is tolerated (short once something's died, long while the enemy's
  still up; [ADR 0036](../decisions/0036-a-fight-ends-on-death-not-a-lull.md)). A replayed log
  meters exactly like a live one, and it keeps no past fights — it emits `fightEnd` and
  stays memoryless. See
  [ADR 0017](../decisions/0017-camp-efficiency-and-asking-the-player.md) and
  [ADR 0019](../decisions/0019-parse-once-and-one-tracker.md).
- `electron/hp-estimate.ts` — bounds on your **maximum hit points**, which the log never
  states: the floor is damage you survived in one unhealed stretch, the ceiling is damage
  that killed you from known-full health (an overheal on you, or a respawn). Heals, lulls,
  buff fades and level-ups invalidate windows, and the killing blow never counts as
  survived. Soft and overridable — see
  [ADR 0018](../decisions/0018-inferred-max-hit-points.md).
- `electron/xp-progress.ts` — percent into the current level: **the one figure the log
  can't give us**, so the player states it once, gains creep it forward, and a level-up
  resets it. Kept in its own file (not settings) because it changes on every kill, and it
  deliberately outlives a session reset — it's player state, not a session tally.
- `electron/combat-history.ts` — where finished fights go: a flat, bounded (1000) list on
  disk under userData, tagged by session, with sessions derived by grouping. Written as
  fights end (debounced) so a crash costs at most the fight in progress. A **session is a
  sitting**, started by the log's login line and keyed on its timestamp — so a restart mid-camp
  doesn't split the evening, and the same line read twice doesn't either. Each fight's **label**
  is recomputed on read from what your side damaged most, never trusted from the file, which is
  how fights stored under the old rule stop being titled after a group-mate. See
  [ADR 0054](../decisions/0054-a-sitting-is-a-login.md).
- `electron/log-import.ts` — **eating a log**: a **catch-up** that replays a whole past file
  through the same parser into every bucket that can take it — the kill log, combat history and
  the loot feed (and so mob knowledge and item prices, which derive from those). Fights go through
  a **tracker of its own** (never the live meter — that describes tonight), filed under the sitting
  the log's login lines mark out. Everything is keyed by the log line behind it, so re-eating a log
  — or eating one you watched live — lands each kill, drop and fight exactly once. Deliberately
  *not* fed: the live meter, experience and health (they describe the character now, not the one in
  an old log) and the shopping list (a curated to-do, not a record). A real 7.8MB log: 1,510 kills,
  1,077 drops, 560 fights across 12 sittings, 115 item prices — in ~330ms.
  See [ADR 0055](../decisions/0055-eating-a-log-fills-history.md) and
  [ADR 0033](../decisions/0033-eating-a-log-is-idempotent.md).
- **What ages out, and what never does.** Every store on disk is capped, but a cap on the kill log
  or the loot ledger is a cap on *evidence* — drop rates, roam areas and vendor prices are derived
  from them, so evicting a record used to un-learn what it taught (measured: the kill log filled in
  ~5 weeks, the loot feed in ~9 days). Both now **fold a record into a summary before dropping it**
  — `kill-log`'s `retired` observations behind `observations()`, `loot-log`'s `retired` prices
  behind `prices()` — so only detail ages out and the knowledge is permanent. **Clearing works the
  same way**: `clear()` retires the records on the way out and keeps everything they taught;
  `clear("everything")` is the only path that unlearns, and the UI only sends it after asking a
  second question. Combat history is the exception and stays lossy: a fight teaches nothing beyond
  itself. See [ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md).
- `electron/kill-log.ts` — where each kill happened and how much to believe it, plus what it
  dropped (attached as the loot lines arrive) and **who killed it**. The log reports every death
  in earshot, so a record knows whether it was yours; your own death isn't a kill and isn't
  stored, and a position fix only places kills in the zone it was taken in. See
  [ADR 0022](../decisions/0022-invocation-effects-and-kill-locations.md),
  [ADR 0023](../decisions/0023-kill-heatmap.md) and
  [ADR 0027](../decisions/0027-only-your-kills-count.md).
- `electron/mob-knowledge.ts` — drop rates and roam areas rolled up from **your own** kills
  (`killLog.observations()`, so a mob you killed past the cap still counts), pooled with peers'
  observations (stored apart from yours, always attributed). See
  [ADR 0024](../decisions/0024-mob-knowledge.md) and
  [ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md).
- `electron/loot-log.ts` — the always-on loot feed: every drop and what became of it, kept in the
  main process so the Loot tab is complete whenever it's opened, and **keyed by its log line** so a
  replayed gap can't file a drop twice. Per-item vendor prices are derived from the auto-sells in
  it, and a sale that leaves the feed leaves its price behind
  ([ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
- `src/shared/name-registry.ts` — one spelling per creature. EQ capitalizes a name at the start
  of a sentence, so the damage meter and the kill log would otherwise disagree about what a mob
  is called; both take their names from here.
- `src/shared/damage-tree.ts` — every hit as one **(victim, attacker, kind, source)** cell, plus
  the roll-ups the meter's drill-downs are drawn from. Flat cells rather than a stored tree,
  because both directions are wanted (who's taking it / what am I hitting) and a tree only reads
  one way round; rolling up on demand is what makes every level sum exactly to the one above it.
  The tracker fills it, the meter reads it, and the per-combatant by-skill/by-spell splits are
  *derived* from it rather than tallied twice. See
  [ADR 0053](../decisions/0053-damage-is-cells-rolled-up.md).
- Loot→list matching lives in the [store](../architecture/README.md), not here.

## Invocation side-effects
Two invocations do more than scale numbers, and both are now accounted for
([ADR 0022](../decisions/0022-invocation-effects-and-kill-locations.md)):

- **Divine** heals you off your own spell damage, and it **is** in the log — as a self-heal
  with **no spell named**, immediately after a spell lands:
  ```
  You hit a coyote for 12 points of cold damage by Blast of Cold.
  A coyote's skin goes numb.
  You healed Kainos for 8 hit points.        ← no "by <spell>": the invocation's doing
  ```
  Every heal we *can* attribute names its spell (`… for 20 hit points by Inner Fire`), so the
  absence is the signal. It's credited to the spell that triggered it (as `invocationHealed`,
  kept apart from a heal spell's own healing) and counted into `Per mana`, because that's what
  the mana bought. Measured on a real log: 242 health returned under divine.
- **Spell Blade** can trigger a free cast. There is **no message for it** — searched a whole
  log for one. The signature is a spell *landing with no cast in flight* **from a spell you
  actually cast**: that last clause matters, because damage shields and buff procs are
  castless by nature and counting them claimed 21 procs where the truth was closer to zero.
  Rate is procs ÷ swings while the invocation is up. Still unvalidated against a real proc —
  in the log to hand, spellblade was up for only 35 swings and nothing fired.

## Log format reference
- Location (default): `C:\Users\Public\Daybreak Game Company\Installed Games\EverQuest Legends\Logs`
- File: `eqlog_<Character>_<server>.txt`
- Example: `[Fri Jul 17 18:41:14 2026] --You have looted a Mote of Potential from an orc centurion's corpse.--`
- The player is `You` when acting and `YOU` when acted upon; pets are `<Owner>`s warder`
  (a **backtick**, not an apostrophe); damage is `N point[s] of damage` (singular at 1).
- The grammar in both parsers was read off a real log, and is verified by re-parsing a
  whole log and inspecting every line that *didn't* match — the cheapest way to notice
  the game has changed its wording. See [testing](../testing/README.md).

## Non-responsibilities
- Does not decide what counts as "wanted" — that's matching in the store.
- Parses loot, coin, zone, xp, kill, level, loc and combat lines today (combat including casts,
  spell outcomes, deaths, buff fades and mode changes). Still out of scope: faction hits,
  skill-ups, and buff/debuff *landings*.
- Does not decide **which corpse** a coin line's money came from — the line names none, so that
  guess lives in `electron/kill-log.ts` where the kills are
  ([ADR 0047](../decisions/0047-money-is-copper-in-two-ledgers.md)).
- Does not enable the EQ log itself — the user turns on logging in-game (`/log on`).

## See also
[architecture](../architecture/README.md) · [testing](../testing/README.md) ·
[ADR 0004](../decisions/0004-log-watching-strategy.md) ·
[ADR 0030](../decisions/0030-history-is-not-news.md) ·
[ADR 0043](../decisions/0043-state-is-not-news-either.md) ·
[ADR 0044](../decisions/0044-the-log-position-outlives-the-app.md) ·
[ADR 0047](../decisions/0047-money-is-copper-in-two-ledgers.md)
