# 0227: An admin edit is a flagged exception to stored history

## Status

Accepted

## Context

[ADR 0226](./0226-a-restriction-notice-is-not-a-zone-wherever-it-landed.md) fixed one specific bad
value reaching stored data and wrote a one-time migration to repair it. That pattern — notice a
defect, write a bespoke migration, ship it — does not scale to *the next* bad value, whatever it
turns out to be, and it leaves no way to correct a record by hand when the defect is narrower than a
whole migration is worth (a single mis-parsed mob name, one kill's wrong position).

The app also has no consistent way to say "this record was corrected by hand, not by the log" — ADR
0083's whole point is that a kill, a drop or a fight carries what the log actually said, and an
un-flagged hand edit would erase that distinction the moment it was made, indistinguishable from a
line the game itself wrote.

## Decision

**A hidden admin panel, one generic factory behind every store it touches, and a flag that survives
every store's own persistence.**

- `src/shared/admin.ts` is pure: a record is a flat list of scalar fields (`AdminField` — string,
  number, boolean, or null; a nested shape is shown by neither this nor the panel), `coerceAdminValue`
  matches typed-in text back to a field's *current* type rather than accepting anything, and
  `AdminAudit` is the flag a corrected record carries.
- `electron/admin.ts`'s `createArrayAdminStore` is the one function that lists a live array as
  records and applies a patch to it. One factory rather than one implementation per store, for the
  reason [migrations.ts's `repairZoneField`](./0226-a-restriction-notice-is-not-a-zone-wherever-it-landed.md)
  already established this session: the same walk written per-store drifts the moment one copy is
  fixed and the others aren't.
- The flag (`__admin`, an object carrying `edited: true` and the full history of every field changed,
  with what it was and when) is a plain property on the record itself — not a parallel table — so it
  is written back to disk by whichever save path that store already has, and reads back with the
  record on every future load. A store whose `sanitize` rebuilds a clean copy from named fields (the
  two pooled stores) has to say so explicitly (`isAdminAudit`) or the flag would be silently stripped
  the same way an unlisted field always is there.
- Wired into eight stores so far — kills, loot, fights, high scores, faction hits, respawn timers, and
  the two pooled peer stores — chosen because each already deliberately parts one record from the
  next, either by nature (a personal best, a countdown) or history (per-item keying was already
  designed and understood; see the per-store exclusions below).
- **A field is only editable if changing it can't desync something the panel can't see.** Several
  stores keep a *second* structure — a dedup key, a lookup by camp — derived from certain fields at
  write time and never recomputed on read. Patching a field that feeds one of those (`mob`/`killer` in
  kill-log, `mob`/`place` in a respawn timer, everything `factionKey`/`lootKey` fold) would leave that
  structure pointing at a fact the record no longer states, which is a worse bug than the one being
  fixed — so each store's `editable` list excludes them by hand, and faction hits (whose only scalar
  fields *are* its key) end up browsable with nothing to patch at all.
- Its own window (`createAdminWindow`), no overlay machinery, reached only from the tray — not a tab,
  because it's a tool for correcting bad data rather than a feature, and `EqlCapabilities.admin` is
  `false` on the web build for the same reason the rest of "one shell, gated by capability" is.

## Consequences

**A record's audit trail is permanent and additive.** Nothing here ever removes a history entry or
un-sets the flag — a record that has been corrected says so for good, which is what makes "did bad
data get in, and was it fixed" answerable by looking rather than by remembering.

**The panel can under-cover a store on purpose.** Faction hits register with `editable: []`: still
listed, searchable, and worth having open when hunting for a bad row, but no field on it can be
patched without also touching the key that dedupes it, so none is offered. That is meant to read as
"nothing safe to change here" rather than an oversight.

**Settings, goals, achievements, buffs and the app's other single-object or lightly-used stores are
not registered.** The factory only knows how to list an *array* of records; a store that is one
nested object (settings) or whose own fields don't carry the kind of bad-data risk this panel exists
for wasn't worth forcing through that shape for this pass. Adding one later is exactly the pattern
above — build its `AdminStore`, add one line to the registry in `registerAdminIpc` — not a new design.

**Nothing here re-derives anything.** A patched kill's zone doesn't retroactively recompute mob
knowledge, spawn timers, or the scoreboard — those already read the store it lives in on demand
(ADR 0083's "group on read"), so the correction is visible the moment anything re-reads that store,
with no cache to invalidate and nothing to keep in sync by hand.
