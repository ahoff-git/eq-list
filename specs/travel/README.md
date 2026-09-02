# Travel

## Purpose
Answer "how do I get from here to there?" across zones — a list of zone lines, ports and boats to
follow, ranked by how far you have to walk. Getting from zone to zone is the thing EverQuest explains
least; the maps already hold the answer in their exit labels, so this reads it out.

Settled in [ADR 0062](../decisions/0062-a-travel-graph-of-zone-lines.md), which is also where the
"isn't this the pathfinding that was removed?" question is answered: no — that was
[retired ADR 0049](../decisions/README.md), routing over a map's **geometry**, where an `L` record is
a wall in a dungeon and a contour line outdoors. This routes over **labels**, which are a mapmaker
stating a fact.

## The rules

Everything below is an instance of one of these. They are written out because the subsystem grew fast:
new evidence kept arriving — a pack that draws a zone twice, a sign read as twelve zone lines, a
stand-in that turned out to be a shortcut — and the risk with that is a pile of exceptions that each
made one route look right. **A change that isn't an instance of a rule here is either wrong or a new
rule, and a new rule has to say what it replaces.**

1. **A label is read by its words, and one that can't be believed is refused.**
   ([0048](../decisions/0048-a-map-label-is-read-by-its-words.md)) Never rewritten, never guessed at.
   `to X & Y` names two places so it names neither; `Abandoned Druid Ring` says it doesn't work
   ([0114](../decisions/0114-a-conveyance-the-map-calls-dead-is-not-one.md)); twelve destinations in one
   spot is a sign rather than twelve zone lines
   ([0119](../decisions/0119-a-pile-of-destinations-is-a-sign.md)). Refusal is always the answer,
   because the alternative is inventing the half we can't read.

2. **One place is one node.** ([0062](../decisions/0062-a-travel-graph-of-zone-lines.md)) A border is
   one node in two zones, which is what makes zoning free and dissolves *which exit pairs with which
   arrival*. A zone drawn twice is one zone
   ([0111](../decisions/0111-one-zone-one-map-file.md)); a gnome serving two borders is one gnome, so
   the walk between them is nothing.

3. **Evidence has a precedence, and it never runs backwards.**
   ([0117](../decisions/0117-the-wiki-says-which-zones-touch.md)) A person's judgement (the hand-authored
   tables) outranks an exact map label, which outranks the wiki, which outranks inference
   ([0115](../decisions/0115-a-border-one-side-could-not-name.md)). A weaker source may only **add**
   what a stronger one is silent about — the wiki says two zones connect and can never say where, so it
   contributes no coordinate to anything.

4. **A stand-in is never a measurement, and never a shortcut.**
   ([0118](../decisions/0118-a-stand-in-is-not-a-shortcut.md)) `UNKNOWN_CROSSING` prices reaching a
   border nobody drew. It wears a `?` wherever it is shown, and it cannot be chained into an answer
   cheaper than the truth — which is why you never walk *through* a node inside one zone.

5. **A row is one instruction.** ([0116](../decisions/0116-a-route-is-drawn-as-the-measurement-it-is.md))
   Not a node, not a step — a thing you do. A hub is no row, an arrival nobody walked is no row, and a
   crossing you have to be *at* is two: the walk that costs, then the ride that doesn't.

6. **The map draws what the graph holds, never what it infers about the ground.**
   ([0113](../decisions/0113-the-graph-is-drawn-on-the-map-it-was-read-from.md)) Markers sit at stated
   coordinates; a leg is the straight dashed line its distance was measured along. Nothing is derived
   from the geometry — [retired 0049](../decisions/README.md) — and nothing is said twice: where a node
   marks a point, the map's own label for it goes.

7. **Anything the app decides for you is visible and reversible.**
   ([0109](../decisions/0109-a-route-can-be-denied-one-place.md)) Every refusal is in the build report,
   every ruled-out place is a chip with an undo, every guessed figure wears its `?`, and the survey says
   where the graph is thin. A correction nobody can see is one nobody can argue with.

**What follows from them, and is worth stating because it keeps being tempting:** a rule that
duplicates another belongs to whichever layer is nearer the cause. The reader used to drop a border the
route had walked past; once the router refused to walk through a node at all, that reader rule could
only ever have fired where a `ManualBlock` made the detour *real*, so it was deleted rather than kept
as insurance.

## Responsibilities
- **The graph** (`src/shared/travel/`, pure and DOM-free, so it's unit tested and usable from either
  process):
  - `types.ts` — `TravelNode` / `TravelEdge` / `TravelGraph`, the `TravelMode` list
    (`walk` · `druid` · `wizard` · `gnome` · `succor`), `TravelNetwork` and `TRAVEL_DEFAULTS`;
    `TravelOptions` and `TravelAvoided`; `UNKNOWN_CROSSING`, `dist3d`, `positionsIn`, `zoneDistance`
    and `boundaryId`.

    **A node is a boundary, and the zones are metadata on it.** Greater Faydark's `to Clan Crushbone`
    and Clan Crushbone's `to Greater Faydark` are one place, so they are one node —
    `crushbone|gfaydark` — which knows it's in both zones and holds **its position in each**, because
    a border is drawn on two maps in two coordinate frames.

    That makes **crossing a zone line free and edgeless**: standing at the node is standing in both
    zones, so there's nothing to traverse and nothing to price. There is no `zoneline` mode — and no
    `boat` mode either, for the same reason: **a boat is a boundary.** It costs no walking and asks
    nothing of you but turning up at the dock, so it's the same kind of thing as a line you step over,
    and the ferry's minutes are simply not what this graph measures. A conveyance stays a conveyance
    only when taking it needs *something of you* — a class, a faction, a fee.

    **Every edge is a walk within one zone**, from one of its boundaries to another, weighted by the
    distance between them in that zone's own frame. So the cost unit throughout is **EQ world units of
    straight-line walking**. Straight lines are wrong (nothing in EQ walks straight) and are honest
    about being wrong; they rank routes the way walking them does.

    A zone can offer **several crossings of one border** — three ways out of Greater Faydark into
    Lesser Faydark — so `at` holds a list per zone and `zoneDistance` takes **the nearest pair**.
    That's both the truthful answer (you use the near one) and what dissolves the question nothing
    could answer: which of A's exits pairs with which of B's arrivals.

    The other two kinds: a `place` sits in one zone (a druid ring, a spire, a dock), and a `hub` is a
    teleport network, in no zone at all.

    **A port is cast from where you stand.** A druid or a wizard doesn't walk to a ring to leave — they
    cast, wherever they are — so a hub's edges run **one way, out to its destinations**, and the search
    enters the network for free from the start. Every ring in the world is therefore a destination from
    every zone, *including zones with no ring in them at all*, and the only thing a port costs is the
    walk from where it drops you. This was wrong at first: the graph made you walk to a ring to leave,
    which priced a port at the cost of reaching one and left a druid in a ringless zone being told to
    hike. It also means a **lone** ring is a network worth having, where under the old model it went
    nowhere. A boat is the opposite and stays two-way: you have to go and board it.

    **A succor is that same rule, one zone wide** ([ADR 0069](../decisions/0069-a-succor-is-a-port-inside-one-zone.md)).
    An evacuation — the spell, or the `/pick` that drops you at the same spot — moves you from wherever
    you're standing to one fixed safe point *in the zone you're already in*. So the safe point is a
    `place` with a free edge **into** it from every other node in that zone, and leaving it is an
    ordinary walk. What it buys is the leg that usually dominates a route: the walk from where you are
    to the way out. It wires **no hub**, because its network has exactly one destination — this zone's —
    and hubbing it would say every safe point in the world reaches every other; for the same reason a
    `pair` or a `network` entry can't be written in `succor` mode at all (`TravelJoin`).

    `zoneFileFor` is **the one answer to "which map file does this zone name mean"** — folded, then exact,
    then the same words in another order, then tried as a file name. There were three of these (the
    builder resolving a label, the manual pass resolving an entry, the router resolving an endpoint) and
    they disagreed about the fallback, so an isolated zone resolved by its long name but not its file name
    and an excluded zone asked for by file said "no such zone" instead of "not in the game". One rule now,
    shared. It stops at rephrasing: `resolveZone`'s `narrower` tier would route "East Commonlands" to
    "Commonlands", which is a wrong answer that reads like a right one
    ([ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md)).

    **How you cross is `via`** — `boat` · `translocator` · `portal` · `spire` · `ring` — and **absent is
    the common case**, meaning an ordinary zone line with nothing to take. A boundary is a boundary
    whichever way you cross it, which is what makes the graph work; but which way it is, is the first
    thing a person wants, because "walk to the dock and take the boat" is a different instruction from
    "walk over the line" even though both cost the same nothing.

    One field, not two. It was briefly appended to the border's *name* as well (`A ↔ B (boat)`), which
    meant every consumer either showed it twice or had to check whether the words were already in there
    — so the name is the two zones and `via` is how you get between them. `networkOfCrossing` maps it to
    the permission side (a ring is a druid's, a portal is nobody's), and `crossingOfMode` goes back the
    other way so a **port leg** words itself exactly as a border does.

    **A crossing you have to be *at* is two instructions.** A boundary node *is* the crossing, so
    arriving at Butcherblock's translocator means both walking to it and taking it — and the row read
    `4.1k Translocate to The Ocean of Tears`, pricing the ride at the length of the walk. The ride is
    free; what costs is getting there. So a walk into a border that names a conveyance splits into
    *run 4.1k to the translocator*, then *translocate to the Ocean of Tears* (`CROSSING_PLACES` is the
    noun you walk up to, as `TRAVEL_VERBS` is what you do). An ordinary zone line doesn't split, because
    walking to it and stepping over it are one act; nor does a **port**, which is cast from where you
    stand and has no walk to split off; nor does a crossing you are already standing on. The walk row
    carries the distance and the line on the map, the crossing row carries the ride and the ✕.

    `TRAVEL_VERBS` gives the wording, and it is a table of **verbs including walking** — *Run · Boat ·
    Teleport · Translocate · Portal · Succor*. It replaced a table of nouns that could only label a
    border (`boat`, `ring`, `spire`), which left the one thing every step has — how you covered the
    distance — as the only thing with no word for it. A ring and a spire are both **Teleport**: from the
    reader's side they are the same act, and which network it was is already on the step (a ring is
    labelled "Druid Rings") and in the route's `modes`.
  - `harvest.ts` — `travelPoint` / `harvestZone`: a map's labelled points → the travel points in one
    zone. Which labels are zone lines and which are conveyances is **`poiKind`'s existing judgement**
    ([ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md)), and a destination is read by
    **`zoneLinkName`**, which already strips the noise (`(Click Book)`, `(Boat)`) and already refuses
    the labels that name two zones at once. Reused, not re-decided.

    Two additions of its own. A label `poiKind` left in one of its two **fallback** kinds is re-read
    with this module's conveyance vocabulary — `Druid Rings` reads as a plain *name* to the shared
    classifier, because its transport words spell the ring singular, and a graph that trusted that
    would miss the druid network on every pack that writes it plural. Only the fallbacks, which is
    what keeps it safe: `a dock worker` is a `mob` and `Dock Merchant` is a `merchant`, and neither is
    offered.

    And **a conveyance that says where it goes has its destination read**, not thrown away. Both
    `to Timorous Deep (Boat)` *and* `Boat to Timorous Deep` state the same fact; only the first starts
    with "to", and for a while only the first became a border — which left every `Boat to X` /
    `Translocator to X` joining nothing, and **cut Odus off the graph entirely**, since a continent you
    can only reach by boat is an island when its boats are unpaired docks. The tail after `to` is handed
    to `zoneLinkName` so its rules apply unchanged (the noise it strips, the `A & B` forms it refuses),
    and a destination no map file answers to costs nothing: the builder keeps the place for
    `manual-links.ts` to pair, and reports the miss.

    A label that names **no single destination** — a bare `Zone Line`,
    `to East Freeport & The Butcherblock Mountains` — is dropped and *counted*. It says a border is
    here, which a graph can't use without knowing the other side, and inventing one would be a guess.

    **A border only one side could name is named by the other side** (`pairByReciprocal`,
    [ADR 0115](../decisions/0115-a-border-one-side-could-not-name.md)). Misty Thicket labels a way out
    to `The Liberated Citadel of Runnyeye`; nothing in the catalogue answers to that, so the label
    resolved to nothing and its coordinate was thrown away — while RunnyEye's own map says
    `to Misty Thicket`, which resolves, leaving a border placed on one side and priced at
    `UNKNOWN_CROSSING` from the other. So for a destination nothing could place, the candidates are
    **the zones that claim a border with this one and got no coordinates from it**, and against that
    list every tier of `resolveZone` is allowed — including the `narrower` and `fuzzy` that
    [ADR 0068](../decisions/0068-a-zone-name-resolves-against-what-we-know.md) rules out globally.
    What buys them is that every candidate has **already asserted the connection**: this pass never
    invents a border, it only decides which of a zone's labels the neighbour meant and contributes the
    coordinate, so a wrong answer measures a walk to the wrong exit rather than claiming a way through
    that isn't there — and `resolveZone` still fails closed on a tie. Run after the whole corpus (a
    border may be claimed by a zone read later) and before the walks (a coordinate is what a walk costs
    from). **17 pairings on the pack that prompted it, all correct**, one-sided borders 161→146; each
    is in the report with the tier that made it, and a paired destination stops being counted as
    unresolved.

    **A map file that draws somewhere you cannot go** is listed by hand where no name can reach it
    (`NOT_IN_GAME` in `manual-links.ts`). The expansion table and the wiki's era flags both work on a
    zone's *name* and both fail open on a name they've never heard of — which is right for a Legends
    custom zone and wrong for `mmca`: a pack ships `mmca.txt`…`mmcj.txt`, nothing answers to "Mmca", and
    so ten instances of Mistmoore's Catacombs each drew a border into Lesser Faydark and a player
    looking at that zone was offered *→ Mmca, → Mmcb, → Mmcc*.

    **Found, not guessed**, and the finding is not the rule. One query gives the worklist — a zone whose
    entire travel content is a single border, where the neighbour's own mapmaker never drew a way in, so
    it exists only because that file claims it — and it returns 44 zones, of which **four are real
    places**: the Plane of Hate, Veeshan's Peak, Howling Stones and the Endless Caverns. Losing a real
    zone is far worse than offering an unreachable one, so the query is the worklist and the list is the
    judgement. It takes one-sided borders from 154 to 107.

    **An old drawing a pack keeps beside its current one** is folded away by hand where no rule can see
    it (`STALE_DRAWINGS` in `manual-links.ts`): `toxxulia` is the pre-split map of a zone that is now
    Tox *and* Kerra Ridge, so its exits mix two zones' and belong to neither; `freeporteast` is the
    modern East Freeport and says so, labelling `to The Devastation`, six expansions past this server;
    `northro` is the revamped North Ro and says so too, labelling `to The Commonlands` and
    `to Freeport Sewers` where this server has East and West Commonlands and no sewer zone line
    ([ADR 0174](../decisions/0174-the-era-decides-which-drawing-is-the-zone.md)).
    The evidence that the survivor is the right one is the same every time, and it is what makes
    discarding the other safe: **the surviving file agrees with the game's own map and the discarded one
    does not.** Brewall's `misty` puts `to Rivervale` at `2551, -408` where the game's own file has
    `2562, -411`; `mistythicket` puts it at `1490, -181`. The discarded drawings are rescaled redraws in
    their own coordinate space, so their positions cannot be borrowed even where their labels are richer
    — which is why the wiki, not a merge, is how those connections come back.

    **A conveyance the mapmaker marked dead is not a conveyance.** A ring is a ring by its words, and
    those words sometimes say it doesn't work: Greater Faydark's *only* druid ring is labelled
    `Abandoned Druid Ring`, and you cannot port to it. Read as live it is worse than a missing one — a
    hub makes every ring a destination **from every zone in the world**, so one dead marker offers the
    whole map a free ride to a circle of stones that doesn't work, and the route that takes it is
    confident and wrong. The whole corpus, measured across both packs and ~1,200 files, holds four words
    and five labels: `Abandoned Druid Ring` (gfaydark), `Ruined Druid ring` (direwind), `Inactive Druid
    Ring` (rathemtn), `Broken Wizard Spire` (nektulos), `Broken Portal` (umbral). **Adjacency is what
    keeps it safe** — the dead word must sit on the conveyance, one word between them at most for
    `Broken Wizard Spire` — because the loose version reads `to the Broken Skull Rock (boat)` as a dead
    boat. Checked before the label is read as anything, so it holds for a border naming a dead crossing
    as much as for a place.

    **A pile of destinations at one spot is a sign, not a set of zone lines**
    ([ADR 0119](../decisions/0119-a-pile-of-destinations-is-a-sign.md)). Timorous Deep's map carries
    twelve `to X` labels inside a 120-unit box — a translocator's board drawn where the gnome stands —
    and reading them as zone lines made that zone **adjacent to half the world**, every border one-sided
    and priced by a stand-in, so a route out of Greater Faydark ran 2,000 invented units to a gnome that
    isn't there. `destinationBoard` refuses a crowd of border labels naming **five or more distinct
    destinations within 150 units**, folding a trailing `(1)`/`(2)` away first since that is which way
    in rather than a different zone. **Measured**: over both packs the whole corpus has three such
    places and all three are boards; at four it starts reaching real dungeon junctions (Sol A's ways
    into Nagafen's Lair beside its exit to Lavastorm). What a board *means* is left to `manual-links.ts`,
    which can state a mode, a direction and a pairing where a caption block can't — and every refusal is
    reported.

    **A `Succor` marker is the exception**, and only because it isn't a border: it names nowhere
    because it *goes* nowhere. `poiKind` files it under zone lines (right for the map's own filter — it's
    drawn where the exits are), so it's read here once nothing has resolved a destination, which leaves
    `to North Karana (Succor)` the border it says it is. Only the words that mean this and nothing else
    are accepted — `succor`, `succour`, `evac`, `evacuate`. **`Safe Spot` and `Safe Point` are refused
    on purpose**: in the packs those mark somewhere pleasant to camp far more often than they mark a
    succor point, and a wrong safe point is a free ride to the wrong end of the zone.
  - `build.ts` — `buildTravelGraph`: per-zone harvests → a graph, plus the report of what it couldn't
    do. Every border becomes one node filled in from both sides; then `zoneWalks` joins each zone's
    nodes to each other; then teleport networks collapse to hubs.

    **One zone, one map file.** A pack can draw the same place twice: Brewall ships `mistythicket.txt`
    beside `misty.txt`, `southro.txt` beside `sro.txt` — five such pairs in 590 files, each the zone's
    long name with the spaces closed up, which is a file name nothing in the catalogue answers to, so it
    arrives unnamed and enters the graph as a zone of its own. That doubles the zone from top to bottom:
    two borders into Rivervale, two druid rings in the network, and a route offering one of each with
    nothing to tell them apart — which is how a player came to rule out "Druid Ring · Misty Thicket" and
    then be offered "Druid Ring · mistythicket".

    `duplicateZoneFiles` folds them, by **exact `zoneSpelling` equality** and deliberately *not*
    `sameZoneOrMisspelling`: over that pack the one-edit tier pairs up `mseru`/`sseru`,
    `shipmvu`/`shippvu`/`shipuvu` and four `phinterior` rooms, all genuinely different zones a letter
    apart, while closed-up spelling matched exactly five pairs and every one is real. **The named file
    wins** — in all five cases the game's own short name, which is what the log says you're in.
    Coordinates are **never merged**: two drawings are two frames, and averaging them would put the ring
    where neither of them has it.

    Applied **before a label is read**, like the absent zones and for the same reason, and the graph
    carries the redirect (`merged`) because the *map window* still offers the file it dropped — the fold
    is the travel graph's, not the picker's — and the panel's **To** defaults to the map you're looking
    at, so `travelZone` sends it to the survivor rather than to an empty copy.

    **The wiki says which zones touch, and never where**
    ([ADR 0117](../decisions/0117-the-wiki-says-which-zones-touch.md)). eqlwiki's zone pages carry an
    **Adjacent Zones** row, and it is a second source for *reachability* only. Precedence, stated once:
    **an exact map label beats the wiki beats everything else.** A label that resolves exactly is a
    border with coordinates and nothing else touches it — a person standing in the zone drew that, and
    no other source can say where a crossing is. The wiki only **adds** a border the maps never
    established, contributing no position, so a route through one is priced by `UNKNOWN_CROSSING`,
    wears its `?`, and is marked `claimed` so the aside can say `wiki`. `pairByReciprocal` runs after
    it, and is strengthened by it: a wiki border makes its two zones claim each other, which is exactly
    the corroboration that pass needs. A zone the server hasn't opened is refused here as everywhere.
    The table is **shipped, not fetched** (`zones/adjacency.generated.ts`, `npm run zones:adjacency`) —
    a launch costs the wiki nothing, and a full refresh is three requests for all 117 zones.

    It also takes the zones to **leave out because this server hasn't opened them**. A pack surveys
    EverQuest, not EQ Legends, so it labels exits to zones that aren't there, and where it ships the map
    file too the graph gains a confident border into a place you cannot go — Kunark and Velious are
    whole continents' worth, and the Plane of Knowledge is a hub that shortcuts half the world.

    **Asked, not listed** — and by the same function the map's zone list uses, so the two can't disagree
    about which world you're in. `zoneAvailable` ([ADR 0065](../decisions/0065-a-zone-belongs-to-an-expansion.md))
    combines the two halves of the answer: a **fetched zone → expansion table** rules out everything past
    this server for good (Argath, the Plane of Knowledge, ~350 others a pack draws), and **eqlwiki's live
    era flags** close the expansions the server does have but hasn't opened — Kunark and Velious today,
    re-opening with nothing edited. The era list is mirrored to disk beside the other wiki indexes,
    because a *stale* answer only over-excludes for a while while a *missing* one means a route
    confidently through Kunark.

    It **fails open**: a zone the table has never heard of is kept. Legends has custom zones, and eqlwiki
    names 28 zones differently from fandom, so losing a real zone is far worse than offering an
    unreachable one.

    **An input to creation, not a correction applied afterwards** — which is the whole point: such a
    zone never enters the graph, so **re-running the build is always safe** and there's no second pass
    to remember. Its own points are skipped wholesale, borders *into* it are refused and counted (a
    refusal is not an "unresolved destination" — a map file does answer to it, we're declining it), a
    zone left with no way in or out as a result is a true statement about a world without it, and the
    exclusion is carried on the graph so a route can say *why*.

    A hand-authored entry that *names* an excluded zone is declined too, and reported apart from a typo:
    the Kunark boat legs are correct knowledge waiting for their era, not a fault, and they begin working
    when it opens.

    A **conveyance whose destination resolves is a border**, by the same argument boats are: it costs no
    walking and asks nothing of you but turning up. It also **names itself on that border** — the node
    reads `Butcherblock Mountains ↔ Erudin (boat)` — so a route can say *take the boat* rather than
    leaving you to wonder why two zones an ocean apart are next to each other. Named after the whole
    corpus is read, so a border found from one side as a plain zone line and from the other as a ferry
    still says so.

    Only rings and spires are hubbed (`isCast`): a druid reaches any ring from any other, but a boat
    runs between two *particular* docks, and hubbing those would say every dock in the world reaches
    every other for free. Docks and gnomes are found, counted and left for the manual pass. The same
    predicate decides the *direction* of those edges — what makes a ring network wire itself is what
    makes it one-way, and both are "it's a spell" — so there is one list rather than two that have to
    agree.

    **Walks are stored, not derived** — they're the substance of the graph, so they belong in the file
    where they can be read and corrected one distance at a time. With one node per border this is
    small: a zone has as many nodes as it has neighbours and conveyances. `zoneSuccors` states a zone's
    free rides to its safe point the same way, and the two are recomputed together whenever the manual
    pass touches a zone.
  - `manual.ts` + `manual-links.ts` — `applyManual` and the hand-authored table it applies. Same shape
    and same reasoning as `CURATED_ZONES` in [map](../map/README.md): a small, commented, typechecked
    list of things a person had to find out, beside a much larger body of things that are *read*.

    A place is named by **zone plus a piece of its label** (`{ zone: "butcher", label: "dock" }`), not
    by node id — an id depends on which pack you built from, and hand-authored knowledge should
    survive switching packs.

    Three shapes for the links. A **`boundary`** states that two zones connect, positioned at whatever the named
    places are: that's a boat, and it reads only *existing* labels, because the border itself is the
    node and inventing a dock beside it would be a second node for the one place. A side that matches
    nothing leaves the border unplaced there, which is the one-sided border the builder already prices
    as a guess — the crossing survives, its distances admit they're guesses. A boundary the maps already
    found only **gains coordinates**, so a dock at a known crossing is one border with two ways aboard.
    A boundary entry says `via` too, so a hand-authored ferry marks itself like a read one; a border the
    maps already found **gains** the crossing from it — they knew where it is, the entry knows what it is.
    A **`pair`** or **`network`** is a real conveyance with a mode a route can be denied; a place it
    names that this pack never labelled is **invented**, unplaced.

    A place names its zone **either way round** — "South Qeynos" or `qeynos` — because a file name
    differs between packs while a zone's name doesn't, so a table needn't guess which is in front of it.

    **What actually needs writing down** is the crossing whose label can't be read, not every crossing.
    EQ Legends' translocators are the case in point: the packs label them
    `East Freeport & The Butcherblock Mountains (Translocator Narrik)`, and a label naming *two*
    destinations can't be believed about either — `zoneLinkName` refuses it, correctly. So the six gnomes
    are five hand-authored borders, matched on the **NPC's name** (`Narrik`), which is the part reliably
    present in every spelling of the label. Anything that names a single destination anywhere in its
    label needs no entry at all.

    **A place is found by the labels a border was read from, not only the name it ended up with.** A
    border is renamed `A ↔ B` once both sides are in, so `to Erud's Crossing (Translocator Sedina)`
    stops mentioning Sedina — and an entry naming that gnome then matched nothing, stated a second
    border through him with no position, and left every walk to it priced at `UNKNOWN_CROSSING` while
    his coordinate sat on the border next to it. `TravelNode.labels` keeps what the mapmaker wrote, and
    `matching` reads it. Positions are **deduped**, since an entry can now match the very border it is
    contributing to.

    **Two borders through one place are one place, so the walk between them is nothing.** A translocator
    gnome takes you two ways — Setikan runs South Qeynos ↔ East Freeport *and* East Freeport ↔ Ocean of
    Tears — which is two borders standing on one pair of feet: arriving by one is standing where you
    board the other. Priced as an ordinary walk between two nodes neither of which this pack placed, it
    came out at `UNKNOWN_CROSSING` apiece, and a three-gnome chain across Antonica was quoted at **6,000
    units of walking for a trip that is three free rides and a few steps** (it is now 215). The zero is
    a **fact rather than a stand-in** — `assumed` stays off — because it doesn't rest on knowing where
    the place is, only on the two borders being it; applied after the recompute, which is what put the
    wrong number there, and counted in the report as `sameSpot`.

    Anything that adds a node or a coordinate to a zone makes that zone's walks **recomputed from
    scratch** by the builder's own rule, rather than patched — a new coordinate changes what the walks
    already there cost, so redoing them is the only answer that stays consistent. A **block** ("you
    can't actually walk between these two") *removes* the walk rather than being remembered beside it,
    and is applied **last**, so a recomputed zone can't put back a walk a person said isn't one.
    Applying never mutates its input.
  - `route.ts` — `findRoute(graph, from, to, options)`, Dijkstra over a binary heap and the stored
    edges. Both ends are a **zone** (long name or map file name) with an optional `at` — you're
    somewhere in a zone and want to be somewhere in another, so each end attaches through a virtual
    node: free when we don't know where you are, the real walk when a `/loc` does. Returns the steps,
    the total, the zone sequence, which conveyances it used, and **`assumed`** — true when any leg was
    priced by a stand-in rather than measured, so a UI can show a figure without implying it was
    measured.

    Zoning appears as **no leg at all**, which is the point; each walk leg names the zone it crossed
    (`across`). The zone sequence is read off those, since a boundary node is in two zones and can't say
    which way you went through it — with the arrival's zone standing in for a **conveyance** leg,
    because a zone you only change boats in belongs in the summary and nothing was walked there.

    `routeInstructions(route)` turns the steps into the four things a route is **read** as — *how far ·
    what you do · where it leaves you*, plus the crossing so a UI can mark what costs no walking. It's
    here rather than in the panel because two of them need the steps *around* one and none of it is a
    matter of taste: **a hub is not a place, so it is not an instruction** (`net:druid` sits in the trail
    between the start and the ring you land at, and left in, one teleport reads as two — it costs
    nothing, so dropping it loses no distance), and **a border is named by the side you come out on**
    (the node is `Greater Faydark ↔ Lesser Faydark`, which is the truth and not an instruction — you'd
    say *run to Lesser Faydark*, and which of the two that is, is written in the **next** leg, since the
    walk after a border happens in the zone the border let you into). And **an arrival nobody walked is
    not an instruction**: the last step is the walk from the final node to where you're actually going
    inside that zone, which is real and worth saying when a position for the destination is known — and
    when it isn't, it is zero, a guess, and the same zone name the border above it just gave you. A route
    ending `2.0k? Run to RunnyEye Citadel` / `0? Run to RunnyEye Citadel` read as a duplicate because in
    every way that shows on screen it was one. A measured zero stays: standing on the line is a fact.
    Never trimmed to nothing — a trip with nothing else to show still says where you started.

    **A route can be denied a particular place**, not only a whole network
    ([ADR 0109](../decisions/0109-a-route-can-be-denied-one-place.md)). `options.avoid` is a list of
    node ids the search may not pass through, dropped **as nodes before anything is wired** — so the
    hubs the search learns, the succor points it finds and both virtual ends are worked out over the
    graph that's left, rather than over the whole one with a filter every later step has to remember.
    An id the graph hasn't got is simply unused, because a settings file outlives the pack it was
    written against. Ruling a node out can never be worse than not routing at all: a walk is priced
    between **every pair** of a zone's nodes, so a place is somewhere you arrive or turn round, never a
    corner you have to cut through — what comes back is the **next best route**. `isRouteEnd` marks the
    two virtual ends, so a UI can decline to offer "route around this" for where you're standing
    without inferring it from a position in a list.

    **Every zone a route mentions carries both names**: the `TravelZone` shape is `{ zone, name }` — the
    map file everything is keyed by, and the name a person reads. Both, together, in `route.zones` and
    on every leg's `across`, because they're wanted for different things (one looks a map up, the other
    goes on screen) and a shape carrying only the key invites showing it. Nobody wants to be told
    they're walking across `felwithea`. `zoneName` is that mask, and the only one: this pack's name for
    the file — already the catalogue's, then the pack's solved name, then `prettyZoneName`, per
    `zonesFromFiles` — with `prettyZoneName` again as the backstop for a zone the graph never named, so
    the worst case is "Gukbottom" rather than `gukbottom`.
- **Which conveyances a route may use, and which particular places it may not.** Druid and wizard
  default **off** — both need a class you may not have or a favour you may not be able to call in, and
  a route that quietly assumed one would be advice you can't take. **Succor / pick** defaults off by that same argument: it needs an evacuation
  spell, a friend with one, or a second pick to jump into, and a map can't say whether you have any of
  them. Translocator gnomes default **on**, being public transport. **Boats are not a toggle**: by the
  time one is in the graph it's a border.

  **A toggle alone is too blunt for a port.** A druid ring and a wizard spire are reached by *casting a
  spell*, and each destination is its own spell with its own level — a druid gets Circle of the
  Combines long before Circle of Toxxulia — so `druid: true` never meant "I can reach every ring". With
  one bit to read, the graph wired all of them and picked the nearest, which produced routes that were
  optimal and untakeable, and the only lever was to turn druid ports **off** and lose every ring the
  player *can* cast. So `avoid` is the finer answer: name the place, keep the network, take the next
  best route ([ADR 0109](../decisions/0109-a-route-can-be-denied-one-place.md)). It works on borders
  too — a crossing you won't make is a place to route around, and nothing could say so before.
- **Reading the maps and asking the wiki** (`electron/travel-graph.ts`) — I/O only. Sources, zone naming and the map
  format are the [map](../map/README.md) subsystem's, reused as they are; only the `P` lines are
  sieved out before parsing, because the base file of a big zone is most of a megabyte of `L` geometry
  a travel graph never looks at.

  **The app builds its graph from your folders and never reads the shipped one.** `createTravelRouter`
  builds on first ask and caches per folder, exactly as `createZoneNamer` does and for the same reason:
  a graph belongs to whichever pack you picked, so a *shipped* file would be an artifact to keep in step
  with a choice you can change from the titlebar. The hand-authored pass is applied every time, so the
  travel in `manual-links.ts` is part of what the app routes over rather than something only the scripts
  see. It's **async** because of the era list: which zones the server has open is a fact about the server,
  and the wiki is the only thing that knows it. Concurrent asks share one build.

  **And the build is kept between runs**, in `userData`'s `travel-graphs.json`, under a key naming
  everything it was built from — the folder's own signature (the gazetteer's, shared), the era list, a
  fingerprint of `manual-links.ts` and the adjacency table, and the app's version, which is the only thing
  that can speak for a change to the build code. Reading it back is ~17ms against ~283ms to build a
  568-file pack, and the first ask arrives *at launch* (the 🧭 panel's open state is persisted, and the map
  window is restored), where it used to hold the main process for over two seconds — see
  [ADR 0169](../decisions/0169-the-travel-graph-is-built-once-and-remembered.md).

  The scripts derive the same list through the same client and the same disk cache, so a graph built by
  hand and one built by the app exclude the same zones; `travel:build --offline` skips the wiki and says
  it did.
- **Asking for a route** (`CH.travelRoute` → `api().travel.route(sourceId, from, to, options)`) —
  `answerRoute` rather than `findRoute`, because **a refusal needs a reason**. `findRoute` returns
  nothing for five quite different situations — no graph at all, a starting zone nothing answers to, a
  destination nothing answers to, a zone that **isn't in the game**, and two real zones with nothing
  joining them — and a panel that says "no route" to all five is unhelpful in four. The absent case is
  the one that isn't about our data being thin, so it ends the search rather than inviting a hunt:
  *"The Plane of Knowledge isn't in the game at this time — the map packs draw it, but there's no way
  there."* The answer also carries what the graph *knows* (zones
  and borders), because "no route" is only believable next to how much was looked at.
- **The 🧭 panel** (`src/app/components/TravelPanel.tsx`, in the [map window](../map/README.md)) —
  presentational; the map window owns the state, like every other panel there.
  - **From** defaults to where the log says you are, and uses your last `/loc` so the walk to the first
    border is measured rather than assumed free. Pick an origin by hand and the position stops
    applying, because a zone you named is a zone you're not standing in.
  - **To** defaults to **the map you're viewing**, which makes the panel answer the question the
    titlebar's picker just asked: look at a zone, and this says how to get there.
  - The route reads as **the zones you pass through** (each a button that shows that zone's map, so a
    route doubles as a tour) over **the legs**.
  - **A leg is four fixed columns**, not a sentence: *distance · what you do · to where · ✕*. A route is
    **scanned down**, not read across — the question at any moment is "what do I do next" — so the answer
    sits in the same place on every row. What you do is its own column and says **Run** as readily as
    **Boat** or **Teleport**; it used to be a badge tacked onto the label, which could only mark the
    steps that *aren't* walking and so left the commonest instruction in a route unnamed. Running is
    quiet and everything else takes the accent, because everything else is free and free is what's worth
    spotting. A guessed distance wears a `?` and the accent colour too: a stand-in must not look like a
    measurement.
  - Zoning shows as no leg, which is the model made visible — the lines are walks, and each says which
    zone it crossed. A **succor** leg says `within <zone>` rather than `across` it, because it crossed
    nothing: it's the one leg that leaves you where you already were, only nearer the way out.
  - **Every step has a ✕ that rules it out**, and a *Not using* strip above the answer where each chip
    is its own undo — include and exclude being one list edited two ways rather than two mechanisms.
    Two steps get none, because there is nothing there to rule out: the **virtual ends** (`isRouteEnd`
    — routing around where you're standing is a contradiction, not a route), and a **hub**, which *is*
    the network and already has a button three lines above it in the checkboxes.
  - The strip lives in the **asking** half, which never scrolls, for the reason the whole subsystem
    exists: a route computed around a place you've forgotten you excluded is a wrong answer that reads
    like a right one. A refusal caused by an exclusion is an ordinary `unreachable` and the panel adds
    the sentence, since only the panel knows the question had the user's own condition on it.
  - **The asking half never scrolls; only the answer does** (`.travel-ask` / `.travel-answer`). Two
    reasons, both learned the hard way: a zone picker's dropdown is absolutely positioned and an
    `overflow` ancestor **clips** one, so a panel that scrolled as a whole cut the list off at its own
    edge and grew a scrollbar trying to show it; and a long route pushed the From/To boxes out of view,
    so the controls scrolled away from the thing they control. The panel is bounded in **`%`, not `vh`**
    — the map window's scale is a CSS `zoom` and a viewport unit is scaled by it, the trap `.app`
    already documents. Each picker is anchored to the edge that lets its menu grow *inwards*
    (`ZonePicker`'s `align`), since a menu wider than its box runs off the window otherwise.
- **Seeing the graph, and auditing it** (`survey.ts` → `CH.travelSurvey` → the map's overlay and
  `MapTravelAside`). A route answers *how do I get there* and says nothing about whether the graph
  deserves to be believed — which is the question that decides what the first answer is worth
  ([ADR 0113](../decisions/0113-the-graph-is-drawn-on-the-map-it-was-read-from.md)). `surveyZone` is
  the graph from one zone's point of view, and it goes on **the map the coordinates were read from**,
  while the 🧭 panel is open and only then.
  - **On the map**: a **diamond** where you cross into another zone, a **circle** where you arrive
    without walking. A border is named by **where it takes you**, not by the pair of zones it joins —
    a route's own reading, and the only one that is an instruction. A node with several crossing
    points draws a marker each, because three ways into a neighbour are one border drawn three times.
  - **A point the graph already marks is drawn once.** A travel node's position *is* the label's own,
    copied verbatim by the harvest — so with the graph on screen, `to The Lesser Faydark` sits under a
    diamond reading `→ Lesser Faydark` and the zone is written twice in one spot. The map drops its own
    label, because the marker is the better of the two: it says where it takes you rather than what the
    mapmaker wrote, and it answers to the pointer with the node's own figures. Matched on the rounded
    position rather than on the words — these are the same point, not two labels that happen to agree.
  - **Off the map**, in the aside, the two things that are true of a zone and have nowhere to be on
    it. The **teleport networks, grouped and counted**: a druid reaches every ring in the world from
    wherever they stand, so a faithful drawing runs eighteen lines off the edge of Misty Thicket and
    says nothing but that the network exists — `Druid Rings · 18` says as much, opens for the names,
    and marks which of them is on this map. And the **nodes with nowhere to be**: a border only one
    side's mapmaker labelled is *in* this zone with no position in it, which no marker can show and
    whose absence reads as *no such border*.
  - **The route is drawn on the map** — every leg that falls on the zone on screen, quietly in grey,
    with the one under the pointer picked out in the accent colour and both its ends lit
    ([ADR 0116](../decisions/0116-a-route-is-drawn-as-the-measurement-it-is.md)). Straight and dashed
    in both states, on purpose: it is the *measurement*, not a way through — `dist3d` is a straight line
    and nothing in EverQuest walks straight, so drawing it any other way would claim more than the graph
    knows. A leg whose ends aren't on this map (a hub, your own position, an unplaced border) draws
    nothing, which is the honest answer.
  - **The destination cell opens that zone's map**, like a breadcrumb: a route reads as a tour, and the
    place a row sends you to is the thing you want to look at.
  - **A way out to somewhere the server hasn't got isn't drawn.** Every pack marks
    `to The Plane of Knowledge (Click Book)` in half the world, and the Plane of Knowledge is six
    expansions past this server — the graph already refuses to build a border into it, but the map kept
    drawing the label, which is noise sitting exactly where the exits are. The survey carries the zones
    the graph excluded (`absent`) and the map drops labels naming one **while the 🧭 panel is open**:
    that is when a map is being read as a way through rather than as a picture of a place.
  - A network you have **switched off is dimmed, never dropped** — an audit is about what the graph
    holds, not what you can use.
  - **Readable, not merely visible**: hovering a node gives its exact `/loc`, which of the border's
    crossings it is, its kind and its node id, and the whole survey copies as text — because auditing
    means comparing our figures against the game, and a marker can't be compared with anything.
  - Asked of the **same graph the router uses**, through the same `travelZone`, including a zone the
    pack drew twice ([ADR 0111](../decisions/0111-one-zone-one-map-file.md)).
  - **The aside is off by default**, behind *Show what the graph knows* in the panel's own controls
    (`STORAGE_KEYS.mapTravelAudit`, remembered). The markers are the useful half and cost nothing to
    read; the strip answers *should I believe this?*, which is a question worth asking now and then
    rather than one to keep a panel open for on every trip.
- **The options are settings, not panel state** (`Settings.travel`) — "can I get a druid port" is a
  fact about *you*, not about what you're looking at, so it's one answer wherever a route is asked for
  and it persists. **`avoid` is one of them**, by the same argument: which ports you can *cast* is a
  fact about you too, and re-ticking your own spellbook every session would make the feature not worth
  using. Each entry carries the place's own **words** as well as its id, because the graph never leaves
  the main process and only a route's *steps* cross to a renderer — so once a place is out of every
  route nothing else can name it, and the panel would be listing `butcher#druid-rings`. They're offered in the panel because that's where they're used; there's deliberately
  no second copy in the Settings window. **There is no Boats checkbox**, and the panel says so in one
  line, because that's the question its absence raises.
- **Two scripts, for looking at the graph rather than feeding the app.** The app builds its own (above);
  these are how you *inspect* one and work through what it couldn't do.
  `npm run travel:build` reads the maps and writes
  `data/travel-graph.<source>.json` — the record of **what the maps said**, safe to regenerate at any
  moment. `npm run travel:manual` lays `manual-links.ts` over it and writes
  `data/travel-graph.<source>.routed.json`, which is **what you route over**. The manual pass always
  reads the generated file, never its own output, so running it twice is running it once — and
  generating can't quietly drop hand-authored travel, it goes stale instead. Re-run the manual pass
  after every build. Both take `--help`; `travel:manual -- --route "A" "B" --druid` prints a route,
  which is the quickest way to see whether the graph is any good. Both are thin: argument parsing,
  `--help` (printed from the script's own docblock, so usage can't drift from the file), and loading the
  app's **compiled** modules out of `dist-electron` all come from `scripts/lib/cli.mjs` — there is no
  second copy of the map format, the graph builder or the router in JavaScript, which is why these need
  `npm run build:electron` first and say so when it's missing.
- **Saying where it's thin.** A build reports the borders only one side drew (whose walks are guesses,
  not measurements), the destinations no map file answered to, the zones with no way in or out, the
  zones whose maps mark a succor point, the second drawings it folded away (`merged`), the destinations
  the far side placed for us (`paired`, each with the tier that made it), what the wiki added and what
  it couldn't (`claimed`), and the labels that named nowhere. **Only an edge that leaves a
  zone counts as a way in or out** — a walk and a succor both name the zone they happen inside, and a
  free ride between two dead ends is not a connection. Those lists name zones by **map file**, deliberately and unlike a route's
  output: they're the keys you go and type in `manual-links.ts`. The manual pass reports
  which entries matched a real label, which had to invent a node, and which named a zone this pack has
  no map for. That output *is* the hand-massaging list — a graph that quietly covers less than it
  claims is worse than one that says where the holes are.
- **A graph belongs to one map pack**, like the zone names
  ([ADR 0061](../decisions/0061-a-map-pack-names-its-own-zones.md)): two packs label different exits,
  so they describe different graphs of the same world.

## Non-responsibilities
- **No routing inside a zone**, and no line drawn on a map. That's [retired ADR 0049](../decisions/README.md)
  and it stays retired — the geometry can't say what's walkable. What this offers is a **list of
  places**, which is either right or wrong; it can't be subtly, misleadingly wrong the way a drawn
  corridor can.
- **The distances are approximations and are never presented as more.** Straight-line, no terrain, no
  walls, no aggro. Any leg priced by a stand-in is flagged and the whole route carries `assumed`.
- **A stand-in is never a shortcut.** `UNKNOWN_CROSSING` is what it costs to *reach* a border nobody
  drew, and it used to cost the same to leave one — which made an unplaced border a 4,000-unit teleport
  between any two points in its zone, so Greater Faydark to Butcherblock's translocator came out at
  4,000 when the walk is 6,858. A border with several crossing points was the same trick more cheaply,
  each edge taking its own nearest pair. Both are one thing, and the rule is one thing: **within a zone
  you never walk *through* a node** — every pair is joined by construction, so the direct walk always
  exists and a two-hop through a third is redundant or a cheat
  ([ADR 0118](../decisions/0118-a-stand-in-is-not-a-shortcut.md)). Refused in the search, checked against
  the walks **the search has** rather than the ones the graph stores — the virtual ends' walks are
  synthesised per query and are in no graph, so checking the store left the one place every route starts
  from as the one place the hop survived. And only where that direct walk exists, so a `ManualBlock`
  still leaves the detour it was written for.
- **No time estimate, and no attempt to price a ferry.** Time is truer to what a player wants and
  unmeasurable from a map file: it needs run speed, terrain, boat timetables and what's chasing you. A
  distance is a stated approximation; a figure in minutes would read as a promise. So a boat's ride
  counts as nothing, which is deliberate — a route may send you across an ocean to save you a walk.
- **A specific exit is never paired with a specific arrival on the far side** — and nothing needs it
  to be. There's no shared coordinate frame across two map files, so when Greater Faydark has three
  exits to Lesser Faydark, they're three crossing points of **one** border rather than three borders to
  match up. The node keeps all three and a walk takes the nearest.
- **No route is drawn — only the graph's own nodes.** The panel lists places, and the map marks where
  the graph says those places *are*
  ([ADR 0113](../decisions/0113-the-graph-is-drawn-on-the-map-it-was-read-from.md)). Nothing joins two
  markers with a line, because a line between two points on a map is a claim about the ground between
  them and the geometry cannot support one — the whole of [retired ADR 0049](../decisions/README.md).
  Whether a *chosen* route may be drawn as a schematic across several maps is an open question, not a
  settled no; it needs its own answer to “what stops this reading as a walkable path?”
  ([todo.md](../todo.md)).
- **The graph isn't shipped, and the stored one isn't loaded.** The app builds from your own pack at
  runtime; `data/travel-graph.*.json` exists for you to read, not for the app to consume.
- **The hand-authored table is not verified in EQ Legends.** The boat runs are classic-EverQuest
  knowledge and a starting point, not a finding; the translocator gnomes are deliberately empty,
  because nothing about a Legends-only NPC can be read off a map or reasonably guessed.
- **Nothing here knows which port spells you actually have.** `avoid` is a switch you throw, not an
  inference: the spell file is read ([ADR 0080](../decisions/0080-the-game-s-own-spell-file.md)) but
  nothing joins a *Circle of X* to the ring node X, and even a perfect join couldn't know that the
  druid porting you is not you. The manual switch is honest about not knowing
  ([ADR 0109](../decisions/0109-a-route-can-be-denied-one-place.md)).
- **A ruled-out place is not remembered across map packs.** A border's id is `zoneA|zoneB` and stable;
  a place's is `<zone>#<slug of that pack's own label>` and is not
  ([ADR 0061](../decisions/0061-a-map-pack-names-its-own-zones.md)), so switching source can leave an
  entry matching nothing. It goes **inert rather than wrong**, and the panel lists it whether or not
  the graph knows it, so it can be cleared.
- **A succor point can't be hand-authored**, only read. `TravelPlace` names a place by zone and label
  and carries no coordinates, so an entry could say a safe point exists but not where — and an unplaced
  one is priced at `UNKNOWN_CROSSING`, a guess that can *beat* a measured walk. A zone whose pack never
  drew the marker simply doesn't offer the ride.

## See also
[map](../map/README.md) · [ADR 0062](../decisions/0062-a-travel-graph-of-zone-lines.md) ·
[ADR 0048](../decisions/0048-a-map-label-is-read-by-its-words.md) ·
[ADR 0061](../decisions/0061-a-map-pack-names-its-own-zones.md) ·
[ADR 0069](../decisions/0069-a-succor-is-a-port-inside-one-zone.md) ·
[ADR 0109](../decisions/0109-a-route-can-be-denied-one-place.md) ·
[ADR 0169](../decisions/0169-the-travel-graph-is-built-once-and-remembered.md) ·
[testing](../testing/README.md)
