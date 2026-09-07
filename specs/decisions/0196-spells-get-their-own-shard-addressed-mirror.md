# 0196: Spells get their own shard-addressed mirror

## Status

Accepted

## Context

The Spells tab ([ADR 0195](./0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)) only ever shows
spells whose wiki page has already been fetched — by design, so a real, well-known spell (`Chant of
Battle`) simply isn't there until somebody looks it up. The Items tab solved the identical problem
with a background harvest that walks `Category:Items` at a gentle pace
([ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md)) and, since
[ADR 0160](./0160-a-room-fills-the-catalogue-once.md), splits that walk across every connected peer's
app so a room fills the catalogue once between everyone rather than each person crawling alone.

`eqlwiki.com/Category:Spells` exists and holds 2,054 player spells (confirmed directly against the
live wiki), so the same approach applies. The scheduling engine
(`electron/wiki/harvest.ts`'s `createHarvester`) and the shard math (`src/shared/item-shards.ts`) are
both already written generically — neither file mentions "item" anywhere in its logic — so a second
harvester for spells plugs into the exact same machinery with **no changes to either file**. What
*is* hard-coded to items specifically is the wiring in `electron/wiki/index.ts` (one `items` object,
one `room: PeerLink` variable) and, more consequentially, the peer-sharing hub
(`electron/peer-share.ts`) and its wire-protocol types (`src/shared/peer-share.ts`), where `items`
gets bespoke `if (kind === "items")` branches in `offer`/`measure`/`answer`/`keep` rather than flowing
through the generic per-kind table the rest of sharing uses.

## Decision

**Spells get a second, parallel shard-addressed mirror kind — `spells` — built by duplicating the
handful of `items`-specific branches rather than refactoring the hub into a generalized "sharded
kind" abstraction.**

- The existing item-sharing code is a mature, heavily-tested subsystem behind 15+ prior ADRs
  (0141/0153/0160/0161/0164/0165/0171/0172/0176/0177/0178/0180/0181 among them). Treating it as a
  black box and adding clearly-named siblings alongside it (`askSpellShard`/`spellRoom` beside
  `askShard`/`itemRoom`, a `spells` branch beside each `items` branch) is lower risk than
  restructuring it, at the cost of some near-duplicate code between the two kinds. Worth
  generalizing *if* a third sharded kind ever shows up — not before.
- `electron/wiki/harvest.ts` and `src/shared/item-shards.ts` are reused **unchanged**. A second
  `createHarvester(...)` instance (`spellHarvester`) is wired in `electron/wiki/index.ts` with its own
  checkpoint file (`spell-harvest.json`), its own client-side shard-index bookkeeping
  (`spellByShard`/`spellPresent`/`spellMine`/`spellHeldTitles`), and its own room link
  (`spellRoom: PeerLink`, set via a new `joinSpellRoom`).
- **`SHARD_COUNT = 1024` is reused unchanged** for spells rather than a second, smaller constant.
  ~2,054 spells over 1024 shards means ~2 pages/shard instead of items' ~11 — a little more message
  overhead, zero correctness cost, and it keeps the pure shard-math module untouched.
- **No shape-discovery** (ADR 0180's candidate/probe system) for spells. That machinery exists
  because `Category:Items` measurably misses 680 pages reachable only via outbound links; nothing
  suggests `Category:Spells` has an equivalent gap. `HarvestDeps.candidates`/`.probe` are both
  optional and can be wired in later without disturbing anything else.
- **`Category:Spells`'s own subcategories are walked too**, including `Category:NPC_Only_Spells`
  (653 pages) — `exploreCategories` descends into every subcategory unconditionally and has no
  exclusion mechanism worth adding to a generic, tested walker for this. Those spells show up with an
  empty Classes line and sort to the bottom under Level, the same "shown, not hidden" honesty the
  Items tab already applies to anything nothing can place.
- **No shared "what changed" poll.** The item harvest's `catchUpOnChanges` and the spell harvest's
  equivalent (currently a no-op, `catchUp: async () => 0`) each would poll `fetchRecentChanges`
  independently if wired up. Sharing one poll between both is a real optimization, not something this
  feature needs to work — left for later.
- The wire protocol (`src/shared/peer-share.ts`) gains `"spells"` as a `ShareKind`, a `SHARE_KINDS`
  table entry (`family: "mirror"`, `defaultOn: true`), and its own `SharedSpellPage`/
  `readSharedSpellPage` — considerably simpler than the item reader since a spell page carries no
  sources/components/links to validate. It does **not** route through `readSharedPage`/
  `CATALOGUE_KINDS`: that gate's "spells are still refused" comment predates this ADR and is now
  stale in intent (the Spells tab does read spell pages) — spells travel through their own dedicated
  reader instead of being smuggled in under `items`.
- The hub (`electron/peer-share.ts`) gains `PeerShareDeps.spells`/`.acceptSpells` (reusing the
  already-generic `ItemShardSource` interface shape verbatim) and a `spells` branch beside the
  `items` branch in each of `offer`, `measure`, `answer`, `keep`, plus `askSpellShard`/`spellRoom`
  beside `askShard`/`itemRoom`.
- Front-end/IPC plumbing (`SpellCatalogueHarvest.tsx`, `useSpellHarvest`, the
  `wikiSpellHarvestStart/Stop/Status/Progress` channels) is a near-total copy of the item side —
  `HarvestProgress` carries no catalogue-specific fields, so both harvests share that one type
  rather than each getting an identically-shaped duplicate.

## Consequences

- A caster can now fill the Spells tab in the background the same way the Items tab fills, and two
  connected peers split the ~2,054-page walk between them instead of each fetching it alone.
- The hub has two copies of the same four branches (`items`/`spells`) rather than one generalized
  one. Acceptable for two kinds; worth refactoring into a table-driven "sharded kind" concept if a
  third one is ever added — the research behind this ADR already sketched what that would look like.
- `PeerShareDeps.items`/`.spells` are two separate optional fields rather than a
  `Record<ShareKind, ItemShardSource>` — same reasoning, same threshold for revisiting.
- Nothing about the Items tab or its own harvest/sharing changed; the shared files it depends on
  (`harvest.ts`, `item-shards.ts`, `explore.ts`) were extended by use, not by edit.
