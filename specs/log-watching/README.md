# Log watching

## Purpose
Turn the EverQuest Legends text log into a live stream of "you looted X" events,
so the store can tick shopping-list items up as they drop.

## Responsibilities
- `src/shared/log-parser.ts` — a **pure** black box, one small parser per line type:
  `parseLogLine` (loot: `--You have looted…--`, auto-sell, loot-and-combine),
  `parseZoneLine` (`You have entered <zone>.`), `parseXpLine`
  (`You gain [party] experience! (N%)`), and `parseKillLine`
  (`You have slain X` / `X has been slain by Y`; player death is ignored).
  Timestamps are kept as the log's naive local wall clock (no zone offset).
- `electron/log-watcher.ts` — the side-effecting shell around the parser:
  - Polls the active file every 500ms and reads only newly-appended bytes.
  - Truncation-safe: if the file shrinks (new session / rotation) it resets.
  - Auto mode follows the most-recently-written `eqlog_*.txt`; or pin one file.
    Only the file present at start anchors at EOF (so launching mid-session skips old
    history); a log that *appears while watching* (new session, or `npm run sim`) is
    read from the top so nothing is missed.
  - Emits `loot`, `zone`, `xp`, `kill`, and `status`; never parses itself.
- `main.ts` tracks the current zone from `zone` events and broadcasts it (overlay /
  status bar), and feeds `xp`/`kill` into `session-stats.ts`.
- `electron/session-stats.ts` — session XP/kill totals, attributing each XP gain to
  the most recently killed mob (a time-windowed heuristic; EQ doesn't say which mob
  gave XP). Emits a snapshot broadcast to the Session tab.
- Loot→list matching lives in the [store](../architecture/README.md), not here.

## Log format reference
- Location (default): `C:\Users\Public\Daybreak Game Company\Installed Games\EverQuest Legends\Logs`
- File: `eqlog_<Character>_<server>.txt`
- Example: `[Fri Jul 17 18:41:14 2026] --You have looted a Mote of Potential from an orc centurion's corpse.--`

## Non-responsibilities
- Does not decide what counts as "wanted" — that's matching in the store.
- Parses loot, zone, xp, and kill lines today (faction/skill-ups are still out of scope).
- Does not enable the EQ log itself — the user turns on logging in-game (`/log on`).

## See also
[architecture](../architecture/README.md) · [testing](../testing/README.md) ·
[ADR 0004](../decisions/0004-log-watching-strategy.md)
