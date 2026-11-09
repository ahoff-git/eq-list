# 0369: A stale stats read says so

## Status

Accepted

## Context

A stats read ([ADR 0368](./0368-a-stats-grab-reads-the-inventory-window.md)) is stored as what the game showed
*beyond what the plan counts* ([ADR 0366](./0366-a-loadout-floor-is-in-the-games-own-numbers.md)). That offset is
true for as long as nothing the game, or the plan, put into it has changed — and a player has no way to know when
that stops being so. The player asked (2026-11-08) for a status-bar pill that bothers them when their stats should
be updated, and for every calculation that relies on player stats to be checked, to decide when.

**The audit.** What leans on your stats, what it reads, and whether it can go stale:

| Calculation | Reads | Stale when |
|---|---|---|
| Loadout floors, "% of max", goal rows (`bis-goals.ts`, `stat-base.ts`) | the read's offsets, plus the modelled base | **yes** — the one consumer of a read |
| The modelled base and rates (race, classes, level) | what the player ticks and the Items tab's level | they are inputs, but the offset is measured against them |
| Per-slot change and the Stats section ([ADR 0367](./0367-a-loadout-row-says-what-it-changes.md)) | gear and rates only | never — they read no calibration |
| Damage-taken suggestions: resist, AC, HP, mana ([ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md)–[0365](./0365-winning-comfortably-suggests-trading-survivability-for-damage.md)) | worn gear's resist points ("the only points known here"); worn gear against what the loadout reaches | not today — they read no calibration. They would be a second consumer if they used the read's resist totals |
| Max HP estimate and its stated figure ([ADR 0018](./0018-inferred-max-hit-points.md)) | the log's bounds, level-scoped | has its own rule already: a level-up or a buff fading on you starts it over |
| The level on the Session tab | the xp store | display only |

So there is one consumer, and four ways under it can move.

**What can witness a change** was checked against a real log. Levels are written ("Welcome to level 32!", 182 of
them). Ability points spent are written, in two forms (`You have gained the ability "X"` and `You have improved X
3`): 152 events over 55 abilities, 88 of them free upgrades a level-up hands out and the rest including a toggle
(`Symphonic Aura: Enabled`) that flips for nothing, repeatedly. Buffs are seen on the board — which
[buff-tracker.ts](../../electron/buff-tracker.ts) deliberately starts empty on every launch. And the plan's own
inputs are the builder's. The game's own spellbook categories separate stat buffs from the rest: of 200 known
buffs on the real character, 65 are `Statistic Buffs` or `HP Buffs`, 131 are not, 4 are filed nowhere and none of
those four moves a stat.

## Decision

- **A pill, in the status bar, when a read exists and something the app can see has changed since.** It names the
  reasons ("Re-read your stats · level up · buffs changed"), says on hover when it was read and what changed, and
  one click opens the loadout builder ([ADR 0326](./0326-the-status-bar-is-a-way-in.md)), where the same reasons are
  stated and there are two buttons: *Read my stats again* and *Nothing's changed* (which dates the read as of now).
  It is silent for anyone who has never read or typed their stats, and for a calibration since cleared.
- **Four reasons, each with its own witness** (`stats-drift.ts`):
  - **A level-up.** Any level line counts — EQL levels per class, so a lower class gaining a level moves stats as
    well. The log; kept by the main process, so a level gained while the app was closed is still here.
  - **A stat-moving ability bought** (`stat-buffs.ts`): by what the wiki's description says it raises
    (Innate Eminence, Innate Spell Resistance, Natural Durability), not by its name; one the catalogue doesn't know
    is assumed to, since a wrong yes costs a glance and a wrong no leaves a stale read standing; a toggle never.
    Judged on the way *in* to the journal, so free upgrades and toggles can't push the levels out of its cap.
  - **A stat buff coming or going**, by the game's own category. Compared **then against now, per buff**, from
    the transitions seen on the board — not by what the board holds, which is empty after every launch and would
    nag after every restart. A buff that fades and is recast is the same as it was, so it stops being a reason by
    itself; the first board seen after a launch is a baseline, not news.
  - **The plan's own inputs changing** — race, classes, the Items tab's level. The offset is measured against a
    modelled base, so ticking a race after a read would count the race's attributes twice.
- **Not gear, and not time.** The offset is the character's own part and follows the worn gear by design (ADR 0366),
  so a new dump needs no new read. And nothing says an old read is a wrong one; a reminder on a clock is a reminder
  with no reason to give.
- **A read is dated from when the screen was read**, not from when the builder applied it — which can wait for an
  inventory dump — because whatever happened in between is already missing from it. A typed figure dates the
  calibration as of now.
- **The buff watcher only exists while a stats read does.** Classifying a buff needs the spell catalogue (7 MB of
  cards, turned into rows), which is not worth loading at every launch for someone who never calibrates.

## Consequences

- Replayed on the real log, a read taken at the time of the first two screenshots (level 31) would have said
  "reached level 32" — the level that arrived at 15:00:24 — stays silent for a read taken just after it, and says
  "gained 12 levels" for one three days old.
- It cannot see what the log doesn't say: a buff up at the read that the board never saw land and was then
  refreshed reads as a new one; a debuff on you at the read (the red SV. Fire 19) is baked in; a stat potion or a
  quest reward is invisible; and a read taken against a **stale inventory dump** — gear swapped after the dump —
  has absorbed that swap into its offset, which a new dump will then double-count. Dump, then read.
- Changing race, classes or level after a read nags rather than recomputes. Storing the figures the game showed,
  with the gear worn, would let the plan re-derive the offsets under a new basis instead — a larger change to
  ADR 0366's model, left open.
- The stamp and the buff moves live in `localStorage` as one record, written by the builder and the watcher and read by the
  pill; the builder *publishes* whether it is calibrated rather than deleting the stamp, which would race the very
  write that made it.
