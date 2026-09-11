# 0226: A restriction notice is not a zone, wherever it landed

## Status

Accepted

## Context

The client reuses "You have entered …" for two different sentences. One is a real arrival. The other
is a restriction notice — "You have entered an area where levitation effects do not function." —
fired on many dungeons, and phrased exactly like an arrival because the game's own string table just
does that. `parseZone` (`log-parser.ts`) is a dumb capture by design (pure, no gazetteer), so it
handed both to every caller as a `ZoneEvent`, and the notice's sentence became the "zone" wherever
that event was trusted.

That turned out to be four places, not one, because "where you are" is read live and also
reconstructed twice more:

- **The live watcher** (`electron/main.ts`'s `watcher.onZone`) — sets `currentZone`, broadcasts it to
  every window, and feeds it to the spawn tracker, the buff tracker and the combat meter.
- **Startup catch-up** (`log-catchup.ts`'s `catchUpState`) — recovers "where you are" from the log's
  tail without replaying it (ADR 0043), for the app that just started mid-session.
- **A full digest** (`log-import.ts`'s `importLog`) — the "eat a whole log" path used by first import,
  the Settings "digest a past log" button, and the unattended re-read a stale store triggers
  (ADR 0129). It tracks its own `zone` variable across the replay, independently of the other two.

Each of the three assigned `event.zone` unconditionally. A notice landing in any of them meant a kill,
a drop, a fight, a spawn timer or a scoreboard entry got filed under a sentence describing an *effect*,
not a *place* — and, live, it reached every other window and every peer's screen the moment it was
set as `currentZone`.

It also reaches storage a fourth way that isn't about parsing at all: **pooling**. `peer-kills.ts` and
`mob-knowledge.ts` accept a zone from anyone sharing with you, checked only for shape
(`typeof === "string" && non-empty`). A peer on an older build can hand you the same fake zone as
something to plot on your own map or fold into your own drop rates.

`zones/place.ts` already had almost everything needed to tell the two sentences apart: `isKnownPlace`
resolves a name against the gazetteer's list of this server's zones. `classifyZoneLine` adds the other
half — a small, hand-maintained `NOT_A_ZONE` list of sentences *confirmed* to be notices rather than
zones the gazetteer merely hasn't catalogued yet — because those are different problems needing
different answers: an unrecognized zone might be a custom Legends zone or one a patch just added
(silently guessing wrong there is the failure ADR 0068 and ADR 0076 both exist to avoid), where a
notice is never going to become a real place no matter how long the gazetteer waits.

## Decision

**Classify every zone capture as `known`, `blacklisted`, or `unresolved`, and treat only `blacklisted`
as license to correct something already on record.**

*Going forward*, all three replay paths (`main.ts`, `log-catchup.ts`, `log-import.ts`) call
`classifyZoneLine` before trusting a capture:
- `known` moves `currentZone` (or the replay's local `zone`) forward, exactly as before.
- `blacklisted` or `unresolved` leaves it exactly where it was — the most recent *known* zone — rather
  than guess. `unresolved` is also logged at debug level with the raw sentence, so a genuinely new
  zone the gazetteer hasn't caught up to yet can be told apart, later, from more of this.

*Retroactively*, two mechanisms repair what a notice already wrote, matched to how each store treats
an existing value:

- **`kill-log.json`** already had a schema-gated migration (`fillMissingKillZones`) that fills a
  *missing* zone by re-reading the player's own logs for a timeline and asking "where were you at this
  kill's timestamp" (ADR 0083's exception for a fact the log states but the record lacks). Its
  predicate now also catches a zone `classifyZoneLine` calls `blacklisted`: resolved the same way if
  the timeline can say, cleared to `undefined` if it can't — never left holding a sentence that was
  never a place. A `retired` mob-knowledge bucket filed under a fake zone is dropped outright rather
  than repaired: it's an unsplittable tally, not an instance, so there's no timestamp left to
  re-derive from.
- **`loot-log.json`, `combat-history.json`, `high-scores.json` and `spawn-timers.json`** don't carry a
  schema of their own, and none of their own version numbers is about zones — bumping one to gate this
  would misdate what that store actually tracks. A new `repairBadZones` (`migrations.ts`) sweeps all
  four together, gated by one shared marker (`data-repairs.json`), using the same
  repair-if-resolvable-else-clear rule for loot, fights and scores. A **spawn timer** gets neither: its
  identity *is* its place (`timerKey` = `mobKey|placeKey`), so a camp filed under a fake one is
  forgotten outright — every row keyed to it, across every one of the tracker's per-camp settings, not
  merely cleared to blank.

This is a narrow, named exception to ADR 0083's "a record that has a zone is never touched" — not a
reopening of it. ADR 0083 protects against overwriting one true, if inconvenient, fact with our own
later reading of it. A restriction notice was never a fact about a place to begin with; recognizing
that is closer to fixing a parsing bug than to relitigating an aggregation. An ordinary recorded
zone — agreed with the log, disagreed with it, spelled a mapmaker's way — is still never touched.

**Pooled data self-heals without a migration.** `contributions.ts` already re-vets every contributor's
stored payload through the same `sanitize` function on every load, because "the file was written from
*their* payload, possibly by an older build whose vetting was weaker than today's." `sanitizeKills` and
`sanitizeObservations` now refuse a `blacklisted` zone the same way they refuse a malformed shape, so a
peer's already-pooled fake entry is silently dropped the next time `mob-knowledge.json` or
`peer-kills.json` loads — no separate repair needed for either.

## Consequences

**Four capture points now agree**, where three of them independently decided "trust the capture" and
one (pooling) checked shape only. A future notice the client phrases the same way is caught by
`classifyZoneLine` everywhere at once rather than needing four fixes.

**`NOT_A_ZONE` is the one thing that has to be grown by hand.** It ships with the one sentence this
bug report was about. `unresolved`'s debug log is the intended way a second one gets found — read it,
confirm it's more of this rather than a real zone the gazetteer is late to, and add it. Nothing here
guesses a sentence is a notice on shape alone (no "starts with an indefinite article" heuristic); a
wrong guess there would cost a real, uncatalogued zone exactly the way ADR 0068 already refuses to risk.

**A confirmed-fake zone the logs can't re-derive is cleared, not deleted.** A kill, a drop, a fight or
a score stays on record with no zone rather than vanishing — the same honest silence
`fillMissingKillZones` already chose for a zone the log never stated at all. Only a spawn timer is
removed outright, because a camp has no "unplaced" state to fall back to.

**`data-repairs.json` is a new, small file**, and a new precedent: a migration marker that belongs to
none of the stores it gates, for the case where a fix crosses several files and stamping any one of
their own schemas would misdate it. `KILL_LOG_SCHEMA` bumped 2 → 3 for the same repair applied to
kills specifically, since that store already had a working schema field to extend.

**The live fix landed one release before the retroactive one**, which this record's own history
proves worth naming: the first pass (`main.ts`, `log-catchup.ts`) closed the two paths visible from a
bug report about the session tab, and only auditing every store a zone can reach — including the third
replay path, `log-import.ts` — surfaced the rest. A parsing defect that "looks like a zone" is worth
tracing all the way to every place a zone is trusted, not just the one that was noticed first.
