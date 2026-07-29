# 0014: Damage meter parsed from the log, with log-time fights

## Status
Accepted

## Context
The app already tails the EQ Legends log for loot, zone, XP and kills. Combat — by far
the bulk of the log — was thrown away, so the app could say what you looted but nothing
about how the fight went. Existing EQ damage meters are separate tools with their own
overlay, another window to alt-tab, and no idea what's on your shopping list.

Reading a real 6,240-line log settled two things. First, the combat grammar is small
and regular enough to parse exactly (melee, spell, damage shield, DoT, miss, heal), but
it has traps that only show up in real data: `(Critical)` / `(Riposte)` qualifiers sit
*after* the sentence's full stop, heals report `effective (attempted)` when they
overheal, `point` is singular at 1 damage, and pets are written `Owner`s warder` with a
backtick. Second, DPS needs a time base, and EQ timestamps only go to the second.

The naive time base — last event minus first — is worse than useless over a session: a
log spanning an evening divides a few thousand damage by a few hundred thousand seconds
and every row reads `0`. Measured on the real log, calendar span was 619,877s against
1,463s of actual fighting.

## Decision
Combat is parsed and metered in the same shape as the rest of the log pipeline:

- **`src/shared/combat-parser.ts`** — a pure black box beside `log-parser.ts`, one
  function per line shape, returning `DamageEvent | MissEvent | HealEvent`. Its tests
  use **verbatim real log lines**, and the patterns were validated by running the parser
  over a whole log and inspecting every line it *failed* to match — which is how the
  four traps above were found. Attack verbs are enumerated rather than matched as
  `\w+`, because a lazy attacker pattern plus a generic verb parses "A skeleton punches
  YOU" as attacker "A", verb "skeleton".
- **`electron/combat-stats.ts`** — the tracker, fed by the watcher, broadcast to the
  windows exactly like `session-stats`. It keeps **two windows at once**: the current
  fight and the session, because both questions matter mid-play.
- **Fights are delimited by swings, in log time.** A hit or miss opens a fight; the
  first swing more than 10s after the last one starts a new one. Healing joins a fight
  in progress but never opens one, so downtime healing doesn't invent an empty fight.
- **Duration and DPS count active combat time**, accumulated as the sum of gaps between
  a combatant's damage, ignoring gaps longer than the idle window. `activeSec` has a 1s
  floor so a single big hit isn't infinite DPS.
- **All timing comes from the log's timestamps, never the wall clock**, so a replayed
  log meters identically to a live one and the tests need no fakes or sleeps. The one
  thing that can't come from the log is whether a fight is still *running* — the log
  only reveals a lull when the next swing lands — so the UI judges that from
  `fight.endedAt` against the clock.
- **Snapshots are coalesced** (250ms) before broadcast: a poll can deliver thousands of
  combat lines at once, and no UI can use thousands of snapshots.

Rejected alternatives:
- **Wall-clock fight boundaries** — simpler live, but a replayed or backfilled log
  becomes one giant fight, and tests would need fake timers.
- **Folding pet damage into the owner's row** — the log names the pet, so it gets its
  own row; rows are flagged `mine` (you + `<Character>`s …`, from the log's filename)
  and the meter tints them instead.
- **Extending `session-stats`** — XP/kills and damage have different lifecycles (a
  fight vs a session) and different event volumes; one module per job keeps both simple.

## Consequences
- The Damage tab shows dealt/taken per combatant with bars, DPS, max hit, accuracy and
  crits, for this fight or the session — no second tool, and it sees the same log.
- Damage numbers are only as good as the grammar: a line shape we don't parse is damage
  that silently doesn't count. The coverage technique above (parse a whole log, look at
  the unmatched remainder) is the way to check that, and it's cheap to repeat when the
  game's messages change.
- DPS is coarse for very short fights — the log's one-second resolution can't be fixed
  by us, so a 2s burst is ±50%.
- The meter starts empty each launch and is reset by hand; nothing is persisted. If
  per-fight history is ever wanted, `FightStats` is already the natural record to keep.
