# 0341: A travel graph ships with the app, and routes use it by default

## Status

Accepted

## Context

A player reported that the 🧭 travel panel "just tells me to run everywhere", with druid and wizard
ports switched on. The cause was the map pack. Druid and wizard networks are wired from a pack's own
labels, and the game's own `maps/` folder labels neither, so a graph built from it has no teleport
hub at all. [ADR 0340](./0340-a-setup-check-may-offer-a-fix-it-can-prove.md) had routes borrow another
installed pack's labels, but that still failed anyone with no such pack. It also left every install
building, keeping and occasionally mis-keeping a graph of its own.

[ADR 0169](./0169-the-travel-graph-is-built-once-and-remembered.md) rejected shipping a built graph,
on the grounds that "a graph belongs to the folder in front of *you*". In practice, almost everyone
who routes well routes over Brewall's pack. Built from the same pack, a graph is the same on every
machine: the app's own build is deterministic. The graph is small (465 nodes, 2,797 edges, about 430 KB
of JSON and 52 KB gzipped), so building it on each machine buys nothing for most players.

The one real obstacle is the **era**. The build leaves out zones the server hasn't opened, by the
wiki's live list, and a graph built at release would freeze that list.

## Decision

**Ship one graph, built from Brewall's pack with every era open, close the era at load, and route over
it by default.**

- `npm run travel:bundle` (`scripts/bundle-travel-graph.mjs`) builds it with no era list and with the
  hand-authored pass applied. It writes `src/shared/travel/travel-graph.generated.ts`, keeping the
  pack's label and the `curatedKey` it was built with and dropping the machine's folder path. Each node
  and edge is one line of JSON parsed at load: diffable, and `string[]` to TypeScript, which refuses
  to infer a type for ~2,800 object literals (TS2590).
- At load, the router closes the live era with `withoutZones`. That uses the same name test the build
  uses (`absentZonesFor`) and removes every node standing in a closed zone and every edge touching one.
  On the real Brewall pack, against the live era, this gives **exactly** the graph a build with that
  era closed gives (465 nodes, 2,797 edges, costs included), and `travel-bundle.test.ts` holds a
  fixture to the same.
- **By default, `travelSource` returns the shipped graph** and reads no folder. That needs no maps
  folder either, so the setup check's travel row no longer `needs` the maps step.
- **Settings → "Map travel: build routes from my own map files"** (`TravelSettings.fromMaps`) brings
  back the local build of ADR 0169 and ADR 0340: the drawn pack if it can teleport, else the installed
  pack that reaches most. In that mode the shipped graph is still the fallback when no installed pack
  can teleport. Only this mode has a stored graph that can go stale, so only it is ever offered
  **Rebuild travel map**.
- The shipped graph answers under **the id of the pack it was built from** (`brewall`). Its markers
  land on that pack's drawings, the frame its positions were read in (ADR 0111), and nowhere else. On
  the game's maps a route is text only, and both the travel panel and the setup check say so.

This reverses ADR 0169's rejected alternative "ship a built graph". The rest of 0169 now governs the
opt-in local build.

## Consequences

- Teleport routes work out of the box on any install, with or without a pack, and the first route of a
  launch costs no folder scan.
- The bundle is an artifact to keep in step. `travel-bundle.test.ts` fails when `manual-links.ts` or
  the adjacency table move without a regenerate. A change to the build *code* isn't caught: regenerate
  the bundle when you change `build.ts`, `harvest.ts` or `manual.ts`.
- Brewall positions come from the version of the pack the bundle was built from. A player with an older
  Brewall install may see a marker slightly off; switching on the local build fixes that.
- About 750 KB in the install, loaded on first need rather than at launch.
- One pack's view of the world ships. A player with a different or newer pack opts into the local
  build; if a better-labelled pack becomes the norm, regenerate with `--source`.
