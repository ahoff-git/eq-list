# 0064: A zone belongs to an expansion, and that's how we know it exists

## Status

Accepted

## Context

A map pack surveys **EverQuest**, not EQ Legends. Brewall's draws all 26 expansions, so the app is
handed a `.txt` for Argath, Bastion of Illdaera — a Veil of Alaris zone from 2011 — and it looks exactly
like a `.txt` for Greater Faydark. Nothing in the corpus tells them apart: same format, same coordinate
space, same kind of exit labels.

The consequences ran through everything built on the maps. The zone picker offered zones that don't
exist. The travel graph ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)) joined them into borders
and routed through them — the Plane of Knowledge in particular, which plenty of zones label
`to The Plane of Knowledge (Click Book)`, became a hub shortcutting half the world.

We tried the obvious things and each was too small:

- **eqlwiki's era flags** ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)) get Kunark and Velious
  right, because the server's own wiki knows those eras and says per zone which era it is. But eqlwiki
  has no page for Argath at all — Legends is nowhere near Veil of Alaris — so the derivation is blind to
  everything past the eras the server tracks, which is most of EverQuest.
- **A hand-written exception list.** One entry (the Plane of Knowledge) was tolerable. Adding Veil of
  Alaris meant twelve more, and there are ~20 expansions after it: the list would have grown to several
  hundred names, each typed from memory, none checkable.

## Decision

**Record which expansion every zone came with, and ask that.**

`scripts/fetch-zone-expansions.mjs` fetches each expansion's own zone table from the EverQuest fandom
wiki — one table per expansion page — and writes `src/shared/zones/expansions.generated.ts`: **347 zones
across 22 expansions**, release-ordered. Fetched, not typed, and regenerable when an expansion ships.

`src/shared/zones/expansions.ts` is the lookup over it, and **one function is the app's whole answer**:

```ts
zoneAvailable(zone, outOfEra?) // can you go there?
```

- **`"future"`** — the zone's expansion isn't one this server runs. Permanent, static, needs no network.
- **`"out-of-era"`** — the server has the expansion but hasn't opened it. Comes from eqlwiki's live
  flags, passed in, and stops applying the day the era opens with nothing edited.

Keeping those two apart is the point: *when a zone came into existence* never changes, while *whether
its era is open* changes as the server progresses, and only one of them belongs in a checked-in file.

**It fails open.** A zone the table has never heard of is available. That is the load-bearing decision,
because the two failure directions are not equal: offering a zone you can't reach is a wasted click,
while excluding one you *can* removes it from the map, the picker and every route, silently. There are
real zones in that gap — Legends' own custom zones, and 26 zones eqlwiki names differently from fandom
("Kerra Island" for "Kerra Isle", "Eastern Plains of Karana" for "East Karana"). The generator enforces
the other half: it **refuses to write** a table that would file a zone eqlwiki knows under an expansion
the server doesn't run.

Used at both boundaries, so they can't disagree about which world you're in:

- **The map's zone list** (`zonesFromSources`) drops unavailable zones, so a pack's 568 files offer only
  what's here. `zonesFromFiles` deliberately does *not* filter — "what is this folder's zone called" is a
  different question, and the naming tests lean on it.
- **The travel graph** excludes them at creation ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)), so
  regenerating stays safe, and a route asked for one refuses by name rather than saying "no way through".

Rejected alternatives:

- **An allow-list: keep only zones eqlwiki lists.** The tightest rule and the most dangerous. It
  inverts the failure direction — every naming gap becomes "this zone doesn't exist", and the map
  solver names only 54 of the game's own 133 files, so it would delete most of the world.
- **Deriving it from the map files.** There is nothing in a `.txt` to derive it from. That's the problem.
- **A hand-written list per expansion.** Several hundred names typed from memory, unverifiable, and one
  more round of it every time an expansion is mentioned.

## Consequences

- One function decides which zones exist, so the map, the travel graph and the route panel agree. Adding
  a third consumer is a call, not a design.
- **The hand-authored exception list is gone.** `ABSENT_ZONES` in `manual-links.ts` existed only because
  the Plane of Knowledge has no eqlwiki page; the expansion table files it under Planes of Power, so it
  and ~350 others exclude themselves.
- **The table is checked against the server's own wiki, both ways.** Every one of eqlwiki's 116 zones
  belongs to an expansion this server runs (or the generator won't write), and the 26 it can't find are
  reported as the fail-open cases they are.
- **Three expansion pages have no table the generator can read** — Omens of War, Ring of Scale, The
  Darkened Sea — so their zones aren't excluded yet. They'll show as available and, being their own
  continents, will sit as isolated zones rather than corrupting a route. Tracked in [todo.md](../todo.md).
- Kunark and Velious are on the server's list even though they're currently closed, because being closed
  is eqlwiki's business. When they open, the routes appear — and so do the boat legs in
  `manual-links.ts`, which are already written and waiting.
- The generated file is committed. It's data with a stated provenance and a script to rebuild it, and
  the alternative is a network call on startup to answer a question that changes once a year.
