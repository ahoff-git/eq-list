# 0062: A travel graph of zone lines — route between zones, never inside one

## Status

Accepted

## Context

Getting from one zone to another in EverQuest is the thing the game explains least. The map shows you
where you are; nothing shows you that Ak'Anon is four zones from Greater Faydark, or that a boat
would have saved you an hour.

**This looks like the thing that was already removed, and isn't.**
[ADR 0049 is retired](./README.md) because it recorded pathfinding over a map's **geometry**, taken
out again. The reason it failed is stated in the map spec and still stands: *an `L` record is a wall
in a dungeon and a contour line outdoors*, so nothing in the geometry says what's walkable, and a
route drawn through it is a guess dressed as advice.

The zone lines are different data with a different provenance:

- **They're labelled, not inferred.** `to The Lesser Faydark` is a mapmaker stating a fact about the
  world. That corpus is already trusted for something load-bearing — it's what names the zones
  ([ADR 0039](./0039-render-the-game-s-own-maps.md)), and its adjacency is the check that keeps the
  gazetteer honest ([ADR 0061](./0061-a-map-pack-names-its-own-zones.md)).
- **The answer is a list of zones, not a line on a map.** "Lesser Faydark, then Steamfont, then
  Ak'Anon" is either right or wrong; it can't be subtly, misleadingly wrong the way a drawn corridor
  can. The distances are approximations, and are the only part that can mislead — so they're where
  the honesty work goes, not the topology.

What's available: `poiKind` already classifies a label as a `zoneline` or a `transport`
([ADR 0048](./0048-a-map-label-is-read-by-its-words.md)), and `zoneLinkName` already extracts a
destination from one, with the noise (`(Click Book)`, `(Boat)`) and the ambiguous `A & B` forms
already handled. The graph is mostly a re-reading of a corpus the app already reads.

## Decision

**A travel graph whose nodes are boundaries, and whose edges are the walks between them.**

A node is **the border between two zones**, and the zones are metadata on it. Greater Faydark's
`to Clan Crushbone` and Clan Crushbone's `to Greater Faydark` are not two places — they're one, so they
collapse into `crushbone|gfaydark`, which knows it is in both zones and holds **its position in each**,
because a border is drawn on two maps in two coordinate frames.

Three things follow, and they're the whole design:

- **Crossing a zone line is free *and edgeless*.** Standing at the node is standing in both zones at
  once, so there is nothing to traverse and nothing to price. The graph has no "zone line" edge kind
  and no `zoneline` mode.
- **Every edge is a walk within one zone**, from one of that zone's boundaries to another, weighted by
  the distance between them in *that zone's* coordinates. Zone A with borders to B, C and D gets three
  nodes and a walk between each pair; the search then branches from each into the next zone, where the
  same thing has been done. Cost is therefore *EQ world units of straight-line walking* throughout, and
  the whole reason a port helps is that it replaces walking with none. Straight-line distance is wrong —
  nothing in EQ walks straight — but it ranks routes the way walking them does.
- **"Which exit pairs with which arrival" stops being a question.** It was unanswerable — there is no
  shared coordinate frame across two map files — and it dissolves rather than being answered: three
  exits from Greater Faydark into Lesser Faydark are three *crossing points of one border*, so the node
  keeps all three positions and a walk to it takes **the nearest**. An average would put the border
  somewhere none of them is.

The rest:

- **Walks are stored, not derived.** They're the substance of the graph rather than a rule applied over
  it, so they're in the file: inspectable, and editable one distance at a time by the hand-authored
  pass. With one node per border rather than one per label this is small — a zone has as many nodes as
  it has neighbours and conveyances, so the whole world is thousands of edges, not the hundreds of
  thousands a node-per-label model would have needed.
- **A teleport network collapses to a hub.** Every druid ring reaches every other, which is a clique;
  a hub with a free edge to each member has the same shortest paths and one node to skip when druids
  are off. **Only rings and spires are networks.** A boat runs between two *particular* docks;
  hubbing them would say every dock in the world reaches every other for free.
- **A stated destination is a border, wherever in the label it's stated.** `to Timorous Deep (Boat)` and
  `Boat to Timorous Deep` are the same fact about the world; reading only the first cost the graph every
  conveyance that names where it goes, and with it **all of Odus** — a continent reachable only by boat
  is an island when its boats are unpaired docks. So a conveyance's destination is read too, through the
  same `zoneLinkName` rules, and a border built from one carries the conveyance's name (`… ↔ … (boat)`)
  so a route can say what to take.
- **A border says how you cross it.** `via` — `boat` · `translocator` · `portal` · `spire` · `ring`, and
  **absent for an ordinary zone line**, which is most of them. Collapsing every crossing into "a
  boundary" is what makes the graph work, but it throws away the first thing a person wants to be told:
  both cost the same nothing, and "walk to the dock and take the boat" is still a different instruction
  from "walk over the line". One field rather than words in the border's name, so a consumer marks it
  once; `crossingOfMode` words a **port leg** the same way, so the route reads consistently whether the
  ride is a border or a hub edge.
- **A boat is a boundary.** It costs no walking and asks nothing of you but turning up at the dock,
  which is exactly what a zone line is — so it gets a border between the two zones, positioned at each
  end's dock, with **no mode, no cost and no toggle**. The ferry ride's minutes are real and are simply
  not what this graph measures. Two things follow: `to Timorous Deep (Boat)` is an ordinary border, so a
  pack that labels both ends pairs them up with no hand-authored entry at all; and where a boat *does*
  need an entry, it says "these two zones connect, here and here" rather than pricing a ride.

  A conveyance stays a conveyance only when taking it needs something of you: a class (druid, wizard) or
  whatever a Legends translocator turns out to ask. That, and nothing else, is what a toggle is for.
- **A zone the server hasn't got is never built, not built and removed — and which zones those are is
  asked, not listed.** The map corpus is a survey of *EverQuest*; which zones **this** server runs isn't
  in it. But it is on the wiki, which states the live eras (`Template:PageEra`) and each zone's era, so
  the exclusion list is **derived**: 45 Kunark and Velious zones today, none of them typed anywhere, and
  none of them still excluded the day Kunark opens. `ABSENT_ZONES` remains as the floor for what the
  wiki can't say — the Plane of Knowledge has no page in `Category:Zones` — and is one entry long.

  Both are an **input to `buildTravelGraph`**, not a later correction, because the property worth having
  is that *regenerating is safe*: a second pass that removes something is a second pass someone will
  forget, and the graph is then confidently wrong. Without it a zone like the Plane of
  Knowledge — which plenty of packs draw and plenty of zones label an exit to — becomes a hub that
  shortcuts half the world, and every route through it is confident and impossible. The exclusion is
  carried on the graph, so a route refuses with *"not in the game at this time"* rather than the useless
  "no way through".

  This is the one place hand-authored knowledge reaches into *creation* rather than the manual pass, and
  the reason is that it's **subtractive**. Everything additive can safely be a second pass: forget it and
  you get a thinner graph, which is honest. Forget a subtraction and you get a graph that lies.
- **Membership is read off the labels, not typed from memory.** Which zones have a ring is a
  `Druid Rings` marker, the same argument [ADR 0048](./0048-a-map-label-is-read-by-its-words.md)
  makes for the label filter. Hand-authored data *corrects and completes*; it isn't the source.
- **Ports need asking for.** Druid and wizard default **off** — both need a class you may not have or a
  favour you may not be able to call in, and a route that quietly assumed one would be advice you can't
  take. Translocator gnomes default **on**, being public transport; boats aren't a toggle at all, per
  above.
- **Generation is two passes, into two files.** `travel-graph.<source>.json` is what the maps said and
  is safe to regenerate at any moment; `travel-graph.<source>.routed.json` is that plus
  `manual-links.ts`, and is what you route over. Generating never touches the second, so a rebuild
  cannot quietly drop hand-authored travel — it goes stale, loudly, and the manual pass fixes it.
- **A graph belongs to one map pack**, like the zone names ([ADR 0061](./0061-a-map-pack-names-its-own-zones.md)).
  Two packs label different exits, so they describe different graphs of the same world.
- **Nothing is silently thinner than it claims.** A build reports the borders only one side drew, the
  destinations no map file answered to, the zones with no way in or out, and the labels that named
  nowhere. That report *is* the hand-massaging list.

Rejected alternatives:

- **Zones as nodes, weighted by the distance between zone centres.** The distance between two zone
  centres is not a distance anyone travels, and the model can't say where a port drops you — which is
  the requirement that motivated the feature.
- **A node per exit label, with the two sides joined by a free edge.** Built first, and replaced by
  this. It made a border two places that happened to be adjacent, which forced an all-pairs join
  between the two sides' labels (a guess about connectivity, made silently), invented an "arrival"
  node whenever a pack labelled only one side, and left a zone's node count proportional to its
  *labels* rather than its neighbours. One node per border is smaller, says less that isn't known, and
  needs no pairing rule at all.
- **A hand-written table of zone adjacency.** This is the "table typed from memory" the gazetteer
  exists to avoid, and it would be a second, drifting copy of what the maps already say.
- **Time as the cost.** Truer to what a player wants and unmeasurable from a map file: it needs run
  speed, terrain, boat timetables and aggro. Distance is a stated approximation; a time in minutes
  would read as a promise.

## Consequences

- The travel graph gets its own area (`specs/travel/`), and the map's "no routing" non-responsibility
  is narrowed to what it was always really about: **no routing inside a zone**, because geometry
  can't support it. Between zones, over labels, is a different claim on different data.
- **A route never shows a file name.** Zones are keyed by map file (`felwithea`) and read by long name
  ("Northern Felwithe"), and a route needs both — one to look a map up, the other to put on screen. So
  every zone it mentions is a `{ zone, name }` pair rather than a bare key, in the summary and on every
  leg: the friendly name is unmissable rather than something each consumer must remember to apply. The
  **build report** is the deliberate exception and names zones by file, because those are the keys you
  go and type into `manual-links.ts`.
- Routes are approximations and say so. A leg priced by a stand-in — a border only one side drew, an
  end whose position you never gave — is flagged, and the whole route carries `assumed`, so a UI can
  show a figure without implying it was measured.
- **A border only one mapmaker drew still exists**, holding a position in the zone that labelled it and
  none in the other. Walking to or from it there costs `UNKNOWN_CROSSING` and every such leg is
  flagged, so the border is usable without its distances pretending to be measurements.
- **Boats and translocator gnomes are the hand-authored surface, and they start unverified.** The
  shipped table is classic-EverQuest boat runs, each stated as a border; EQ Legends' own translocators
  are empty on purpose, because nothing about them can be read or reasonably guessed. The manual pass
  reports which entries found a real label, which named a zone this pack has no map for, and which are
  malformed — three separate complaints, because only the last is a bug in the table.
- **The app builds its graph at runtime; the stored one is for reading.** A graph belongs to the pack
  you picked, so a file on disk would be an artifact to keep in step with a titlebar choice. Building
  costs one pass over that folder's labels (22ms on a small folder, ~1s for 568 files), cached per
  folder like the gazetteer — so the "should we bundle one?" question doesn't arise, and the scripts'
  output is an inspection aid rather than an input.
- **A refusal carries its reason.** `findRoute` returns nothing for four different situations, so the
  IPC boundary uses `answerRoute`, which says which — a zone the pack has no map for, a typo, an island
  in the graph, or a port switched off all want different sentences. The answer also states how many
  zones and borders were looked at, because "no route" is only believable with a denominator.
- **Which conveyances you have is a setting, not a per-window filter.** Your class, or who you can call
  on, is a fact about you rather than about the map on screen — so `Settings.travel` holds it, one
  answer everywhere a route is asked for. The checkboxes are offered in the panel that uses them and
  nowhere else, since a second copy in the Settings window would be two places to disagree.
- **The apostrophe now folds for everyone.** EverQuest's map labels write a backtick
  (`Erud\`s Crossing`, `Kurn\`s Tower`) where the log and `CURATED_ZONES` write a typewriter one, so
  `Ak\`Anon` and `Ak'Anon` were two different zones and a real exit label resolved to nothing. Folding
  it only inside travel looked like the modest choice and was the wrong one — the same mismatch stops a
  zone line finding its map — so it went into `zoneKey` ([names.ts](../../src/shared/names.ts)), the one
  fold every zone comparison in the app shares. `travelZoneKey` survives as a pass-through, named for
  its role at the call sites.
- One gap in the shared label classifier is worked around rather than widened: `poiKind` reads
  `Druid Rings` as a plain name, because its transport vocabulary spells the ring singular. Travel
  re-reads labels it left in a **fallback** kind with its own vocabulary. That is a local fix to a
  pinned black box's blind spot, and it means the map's own label filter still files those markers
  under "Names & places".
- The map window hosts the panel (🧭) and draws nothing of the route, which keeps 0049's retirement
  intact: the answer is a list of places, and the canvas stays a picture of one zone.
