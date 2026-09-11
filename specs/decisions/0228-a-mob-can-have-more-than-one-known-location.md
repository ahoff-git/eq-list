# 0228: A mob can have more than one known location

## Status

Accepted

## Context

`src/shared/mob-stats.ts` has always reduced every kill position for a `(mob, zone)` pair to exactly
one `MobArea` — the plain average of every trusted position ever recorded (`areaOf`), further blended
across a retirement fold and across peers (`mergeAreas`). That single-average model quietly breaks for
a mob that actually spawns in two or more separate camps: the centroid lands *between* them, a spot
nobody has ever seen it stand, and `spread` balloons wide enough to paper over the gap. It's the exact
mistake `src/shared/map/mob-place.ts`'s own header already names for a different pair of claims
("averaging a measurement with a stated point would produce a coordinate nobody claims") — this
codebase already knew not to do it for *source* (mine vs. peers' vs. the wiki); it just hadn't yet
applied the same rule across *location*.

This follows directly from [ADR 0225](./0225-a-repeated-guess-earns-more-trust-than-a-lone-one.md)'s
"log every guess, and trust the ones that stack up" — the same idea, aimed at positions instead of
faction causes: instead of one blended guess, keep every distinct spot a mob has actually died at, and
grade each one's trust by how many kills corroborate it, via the same `estimates.ts` sample-size ladder
`causeConfidence` already uses.

The raw material for this already existed and needed no new storage: `observeMobs` was already
collecting every trusted kill position into one flat list right before throwing the split away in a
single average, and the map already draws every individual kill as its own dot, unclustered — the
heatmap was never the bottleneck, only the one figure derived from it was.

## Decision

- **Cluster instead of blend.** `clusterAreas(areas, thresholdUnits = LOCATION_CLUSTER_UNITS)` is a
  greedy agglomeration: repeatedly combine whichever two positions/areas sit closest together
  (`combineAreas` — the same weighted-centroid, widened-spread math a single roam area always used,
  just applied to a candidate pair instead of an entire list), stopping the moment nothing left is
  within `LOCATION_CLUSTER_UNITS` (600, an unverified starting guess — see Consequences) of anything
  else. This replaces `areaOf`/`mergeAreas` at all three places that used to call them: `observeMobs`'s
  raw-point fold, `sumObservations`'s retirement fold (ADR 0056), and `mergeObservations`'s
  cross-peer pool.
- **Confidence per location**, mirroring [ADR 0225](./0225-a-repeated-guess-earns-more-trust-than-a-lone-one.md)'s
  `causeConfidence` exactly: `areaConfidence(area)` reads a cluster's own `samples` through
  `estimates.ts`'s `confidenceOf`, against a new `AREA_SAMPLES: SampleScale = { fair: 3, solid: 10 }`
  (also unverified). `areaConfidenceWhy` is the tooltip wording.
- **`area` (singular) stays, and now means "the most-corroborated cluster."** Rather than renaming it
  to `areas` everywhere — a large, unnecessary blast radius across roughly nine files that don't need
  to change behavior at all — `MobObservation`/`MobKnowledge` gain `areas: MobArea[]` **alongside** the
  existing `area?: MobArea`, redefined as `areas[0]`. Every reader written before this existed
  (`mob-place.ts`'s `mobPlace`, `hunt-pins.ts`'s `bestPlaced`, `item-sources.ts`, the map panel's ±
  button, a mob's wiki page, an item's "who drops this") keeps working completely unchanged, and gets a
  strictly better answer for free: a real camp's own centroid instead of a blend of two.
- **Backward compatible on the wire and on disk, both directions, with no encoder changes.** A
  `MobObservation` this app constructs always carries both fields, so an older peer that only reads
  `.area` still gets a sensible (now better) answer with zero changes on their end. Reading *their*
  possibly-old payload (or an old `retired` row already on disk) goes through `withAreas`, a small
  shared normalizer (`obs.areas ?? (obs.area ? [obs.area] : [])`, then recomputing `area` from
  `areas[0]`) applied at the three places that read data this module didn't just construct itself:
  `electron/kill-log.ts`'s `read()`, `electron/mob-knowledge.ts`'s `sanitizeObservations` (vets an
  incoming `areas` array element-by-element, the same shape check the existing single-`area` check
  already made), and `src/shared/peer-share.ts`'s `readMobObservation` (a new sibling `readAreas`).
- **UI**: `MapLink.tsx` gains `RoamLinks`, a plural sibling to the existing `RoamLink` — a mob with
  exactly one known location renders identically to before; more than one shows each spot's spread
  colored by `areaConfidence`, reusing `.md-rate`'s existing thin/fair/solid palette (the same one a
  drop rate already uses) rather than inventing new colors, capped at 3 with "+N more" (mirroring
  `FactionPanel.tsx`'s `MAX_CAUSES_SHOWN`). Wired into the map panel's per-mob row, a mob's own wiki
  page ("Your kills"), and an item's page ("who drops this").

Rejected alternatives:
- **Renaming `area` to `areas` everywhere.** Would have forced every one of roughly nine unrelated call
  sites to change for no behavioral gain, and broken the peer wire format's backward compatibility
  outright rather than as a graceful degrade.
- **Retroactively re-clustering already-retired history**, or resetting/re-digesting a log to force it.
  A `retired` `MobObservation` written before this feature only ever held one blended average — the
  individual positions behind it are gone (ADR 0056 keeps what a retired record *taught*, not the raw
  points it was taught from), so there is nothing to re-cluster even in principle. Worse, forcing a
  rebuild isn't actually possible the cheap way: `record()`'s own permanent per-kill dedupe
  (ADR 0207's `killKeys`, kept forever, independent of whether the record is still held or has already
  retired) means a plain "digest the log again" is a no-op for any kill already seen — the only lever
  that frees old kills to be re-recorded at all is wiping the *whole* kill log (`clear("everything")`),
  which is a much bigger reset than "just relearn where things spawn" ought to require. **This isn't
  needed anyway**: `sumObservations`/`mergeObservations` already flatten a retired legacy blend
  together with whatever's freshly clustered from *live* kills on every read, so a genuinely separate
  new camp shows up as its own row the moment enough fresh kills land there — no reset, no re-read, no
  waiting on a release. The stale blend itself never gets any less blended, but the mob's reported list
  of locations keeps improving anyway, for free, just by continuing to play.

## Consequences

- A mob camped in two genuinely separate spots now shows both, instead of one meaningless average
  between them — a strict improvement with zero behavior change for the far more common case of a mob
  with only one real camp.
- `LOCATION_CLUSTER_UNITS` (600) is the single least-verified number in this decision: EQ zones range
  from a small dungeon room to a sprawling outdoor tract, and one global distance threshold is a
  simplification of what genuinely varies zone to zone. Too small and a mob's ordinary wandering
  fragments into noise; too large and two real camps never split. Unverified the same way
  `CORRELATION_WINDOW_SEC` was before a real log corrected it
  ([ADR 0224](./0224-a-kill-can-log-after-the-faction-line-it-caused.md)) — revisit the moment a real
  zone's camp spacing says otherwise.
- `AREA_SAMPLES` (`{fair: 3, solid: 10}`) is likewise a starting guess, not a measurement.
- **Not attempted in this pass**: multiple pins for one mob on the map canvas itself
  (`MapPanel.tsx`'s `RenderPin`, `hunt-pins.ts`'s one-pin-per-hunted-mob). The existing single "±N,
  click to pin" affordance already improves for free — it now pins the best-supported location rather
  than a blend — and teaching the map to drop several pins for one hunted mob is a natural follow-up,
  not required to recognize and trust multiple locations, and would pull in `mob-place.ts`'s
  source-ranking logic (a different axis — which *source* to trust — that this app is careful not to
  conflate with *which location*).
