# 0101: An item page says who dropped it, and where-ish

## Status
Accepted

## Context
The Search tab is where a player looks something up, and for an item it shows the wiki's
"Drops From": a mob, a zone, and — as [wiki-data](../wiki-data/README.md) records as a standing
limitation — **never a rate**, because the wiki keeps rates on the mob's page instead. It also
describes an older, heavily modified build, so an item this game drops off something the wiki never
linked to it has, on its own page, nowhere to say so.

We already hold the answer and were not showing it. Every kill is recorded with its drops and
roughly where it happened ([ADR 0022](./0022-invocation-effects-and-kill-locations.md)), rolled up
per mob per zone with kill counts, drop counts and a roam area. ADR 0025 reconciles that with the
wiki — but only ever **per mob**: `drop-truth.ts` answers "of the things this mob drops, which have
I seen", and `MobKills` shows it on the mob's page. Asked from the item's end, nothing answered.
The nearest thing was `mob-stats.ts`'s `dropSources`, an item → mobs index built so the map's 📖
panel can ring every source of a drop at once: no rate, no zone, no reconciliation, and only in the
map window.

So the app could tell you that a `minotaur slaver` drops Minotaur Blood, and could not tell you,
while you stood on the Minotaur Blood page, that you had ever seen one.

## Decision
Search fills an item's page in from what our own kills know, under the wiki's claims.
`src/shared/item-sources.ts` reads the pooled tally
([ADR 0024](./0024-mob-knowledge.md)) from the **item's** end and returns one row per mob,
carrying [ADR 0025](./0025-observation-over-the-wiki.md)'s three verdicts unchanged —
**confirmed** (the page names that mob and we've watched it happen), **undocumented** (we've seen
it and no source on the page names that mob), **unseen** (the page names it, we've killed it, and
it has never once given the item up). `ItemDrops` draws them below "How to get it", the mirror of
`MobKills` sitting below a mob's "Known loot". Beyond those verdicts:

- **A mob earns a row; a camp is a line under it.** A mob killed in three zones is one answer to
  "who drops this" with three places under it, each with its own kills, drops and rate. A camp that
  has never produced it is **kept** rather than filtered: "40 kills there and none here" is the
  shape of a drop that is zone-specific, and is the reason to walk somewhere else.
- **Where-ish rides along.** Each place carries the roam centre and spread derived from the kills'
  own positions, and clicking it opens the map with a marker on it — the gesture a mob page already
  has, now reachable from the item. This is the part no reference can supply: the wiki names a zone
  and nothing has ever named a spot.
- **An `unseen` row exists only where we have kills.** A wiki-claimed mob we've never killed gets
  no row at all: there is no observation to add, and the wiki's claim is already on the page a few
  lines above. Repeating it back with "0 of 0" beside it would dress a claim up as evidence.
- **Names fold the way they do everywhere else.** The item by `normalizeItemName`, so a
  `Minotaur Battle Axe +1` off a corpse answers for the page the wiki calls
  `Minotaur Battle Axe` ([ADR 0057](./0057-a-grade-is-not-an-identity.md)); the mob by `mobKey`, so
  the wiki's "a skeleton" meets the log's "skeleton".
- **Sample size is drop-truth's, not a second opinion.** `rateConfidence` colours the rate,
  `rateWhy` words the hover, and `SUSPICIOUS_AFTER_KILLS` decides when a wiki claim is worth
  doubting — the same constants the mob page reads, because one figure shown in two places must not
  be two different claims.
- **The learned vendor price comes too.** It's another thing we know about the item that its page
  can't state, it holds wherever the item dropped
  ([ADR 0047](./0047-money-is-copper-in-two-ledgers.md)), and when only a *grade* has ever been sold
  the line says which spelling sold rather than pricing the base item on its behalf.
- **Shown for every page kind except `mob` and `zone`.** A spell page is its scroll and scrolls
  drop; a mob's own evidence is `MobKills` directly above; a zone is not loot. A page we know
  nothing about renders nothing, and only a page the wiki *says* drops gets the "you haven't seen
  this yet" note — a vendor item has no absence worth remarking on.

Rejected alternatives:

- **Badging the wiki's "How to get it" rows in place.** It can only annotate sources the wiki
  already has, which is the half that needed the least help — the undocumented mob, the whole point,
  has no row to badge.
- **Reusing `dropSources`.** It answers "which mobs" for a map gesture and folds case only, so it
  would miss a graded drop and could say nothing about how often or where.
- **Growing `drop-truth.ts` a second entry point.** It's a pinned black box answering the mob's
  question; a new module that *imports its thresholds* is the right amount of coupling — shared
  judgement, separate question.

## Consequences
- The page the wiki answers worst now answers itself, and an undocumented drop surfaces where a
  player would go looking for one rather than only in the mob panel they'd have to know to open.
- Two views now read one pooled tally from opposite ends. They agree by construction on the
  numbers, and by shared constants on how much to believe them — but they are two places to keep
  saying the same thing, which is the cost.
- The evidence is only as good as the kill log's zoning: a kill with no zone never becomes an
  observation, so an item looted where we couldn't name the zone is invisible here, exactly as it
  is on the mob's page.
- Peers' kills are pooled in and every row still says how much of it you saw yourself, as ADR 0024
  requires — a rate improves by pooling, a *direction* stays yours.
- `itemDropSources` scans the whole tally per item rather than indexing once, because the asker is
  one open page. A caller that wanted this for a list of items would want `dropSources`' shape
  instead, and would have to say so.
