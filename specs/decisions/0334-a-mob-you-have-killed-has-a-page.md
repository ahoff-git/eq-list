# 0334: A mob you have killed has a page, and every mob page carries your log

## Status

Accepted

## Context

Opening a mob from your kills often said "Couldn't load", even with kills, drops, a spot and a
sighting on record. The Ghoul Sage was the case reported. There were two causes.

- **The article.** The kill log strips a mob's article ("a ghoul sage" → "ghoul sage"), and every
  link built from a kill carries the bare name. eqlwiki titles the page "A ghoul sage", so the bare
  title missed. Of the 436 mobs in a live install's pooled tally, 212 had a wiki page only under
  their articled title.
- **No fallback for mobs.** [ADR 0103](./0103-search-can-answer-from-your-own-log.md) gave an
  *item* the wiki doesn't know a page built from your log. A mob had no equivalent, so it fell
  through to the item fallback. That fallback found no item by the name and said nothing knew it.
  66 of those 436 mobs have no wiki page at all.

Mob pages the wiki *does* have showed your kills and sightings, but not the other things your log
knows about a mob by name: the respawn the spawn board has learned, and the faction hits its kills
cause.

## Decision

- **A page lookup that misses tries the articled title.** It looks in the wiki's title index for a
  title that differs only by article and case (`articledTitle`, matched by `mobKey`). This runs only
  after a miss, in both the desktop's page cache and the web build's snapshot.
- **A title with no wiki page that your log has killed or seen opens a mob page** built from the log
  (`ObservedMobView`), badged "from your log". Everything else still opens ADR 0103's item page.
- **One block of your evidence under every mob page** (`MobEvidence`), wiki or not:
  - kills, drops, coin and spots (`MobKills`);
  - the learned respawn at each camp, worded as the Timers tab words it (`MobRespawns`);
  - where you've stood next to it (`NpcSightings`);
  - faction moved per kill, pooled with peers (`MobFactionHits`).
- **Search offers mobs you've killed** under "From your own log · not on the wiki", beside the
  items. A mob the wiki's results already name, compared by `mobKey`, isn't offered twice.

Rejected: **synthesising a `WikiPage` for the mob**. This was rejected for items in ADR 0103, for
the same reason: the page would claim a wiki source that doesn't exist.

## Consequences

- A link from a kill now opens the wiki's page whenever the wiki has one, articled or not.
- A miss costs one scan of the title index. It runs only after a miss, which was already a failed
  fetch, and the miss itself is cached for a day.
- A mob the wiki doesn't know shows as much as the log has. Con level and the mob's level aren't
  recorded yet, because the consider parser drops them, so neither page shows them.
- Fight records (damage, max hit) are kept per fight, not per mob, so mob pages don't show them yet.
