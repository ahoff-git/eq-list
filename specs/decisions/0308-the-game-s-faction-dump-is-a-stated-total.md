# 0308: The game's faction dump is a stated total

## Status
Accepted

## Context
The faction ledger (`faction-log.ts`) only knows what it has watched change: EQ's faction line never
states a starting point or an absolute value. The fix so far has been the player typing in a real
total for a faction, kept as an **offset** so hits logged afterwards keep adding on top
(`faction-corrections.ts`, `faction-correction.ts`).

The EQL client will write the real total for every faction on command: `/outputfile faction` produces
`<Char>_<server>-<CLASS>-Factions.txt`, one row of `ID / Name / StandingValue / PointsToMax` per
faction. On a real install (2026-10-20) all 80 factions the ledger had seen matched a name in the dump,
and the gaps were large: Antonius Bayle read +213 from the log against the game's 1551.

The questions: whether the dump replaces the typed corrections, sits beside them, or is ignored in
favour of what the player says; and what it is offset *against*, given hits keep landing after it is
written.

## Decision
A faction dump is read as **a stated total for every faction in it, stated by the game at the moment
the file was written**: exactly what a typed correction is, for every faction at once.

- It is offset against what the ledger had seen **by the dump's time** (total net minus net since the
  dump), so hits logged after the dump still count on top. The ledger stamps hits in the log's local
  time, so that instant is asked for the same way (`logStamp`).
- Per faction, **the newer statement wins**, typed or dumped, compared as instants. A dump taken
  after you typed a number supersedes it, and a number typed after the dump supersedes that.
- It is read on demand from the game's own file and not copied into the corrections store. A new
  dump replaces the file, and the app notices within 30 seconds and refreshes (`watchExport`).
- A dump-sourced figure is marked as such (`source: "dump"`), so the Faction tab can say whose number
  it is.

## Consequences
- The Faction tab, and everything reading `faction.standings` (race-unlock progress included), shows
  the game's own numbers after one `/outputfile faction`, with no typing.
- Factions the log never saw get a row too, since `applyFactionCorrections` already gives a stated
  faction a blank row to carry its total.
- A typed correction is not deleted by a dump. It is outranked while it is older, and comes back into
  force only if the player restates it.
- The ledger and corrections are not per character. A dump is read for the character whose log is
  being followed, so following a different character's log applies that character's dump. This is
  the same scoping limit typed corrections already have.
- Faction names must match the log's spelling for the dump to land on a ledger row. On real data they
  all did; one that doesn't would show as a separate row.
