# 0244: A pooled fact answers your own queries too, and the wiki gets a third mirror

## Status

Accepted

## Context

[ADR 0242](./0242-a-pooled-row-keeps-its-own-origin.md) made `mobs`/`kills`/`respawns` relay onward
correctly: a peer's contribution now survives them leaving and reaches a third peer who asks later.
Auditing what actually *reads* that pooled data turned up one place ADR 0242 fixed the *pipe* for but
never connected to a *tap*: `electron/peer-respawns.ts` files an inbound respawn report, counts it in
the hidden admin panel, and offers it onward to the next peer who asks — and that is all. Nothing
inside this install ever reads `peerRespawns.all()` for its **own** purposes. `mob-knowledge.ts`'s
`all()` already pools observations into what the Hunt tab and a mob's wiki-page card show
(`mergeObservations`), and the map already draws pooled kills alongside your own
(`usePeerKills`/`sharedAsKill`) — `respawns` is the one pooled kind whose data was pure pass-through
freight, never actually answering the question "how long does this camp take?" for the install
holding it.

The same audit, aimed at the wider principle behind ADR 0242 — a fact learned once should be usable
by everyone, and the wiki should only be hammered by one peer per refresh — turned up a second,
unrelated gap: `eqlwiki.com/Category:Factions` (258 pages) is fetched and cached through the exact
same TTL'd, disk-backed store as items, quests, mobs and zones, so it was never *hammering* the wiki
in the sense those already have a fix for — but it also never rides the `items` mirror kind the way
mob/quest/zone pages do, so a room full of installs each independently pays its own first-fetch and
TTL-refresh cost for the same 258 pages instead of one peer's fetch serving everyone.

Fitting factions into `items` outright doesn't work: `items` is shard-addressed
([ADR 0160](./0160-a-room-fills-the-catalogue-once.md)) because it is a catalogue of ~11,136 pages
walked by a background harvester, with a coverage bitmap and a room-fill cooldown built entirely
around that scale. Factions have no such walk and no harvester, and inventing shard math, a coverage
bitmap and a room-fill loop for 258 pages would be solving a problem this kind doesn't have — the
same reasoning [ADR 0196](./0196-spells-get-their-own-shard-addressed-mirror.md) used to justify
spells getting its *own* shard-addressed mirror rather than being smuggled into `items` does not
extend to "therefore every new mirror kind needs shard addressing." A small, bounded roster is
exactly what the generic whole/delta protocol every `observation` kind already uses
([ADR 0171](./0171-a-shared-kind-states-what-a-row-is.md)) is for.

`specs/decisions/README.md`'s own Open Questions already named the trigger for generalizing the
sharded-mirror machinery ("worth doing properly the day a *third* shard-addressed catalogue is
proposed") — but factions is not that third catalogue, because it was never proposed as
shard-addressed in the first place. That question stays open, unresolved by this decision.

## Decision

**Two independent, small fixes — no shared mechanism between them beyond the wire protocol both
already use.**

### Pooled respawns feed the Timers tab, not just the wire

- `src/shared/spawn-timers.ts` gains `mergeRespawns(mine, theirs)` — the `respawns` counterpart to
  `mob-stats.ts`'s `mergeObservations`. The shortest bound tightens to whichever side saw a shorter
  gap; the longest widens to whichever side saw a longer one; `samples` sums (more evidence, not a
  competing claim); `lastKillAt` takes the more recent of the two. A camp with no local learning at
  all is supplied outright from the pool, with the peer's `mob`/`place` labelling; a camp you've also
  learned yourself keeps *your* labelling and keeps its own `gaps`/`crossedDifficulty` untouched —
  neither travels on the wire (`SharedRespawn` never carried them) and neither should be invented for
  a peer's contribution.
- `electron/spawn-tracker.ts`'s `view()` folds `mergeRespawns([...rows.values()], peerRespawns())`
  in as the last step before the local settings overlay (`queue`/`stated`/`lead`/etc.) is applied —
  so a peer-only camp gets exactly the same blank, unconfigured defaults a freshly-learned local one
  already does, with no new code path for the settings layer to special-case.
- `SpawnTrackerDeps` gains an optional `peerRespawns?: () => RespawnFacts[]`, wired in `main.ts` to
  `() => peerRespawns.all()`. `electron/ipc.ts`'s `fileContribution` now also broadcasts
  `CH.spawnsChanged` when a `respawns` contribution lands, since (unlike `mobs`/`kills`, which only
  ever needed to notify the Peers tab) this is the one pooled kind whose arrival now changes what a
  *different* tab shows, and nothing was telling it to refetch.

### Faction pages get a third, smaller mirror kind

- `factions` joins `SHARE_KINDS` as `family: "mirror"`, `defaultOn: true`, capped at 300 rows. It
  reuses `items`' own page reader (`readSharedPage`) verbatim rather than a near-identical copy — a
  faction page is validated exactly the way any other page is — which is why `"faction"` joins
  `CATALOGUE_KINDS` even though it travels under its own kind rather than under `items`.
- **Unlike `items`/`spells`/`gameTime`, this mirror kind runs through the generic whole/delta
  protocol** (`measure`/`answer`'s ordinary path, `absorb` in `keep()`) rather than a hand-rolled
  shard branch — the one thing added to the hub itself is a `keep()` case that calls `absorb` (unlike
  the other three mirror kinds, which never delta) and then `deps.acceptFactions`. `sawOffer` gets
  `factions` added to the same carve-out `gameTime` already has: a fact about the wiki, not about the
  peer, so it is fetched automatically rather than waiting for a click, on the identical reasoning
  [ADR 0189](./0189-the-clock-reading-is-shared-like-a-mirrored-page.md) already established.
- `electron/wiki/index.ts` gains `factionsHeld: Map<string, WikiPage>`, `acceptFactions` (the
  `acceptItems` pattern minus the item-pack invalidation and the shard recheck, neither of which
  apply), and `factions.rows()`. **Warmed lazily, on the first call, never at construction** — an
  eager `store.each()` at every launch is exactly the whole-cache-open
  [ADR 0165](./0165-the-page-cache-is-a-few-files-not-eleven-thousand.md) exists to forbid, and a
  regression test (`wiki-cache-share.test.ts`) confirmed it the first time this was tried. Most
  launches never connect to a room at all, so paying the walk only when something actually asks is
  the same "no request, no crawl" discipline `cachedItems()` already holds itself to.
- The web build (`src/lib/web/awari-web.ts`) accepts a faction page through the same kind-agnostic
  `rememberPage` items/spells already use, and offers none of its own (no wiki crawl to offer from) —
  the same asymmetry it already has for `items`/`spells`.

## Consequences

- A camp a peer taught the room about now shows an estimate on your own Timers tab even if you have
  never personally camped it — the same "pooled data answers your own questions" property
  `mob-knowledge.ts` and the map's peer-kill overlay already had, now true of all three `observation`
  kinds rather than two of three.
- A room converges on holding every faction page once between everyone, the same way it already does
  for items, recipes, mobs, quests, zones and spells — the last of eqlwiki's page-shaped catalogues to
  gain that property.
- The hub now has three mirror kinds answered three different ways: `items`/`spells` by shard,
  `gameTime` as a pinned single row, `factions` as a small generic whole/delta set. This is a smaller
  version of the duplication ADR 0196 already accepted for two kinds, now spread across three — still
  below the threshold that ADR's own text and `decisions/README.md`'s open question set for
  generalizing, since `factions` needed none of the shard-specific branches to begin with. That open
  question stands, unresolved, for the day a genuinely large *fourth* mirror kind is proposed.
- Faction pages riding under `factions` and validated by `readSharedPage` means a page mis-kinded as
  `"faction"` could in principle arrive under `items`' shard mechanism too, or vice versa — harmless,
  since the page store is kind-agnostic and `acceptFactions`/`acceptItems` both write whatever
  well-formed page they're handed; `acceptFactions` additionally fails closed on any row that doesn't
  actually say `kind: "faction"`, so a cross-kind arrival teaches the wrong cache nothing.
