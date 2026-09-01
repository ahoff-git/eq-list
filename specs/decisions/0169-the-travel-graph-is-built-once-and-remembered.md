# 0169: The travel graph is built once and remembered

## Status

Accepted

## Context

[ADR 0072](./0072-a-folder-of-maps-is-named-once-and-remembered.md) took the *naming* of a map folder off
the launch path and left the *travel graph* on it. The graph was built on first ask and kept for the run,
on the reasoning that a graph belongs to whichever pack you picked, so a stored one would be an artifact
to keep in step with a choice the user can change from the titlebar. The comment saying so put the cost at
"~1s for 568 files".

The first ask arrives at launch. `STORAGE_KEYS.mapTravelOpen` is persisted, the map window is restored if
it was open last session, and the route panel asks too — so on a real install the graph was built about
two seconds after `app ready`, on the main process, synchronously, while every window's IPC queued behind
it.

Measured on a real install (Brewall's 568 files beside the game's own 138), warm:

| | main process held |
|---|---|
| `harvestSource` — the folder scan, already async and chunked | 164 ms |
| `absentZonesFor` — is each of 568 zones in this era? | 475 ms |
| `buildTravelGraph` | 1,550 ms |
| `applyManual` | 112 ms |
| **total** | **~2.2 s** |

Two findings changed what the fix had to be.

**The build was quadratic, and not on purpose.** `zoneFileFor` is the one answer to "which map file does
this zone name mean", asked once per distinct exit label. It called `resolveZone`, which *indexes its
candidates and throws the index away* — right for a list that arrives per call, wrong for a pack's
`file → name` gazetteer, which is fixed for the run. So naming 600 labels folded, word-split and sorted
568 candidate names 600 times over. That is the 1,550 ms, and the 112 ms, and most of the 475 ms.

**The rest was the fuzzy tier, and the same shape.** `zoneAvailable` resolves against the shipped
352-zone expansion table with `{narrow, fuzzy}`; a name the table has never heard of — a custom zone, an
instance — falls through to a full Levenshtein sweep. `fuzzyScore` re-tokenised *both* strings on every
call, so 600 queries × 352 candidates re-split the same 352 candidate names 600 times each, and
`levenshtein` allocated a fresh row array per character of the query. The map window's zone list
(`zonesFromSources`, 706 names → 402 zones) paid this in the **renderer**, inside a `useMemo` that re-runs
each time a pack's solved names land: 702 ms the first time and 222 ms on each recompute, three times over
during the window's load.

None of this is visible as "the travel graph is slow". It reads as the app stuttering while the map comes
up.

## Decision

**The built graph is kept in `userData` between runs**, in `travel-graphs.json`, keyed by map folder —
the same file-per-app, folder-per-entry shape the gazetteer uses, and for the same reason. What guards it
is a key naming everything the graph was built from (`cacheKey`), so "recompute when something changes"
is a fact about the inputs rather than a promise:

- the **map folder**, by `folderSignature` — the *same* fingerprint the gazetteer keys on, exported and
  shared so one pack can't be fresh for one of them and stale for the other;
- the **era**, since the wiki's out-of-era list closes and re-opens whole expansions;
- the **curated inputs** — `manual-links.ts` and the shipped adjacency table — fingerprinted by
  stringifying them, because they are data and can therefore answer for themselves;
- the **build itself**, by the running app's version, which is the only thing that can speak for code.

`cacheDir` is a dependency, so the tests and the scripts pass none and build every time, which is what a
caller checking the *build* wants.

**The folds the build leans on are memoised, keyed by identity.** Three of them, each a pure function of a
string drawn from a small vocabulary:

- `zoneFold` (and so `zoneKey`) keeps a bounded `Map` of what it has folded — the app's most-asked
  question, and up to six passes of five regexes each time it was asked;
- `zoneFileFor` keeps one `ZoneResolver` per gazetteer in a `WeakMap`, keyed on the gazetteer *object*
  rather than its contents: `zoneNamesFor` builds a fresh one per source, nothing mutates one in place,
  and a map nobody holds any more should not pin its index in memory;
- `fuzzyScore` keeps each string's tokens and their joined form, privately — `tokenize` still hands every
  caller its own array, since a shared one is only safe where nothing can write to it. `levenshtein` reuses
  one row buffer instead of allocating per character.

Rejected alternatives:

- **Ship a built graph.** That is the artifact this deliberately isn't: a graph belongs to the folder in
  front of *you*, and `data/travel-graph.*.json` stays a thing to read and argue with rather than to load.
- **Bump a `TRAVEL_BUILD_VERSION` by hand** for code changes, as `GAZETTEER_VERSION` does for the naming
  rule. The app's own version is already exactly that fact and cannot be forgotten. The stored *shape*
  still has a constant, because that is a shape and not a rule.
- **A worker thread**, for the same reason ADR 0072 rejected one: with the answer kept, a build happens
  approximately never.
- **Drop the fuzzy tier from `zoneAvailable`.** `zones/resolve.ts` records that, measured against the
  shipped table, the tier fires on nothing — so it is tempting. But "fires on nothing today" is a
  measurement of the *current* table, not a decision about what a resolver is for, and making it cheap
  costs nothing that removing it would have saved.

## Consequences

- The graph is read back in **17 ms** instead of built in 2,181 ms. The launch-time freeze is gone.
- A build that does have to happen — a pack installed or updated, an era opening, a release, an edit to
  `manual-links.ts` — costs **283 ms** rather than 2,181 ms, because the memoisation stands whether or not
  the cache hits.
- The map window's zone list costs **139 ms** on first build and **32 ms** on each recompute, down from
  702 ms and 222 ms. That is renderer time, so it is felt directly as the window coming up.
- `travel-graphs.json` is ~0.4 MB per real install and grows by one entry per map folder ever used. It is a
  cache, not data: deleting it costs one rebuild and nothing else, which is why it carries no
  `data-provenance` concern of its own.
- The memoised folds live for the process. They are correct only because the functions are pure and the
  gazetteer key is an identity — a future caller that mutates a `zoneNames` object in place would read a
  stale index, and should build a new object instead.
- `folderSignature` and `currentAppVersion` are now exported. The signature's limits are unchanged
  ([ADR 0072](./0072-a-folder-of-maps-is-named-once-and-remembered.md)): it is not a content hash, and the
  edit it can miss now costs one stale graph as well as one stale zone name, until something else touches
  the folder.
