# 0114: A conveyance the map calls dead is not one

## Status
Accepted

## Context
The travel graph reads a zone's conveyances off its map labels
([ADR 0048](./0048-a-map-label-is-read-by-its-words.md)): a label saying `Druid Ring` is a druid ring,
and the network wires itself from there. Those words sometimes say the opposite.

Greater Faydark's **only** druid ring is labelled `Abandoned Druid Ring`, and you cannot port to it.
Read as live it is worse than a missing one, because of what a hub means: every ring is a destination
**from every zone in the world** ([ADR 0066](./0066-a-port-is-cast-from-where-you-stand.md)), so one
dead marker offers the whole map a free ride to a circle of stones that doesn't work — and being free,
the router prefers it. A player following that route walks to a ring, casts nothing, and finds out the
graph was confident and wrong.

## Decision
**A label that says its own conveyance doesn't work is not a travel point at all.**

Four words — *abandoned*, *broken*, *inactive*, *ruined* (plus *derelict*, *collapsed*, *defunct*,
which the corpus doesn't yet use) — sitting on a ring, spire, portal or translocator.

**Measured, not guessed.** Across both packs and ~1,200 map files the whole corpus holds five such
labels: `Abandoned Druid Ring` (gfaydark), `Ruined Druid ring` (direwind), `Inactive Druid Ring`
(rathemtn), `Broken Wizard Spire` (nektulos), `Broken Portal` (umbral). Four words, five labels, one
meaning.

**Adjacency is what keeps it safe.** The dead word must sit *on* the conveyance — one word between
them at most, which is what `Broken Wizard Spire` needs — because the loose version, both words
anywhere in the label, reads `to the Broken Skull Rock (boat)` as a dead boat. Matched over the whole
corpus the adjacent rule catches those five and nothing else.

Checked before the label is read as anything, so it holds for a border naming a dead crossing as
readily as for a place.

## Consequences
Greater Faydark leaves the druid network and keeps the wizard one, which is the true state of it. The
world's ring count goes 20 → 18 and its spires 17 → 16.

**The rule generalises past the case that prompted it**, which is a judgement rather than an
observation: a player reported the abandoned rings, and *broken*, *inactive* and *ruined* are read the
same way on the same argument — a mapmaker writing them means the thing does not work. Four zones are
affected that nobody has confirmed. If one of them turns out to be live, that is when a per-zone
override earns its place.

This is a **label vocabulary** fact and so lives with the other label vocabularies in `harvest.ts`,
not in the hand-authored table. `manual-links.ts` already has a `drop` entry meaning "this ring doesn't
work" — a fact about the *world*, applied per zone. This is a fact about the *word*, true in any pack,
and writing it out five times as data would be five chances to miss the sixth.

Rejected: **five `drop` entries** (data where a rule belongs, and silent on the next pack), **leaving
the node in without its crossing** (a place with no network is a landmark nobody asked for, and it
would still turn up in routes wearing a `Run` verb), and **matching the dead word anywhere in the
label** (which reads a boat to a place called Broken Skull Rock as a broken boat).
