# 0142: A hunted mob marks itself on the map, and says who placed it

## Status
Accepted

## Context
Two halves of one question were already in the app and nothing joined them.

The Hunt tab knows **what to kill**: every item still on your list, inverted into the mobs that drop
it, plus the mobs you put on the list to kill for their own sake
([ADR 0098](./0098-a-mob-is-a-thing-you-hunt.md), [ADR 0125](./0125-a-hunt-is-two-questions.md)). The
map knows **where things are** — three different ways, none of which was being asked:

- **your own kills**, as a roam centre averaged from where you fought it
  ([ADR 0024](./0024-mob-knowledge.md));
- **peers' kills**, the same measurement made by somebody else and pooled into yours;
- **the wiki**, whose mob pages carry a stated `Location:` coordinate that until now was only ever a
  link you could click on the page itself.

Standing in the zone with the map open, joining them was manual and easy to not bother with: open the
📖 panel, find the mob among everything else ever killed here, press its ± button. Three deliberate
acts, for a position the app already had, about a mob it already knew you were after. The map drew
every kill in the zone as a heatmap — dots with no names on them — and nothing on it said *this one
is what you came for*.

And the source that mattered most was the one nothing used. Your kills can only place a mob you have
**already killed**, which is the opposite of what a shopping list is about: the whole point of a hunt
is the thing you haven't got yet, from a mob you may never have seen.

## Decision
**When the map is showing a zone, it marks every mob your hunt wants that anything can place there** —
automatically, drawn loud, and saying which of the three sources placed it.

### What gets marked

- **The two inputs are the built hunt and everything that can place a mob**, joined in
  `src/shared/map/hunt-pins.ts` (pure, tested). The hunt is built by `useHunt`, the one place both the
  Hunt tab and the map get it from: a second copy of that derivation in the map window is exactly
  where the two would drift — one counting quest runs and the other not, with neither looking wrong.
- **The zone match for a measured position is the knowledge's, not the hunt's.** A hunt zone is the
  *wiki's* wording for where an item drops; a roam centre is a kill recorded here. Asking the two
  names to agree would put a second, weaker zone match in front of one already made, and would drop a
  mob you have actually killed here because a page files it somewhere else. So the mobs are folded
  across the hunt's zones and matched against `mobs.all(zone)` — what the mob is *wanted for* travels
  with it, since that is true of the mob wherever it turns out to be standing.
- **Nothing to place it, no mark.** A mob you've never killed whose page states no coordinate is
  genuinely unlocated. "We don't know where" is an answer; a mark in the middle of the map is not.
- **A spot you pinned by hand isn't marked twice.** A roam centre you starred with the ± button is the
  same spot with the same meaning; the automatic mark stands aside rather than drawing over it.
- **Derived, never stored.** These pins are not in the pin store, are never shared to peers, can't be
  dragged by the move tool and can't be edited. They exist while the hunt wants the mob and something
  can place it, and go when either stops being true — obtaining the last of an item takes its mobs off
  the map by itself.

### Where the position comes from

**Three sources, ranked and never merged** (`src/shared/map/mob-place.ts`), each answer carrying which
one spoke:

1. **Your own kills.** Checkable: you stood there.
2. **Pooled with peers'** where they have contributed — the pooled centre, because `mergeAreas`
   weights each observer by how many positions they brought and widens the spread by how far their
   centres sit apart. More evidence and less checkable at once, so the mark says "pooled with Bob", or
   "Bob's kills, not yours" where none of it is yours.
3. **The wiki**, last and only into silence. A stated coordinate is not a measurement — it is a point
   somebody wrote down about an older, since heavily modified game
   ([ADR 0025](./0025-observation-over-the-wiki.md)) — but it is the only source that can place a mob
   you have never killed, which is the mob a hunt is actually about.

- **Ranked, not averaged.** Averaging a measurement with a stated point would produce a coordinate
  nobody claims, and no way to tell how much of it came from where. This is the same shape
  `drop-truth.ts` gives a drop *rate* — both sources side by side with the disagreement named —
  applied to the other thing the wiki and your log both claim to know.
- **A stated coordinate has to be about the zone on screen**, said either by the card's own `Zone:`
  row or, where the card doesn't say, by the hunt having filed the mob here — both are the wiki
  speaking, so one can vouch for the other. `Various` and `Unknown` are words, not places
  (`statesNothing`, shared with the wiki page view so the two can't disagree about it).
- **A stated position has no spread and no samples**, and that is drawn: `spread: 0` means every kill
  landed on one point, which is the *tightest* measurement there is, and it must stay tellable from
  "nothing was measured at all". Reporting "±0 from 0 kills" would dress the softest claim on the map
  as the hardest.
- **The wiki is asked only where our own kills are silent** (`unplacedHuntMobs`) — the ranking read
  forwards, which also keeps a page lookup per hunted mob down to the mobs an answer could change.

### How it is drawn

- **Loud, because this is what the map was opened for.** A bigger marker inside a ring of its own
  colour, its caption in that colour rather than white, and a hollow ring glyph (`HUNT_PIN`) rather
  than one of the five solid ones in the palette — a mark the app made must not read as one you made,
  and it has to win against a heatmap of kill dots and a zone's worth of labels. Your own pins stay
  quiet: you know where you put them.
- **The uncertainty is on the map, not only in the hover.** A measured position draws a ring at its
  spread, so "roughly here" is visible at a glance; a stated one draws a *dashed* ring at a fixed
  size, because it has no spread to draw and is a different kind of claim. A spread tighter than the
  marker draws no ring at all, which is what a very tight measurement should look like.
- **Clicking one asks what's known about the mob**: the 📖 panel opens narrowed to it and its kills
  are ringed — the same answer arriving from another window gives
  ([ADR 0104](./0104-a-position-is-read-and-arrives-with-its-evidence.md)). A pin that can't be
  edited can still be *about* something.
- **The 👁 panel can switch them off**, and that choice persists — and switching off stops the wiki
  lookups too, not just the drawing. Every other filter there narrows what you drew; this one answers
  "should the app put things on my map at all", and asking again every session is not what "no" means.

## Consequences
The map window now reads the hunt, which makes it a consumer of the shopping list for the first time,
and reads mob pages for the hunted mobs it can't place from kills. `wiki.getPage` is cached in main
and the Hunt tab already fetches the same pages for its drop rates, so in practice this is a cache
lookup rather than traffic — but on a cold cache, opening the map on a long list does reach the site.
`unplacedHuntMobs` is what keeps that bounded.

It also now owns the zone's mob knowledge (`useZoneMobs`, which reads the pooled figure and your own
share of it together) and hands the pooled half to the 📖 panel, which used to fetch its own: the
panel and the marks on the canvas are two views of one read, and can no longer disagree about where a
mob lives or arrive at different moments.

A busy camp with a long list gains several loud pins at once. That is the intended reading — those are
the mobs you came for, picked out of a heatmap that never named anything — but it is also the shape
that will decide whether the switch stays a switch or grows a "targets only" setting. Left as a switch
until somebody's map is actually too full.

Rejected:

- **A sixth pin kind in the palette.** Then it would be a pin you could pick up, drop, drag, share and
  edit — five affordances that are all wrong for a mark derived from data, and every one of them a way
  for a stored pin to outlive the reason it existed.
- **Writing them into the pin store** (the way arriving from another window does). Persisting a
  derived position means it survives the item being obtained, the mob leaving the list, and the
  measurement improving — a star at last month's centre, with nothing to say it was ever automatic.
- **Averaging the wiki's point into the observed centre**, or letting a large sample of peers' kills
  outweigh a small sample of your own. Both produce a number no source stands behind.
- **Trusting the wiki's coordinate over your own kills when you have only one or two.** A thin sample
  is still a measurement of *this* build, and the ladder that decides when to prefer an observed drop
  *rate* (`TRUST_OBSERVED_AFTER_KILLS`) exists because rates are compared against each other. A
  position is not: one kill says the mob was standing there, and the wiki's point is about a different
  patch of a different game.
- **Only marking mobs *you* have killed.** `huntTargetsFor` keeps peers' kills out of "which zone to
  go to" on the grounds that a direction can't be checked. But you are already standing in the zone,
  and the map already draws peers' kills and pools their roam centres; the honest fix is to say whose
  the position is, which the mark does.
- **Colouring each source differently.** Then the loudest signal on the map would be provenance rather
  than *this is what you came for*, and four colours of hunt pin is four things to learn before the
  feature says anything. Solid versus dashed already separates the one distinction that changes what
  you should do — measured or merely stated — and the hover carries the rest.
- **Ringing the mob's kills on hover, as the panels' rows do.** Nothing else on the canvas answers the
  cursor that way, and a map that lit up as you moved across it would be hard to read for the one
  gesture — panning — that costs nothing today.
