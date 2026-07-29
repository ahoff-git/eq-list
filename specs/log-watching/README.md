# Log watching

## Purpose
Turn the EverQuest Legends text log into a live stream of events — what you looted,
where you are, and what's hitting what — so the store can tick shopping-list items up
as they drop and the damage meter can show how the fight went.

## Responsibilities
- `src/shared/log-parser.ts` — a **pure** black box, one small parser per line type:
  `parseLogLine` (loot: `--You have looted…--`, auto-sell, auto-store into a tradeskill
  depot, loot-and-combine — each reporting a `qty`, since a line can report a stack),
  `parseZoneLine` (`You have entered <zone>.`), `parseXpLine`
  (`You gain [party] experience! (N%)`), `parseKillLine`
  (`You have slain X` / `X has been slain by Y`; player death is ignored), and
  `parseLevelLine` (`You have gained a level! Welcome to level N!` — EQL puts both halves
  on one line, and the number is the only place the log states your level).
  Timestamps are kept as the log's naive local wall clock (no zone offset).
- `src/shared/combat-parser.ts` — the same idea for combat, and the bulk of a real log:
  melee swings, spell/proc damage, damage shields, DoT ticks, misses and heals, plus the
  `(Critical)`/`(Riposte)` qualifier that trails *after* the sentence. It also follows the
  **casting lifecycle** — `cast` (`You begin casting X`) and `spell-outcome`
  (fizzle / interrupted / resisted / blocked) — which is what makes cast times and resist
  rates measurable at all, plus your own `death` (`You have been slain by X!`, which
  `parseKillLine` deliberately ignores). Names are canonicalized so one thing is one row: `You`/`YOU` →
  `You`, articles folded, and a spell's trailing **rank** stripped (`spellName`), because
  EQL casts "Shock of Lightning VI" but damages "by Shock of Lightning". See
  [ADR 0014](../decisions/0014-damage-meter-from-the-log.md) and
  [ADR 0016](../decisions/0016-combat-history-and-spell-analytics.md).
- `electron/log-watcher.ts` — the side-effecting shell around the parser:
  - Polls the active file every 500ms and reads only newly-appended bytes.
  - Truncation-safe: if the file shrinks (new session / rotation) it resets.
  - Auto mode follows the most-recently-written `eqlog_*.txt`; or pin one file.
    Only the file present at start anchors at EOF (so launching mid-session skips old
    history); a log that *appears while watching* (new session, or `npm run sim`) is
    read from the top so nothing is missed.
  - Emits `loot`, `zone`, `xp`, `kill`, `loc`, `combat`, and `status`; never parses
    itself. Parsers are tried in `PARSERS` order — combat first, because it's most of
    the file and every parser returns null for lines it doesn't own.
- `main.ts` tracks the current zone from `zone` events and broadcasts it (overlay /
  status bar), feeds `xp`/`kill` into `session-stats.ts` and `combat` into
  `combat-stats.ts` (coalesced before broadcast — a single poll can carry thousands of
  combat lines).
- `electron/session-stats.ts` — session XP/kill totals, attributing each XP gain to
  the most recently killed mob (a time-windowed heuristic; EQ doesn't say which mob
  gave XP). Emits a snapshot broadcast to the Session tab.
- `electron/combat-stats.ts` — the damage meter's tracker: per-combatant damage dealt /
  taken / healed, DPS over *active* combat time, max hit, accuracy and crits;
  **per-spell** casts / cast time / damage-per-second-of-casting / resist rate; and
  **per-mob** time-to-kill and experience rate, a per-second damage series, and a recap of
  what was hitting you before each death — for the current fight and the session. It also
  folds the two capitalizations EQ gives one name (`Obsolete model` / `obsolete model`)
  into a single row, which needs memory a per-line parser doesn't have. See
  [ADR 0017](../decisions/0017-camp-efficiency-and-asking-the-player.md).
- `electron/xp-progress.ts` — percent into the current level: **the one figure the log
  can't give us**, so the player states it once, gains creep it forward, and a level-up
  resets it. Kept in its own file (not settings) because it changes on every kill. Fights are delimited by swings in **log time** (a >10s
  lull starts a new one), so a replayed log meters exactly like a live one. It keeps no
  past fights: it emits `fightEnd` and stays memoryless.
- `electron/combat-history.ts` — where finished fights go: a flat, bounded (1000) list on
  disk under userData, tagged by session, with sessions derived by grouping. Written as
  fights end (debounced) so a crash costs at most the fight in progress.
- Loot→list matching lives in the [store](../architecture/README.md), not here.

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
- Parses loot, zone, xp, kill, loc and combat lines today. Still out of scope:
  faction hits, skill-ups, coin, spell casting/fizzles, and buff/debuff landings.
- Does not enable the EQ log itself — the user turns on logging in-game (`/log on`).

## See also
[architecture](../architecture/README.md) · [testing](../testing/README.md) ·
[ADR 0004](../decisions/0004-log-watching-strategy.md)
