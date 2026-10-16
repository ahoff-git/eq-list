# 0301: A zone line learned late re-files what it missed

## Status

Accepted

## Context

Until 0.1.154 the resolver couldn't name the game's long names for the four Karanas ("You have entered
The Northern Plains of Karana."), the Qeynos Aqueducts, South Ro or Neriak's districts ("Neriak -
Commons") (ADR 0299). An unresolved zone line leaves the current zone where it was. Everything recorded
until the next named zone line was filed under the zone you had left. On one real install that was 78
kills, 60 drops and 60 fights in North Karana filed under The Ruins of Old Guk, plus a dozen fights in
the Aqueducts, West Karana and Neriak.

The stores keep the zone as recorded and group it when read (ADR 0083), so fixing the resolver fixes
*grouping*. It can't fix a record that holds the wrong zone outright. Re-reading the logs doesn't help
either: a re-read never overwrites a zone a record already has (ADR 0137), because a disagreement
usually means the rules moved, not the facts.

## Decision

**A one-time repair re-files exactly those records** (`electron/zone-line-repair.ts`, run by
`migrations.ts`). It works off the logs' own zone-line timelines and changes a record only when both
of these hold:

1. the zone line in force at that moment is one 0.1.154 newly resolved;
2. the record carries exactly the zone the old rules would have kept — the last line before it that
   resolved then.

Where several logs cover the moment, they must agree. Anything else is left as it is.

It runs over `kill_records`, `loot_records` and `combat_fights` in one transaction, before any store
loads. Every change (table, row, from, to) is written to `zone-line-repair-1.json` first, so it can be
read back or undone. `data-repairs.json` records that it ran (`zoneLines: 1`). With no logs it waits,
as `fillMissingKillZones` does, because the logs are the only evidence.

## Consequences

- North Karana's kills and drops leave The Ruins of Old Guk's drop rates, heatmap and mob list on the
  next start, and the fights move with them.
- The pattern is narrow on purpose. It knows which rule moved, so it knows the answer. A future
  resolver fix that changes which lines resolve needs its own version of this, not a general "re-derive
  every zone" pass.
- High scores and spawn timers, still JSON, aren't touched. A record set or a countdown armed in North
  Karana while it read as Lower Guk stays where it was filed.
