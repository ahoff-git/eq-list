# 0111: One zone, one map file

## Status
Accepted

## Context
A map pack ships a file per zone. Except where it doesn't.

Brewall carries `misty.txt` **and** `mistythicket.txt`, `sro.txt` and `southro.txt`, `oot.txt` and
`oceanoftears.txt` — five such pairs in 590 files. Each pair is one place drawn twice: identical exit
labels, different coordinate frames. The second file is always the zone's long name with the spaces
closed up, which is a file name nothing in the catalogue answers to, so `zonesFromFiles` leaves it
unnamed and it comes through as the bare string `mistythicket`.

[ADR 0062](./0062-a-travel-graph-of-zone-lines.md)'s graph is keyed by map file, so that is a zone
of its own — doubled from top to bottom. Two borders into Rivervale. Two druid rings in the network,
both reachable from anywhere, one of which the router picks by whichever is nearer in its own
unrelated frame. It surfaced through
[ADR 0109](./0109-a-route-can-be-denied-one-place.md): a player ruled out *Druid Ring · Misty
Thicket*, got a fresh route, and was offered *Druid Ring · mistythicket* — the same ring, under a
name that reads like a bug because it is one.

## Decision
**Two map files that draw one zone are one zone in the graph**, and the file the pack *named* is it.

- The test is **exact `zoneSpelling` equality** — the shared fold with punctuation and spacing closed
  up ([ADR 0075](./0075-a-zone-s-misspelling-is-the-same-zone.md)) — over each file's name, or the
  file name itself where the pack named none.
- It is deliberately **not `sameZoneOrMisspelling`**. Over the same 590 files the one-edit tier pairs
  up `mseru`/`sseru`, `shipmvu`/`shippvu`/`shipuvu` and four `phinterior` rooms, every one of them a
  genuinely different zone a letter apart. Closed-up spelling matched exactly five pairs and every one
  is real. The narrow rule is the whole point: merging two real zones is a far worse failure than
  leaving a duplicate.
- **The named file wins**, which in all five cases is the game's own short name — the one the log says
  you're in, so keeping it is what makes a route out of where you're standing work. Ties fall to the
  shorter name, so the answer can't depend on the order a folder happened to list its files in.
- **Coordinates are never merged.** Two drawings are two frames: Misty Thicket's ring is at
  `1834, 531` in one file and `585, 452` in the other. Averaging them, or keeping both positions on
  one node, would put the ring where neither of them has it. The duplicate's points are dropped
  wholesale.
- Applied **before a single label is read**, exactly like the absent zones and for the same reason: a
  second drawing that never enters the graph cannot double a border, and there is no later pass anyone
  can forget to run. Re-running the build stays safe.
- **The graph carries the redirect** (`TravelGraph.merged`), because the fold is the travel graph's
  and **not the map picker's** — the map window still offers `mistythicket`, and the route panel's
  *To* defaults to the map you're looking at. `travelZone` applies it, that being the one place a zone
  name becomes a file.

## Consequences
A zone drawn twice now has one set of borders, one ring in the network, and one row in a route. The
five pairs are named in the build report (`merged`), so a pack that grows a sixth says so rather than
quietly getting bigger.

**The duplicate's map is still drawable and still in the picker.** That is deliberate: it is a real
map of a real place and someone may prefer it. What it is no longer is a *destination*, and asking to
route to or from it lands on the zone.

**We keep the named file's labels, not the union.** If the dropped drawing labelled an exit the kept
one doesn't, that exit is lost. Nothing in the five pairs does — their exit labels are identical,
which is part of what identifies them as duplicates — but a future pair might, and the honest answer
then is a hand-authored entry in `manual-links.ts` rather than a merge that mixes two frames.

**This is only fixed for travel.** The map's zone picker still lists both `Misty Thicket` and
`mistythicket`, which is the same duplicate wearing the same unnamed file name. Left alone on purpose:
`zonesFromFiles` is the map subsystem's core, its outputs are pinned by tests, and the picker showing
a second drawing is a cosmetic wart where the graph having a second *zone* was a wrong answer. Logged
in [todo.md](../todo.md).

Rejected:

- **Naming the duplicate properly** (teaching the gazetteer that `mistythicket` is Misty Thicket).
  It makes the symptom worse, not better: two zones would then be called the same thing, and the
  resolver refuses ambiguity — so routing to Misty Thicket would stop working entirely.
- **Merging the two nodes' coordinates.** Two frames, one node, distances that are true of neither.
- **Keeping both and de-duplicating in the panel.** The duplicate is in the *graph* — it doubles
  borders and hub edges and changes which route is shortest — so hiding it at the last moment would
  leave the wrong answer and only stop it looking wrong.
