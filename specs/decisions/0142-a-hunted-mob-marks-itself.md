# 0142: A hunted mob marks itself on the map

## Status
Accepted

## Context
Two halves of one question were already in the app and nothing joined them.

The Hunt tab knows **what to kill**: every item still on your list, inverted into the mobs that drop
it, plus the mobs you put on the list to kill for their own sake
([ADR 0098](./0098-a-mob-is-a-thing-you-hunt.md), [ADR 0125](./0125-a-hunt-is-two-questions.md)). The
kill log knows **where you killed it**: a roam centre averaged from your own positioned kills, pooled
with any peers sharing theirs ([ADR 0024](./0024-mob-knowledge.md)) — the only positional knowledge
this app has at all, since the wiki's `ItemSource` names a mob and a zone but never a spot
([ADR 0025](./0025-observation-over-the-wiki.md)).

Standing in the zone with the map open, joining them was manual and easy to not bother with: open the
📖 panel, find the mob among everything else ever killed here, press its ± button. Three deliberate
acts, for a position the app already had, about a mob it already knew you were after. The map drew
every kill in the zone as a heatmap — dots with no names on them — and nothing on it said *this one
is what you came for*.

## Decision
**When the map is showing a zone, it marks every mob your hunt wants that this zone's kills can
place** — automatically, as a pin the map made rather than one you dropped.

- **The two inputs are the built hunt and this zone's knowledge**, joined in
  `src/shared/map/hunt-pins.ts` (pure, tested). The hunt is built by `useHunt`, the one place both the
  Hunt tab and the map get it from: a second copy of that derivation in the map window is exactly
  where the two would drift — one counting quest runs and the other not, with neither looking wrong.
- **The zone match is the knowledge's, not the hunt's.** A hunt zone is the *wiki's* wording for
  where an item drops; the pin's position is a kill recorded here. Asking the two names to agree
  would put a second, weaker zone match in front of one already made, and would drop a mob you have
  actually killed here because a page files it somewhere else. So the mobs are folded across the
  hunt's zones and matched against `mobs.all(zone)` — what the mob is *wanted for* travels with it,
  since that is true of the mob wherever it turns out to be standing.
- **No area, no pin.** A mob killed here only at positions too poor to believe
  (`AREA_MIN_CONFIDENCE`) has nowhere to be drawn and is left off. "We don't know where" is an answer;
  a mark in the middle of the map is not.
- **Every pin says what it rests on.** The hover carries what the mob is wanted for, whose kills
  placed it — pooled, or nobody's but a peer's — and `roamWhy`'s hedge, so the same figure means the
  same thing here as in the panel it came from. A roam centre is an *average of where it died*, not a
  spawn point, and a marker that didn't say so would read as one.
- **Derived, never stored.** These pins are not in the pin store, are never shared to peers, can't be
  dragged by the move tool and can't be edited. They exist while the hunt wants the mob and the kills
  can place it, and go when either stops being true — obtaining the last of an item takes its mobs off
  the map by itself.
- **A spot you pinned by hand isn't marked twice.** A roam centre you starred with the ± button is the
  same spot with the same meaning; the automatic mark stands aside rather than drawing over it.
- **It looks like what it is** — a hollow ring (`HUNT_PIN`), not one of the five solid glyphs in the
  palette, because a mark the app made must not read as one you made.
- **Clicking one asks what's known about the mob**: the 📖 panel opens narrowed to it and its kills
  are ringed — the same answer arriving from another window gives
  ([ADR 0104](./0104-a-position-is-read-and-arrives-with-its-evidence.md)). A pin that can't be
  edited can still be *about* something.
- **The 👁 panel can switch them off**, and that choice persists. Every other filter there narrows
  what you drew; this one answers "should the app put things on my map at all", and asking again
  every session is not what "no" means.

## Consequences
The map window now reads the hunt, which makes it a consumer of the shopping list for the first time
— `wiki.getPage` is cached in main, so the second reader costs a lookup rather than a fetch. It also
now owns the zone's mob knowledge (`useZoneMobs`) and hands it to the 📖 panel, which used to fetch
its own: the panel and the marks on the canvas are two views of one read, and can no longer disagree
about where a mob lives or arrive at different moments.

A busy camp with a long list gains several pins at once. That is the intended reading — those are the
mobs you came for, picked out of a heatmap that never named anything — but it is also the shape that
will decide whether the switch stays a switch or grows a "targets only" setting. Left as a switch
until somebody's map is actually too full.

Rejected:

- **A sixth pin kind in the palette.** Then it would be a pin you could pick up, drop, drag, share and
  edit — five affordances that are all wrong for a mark derived from data, and every one of them a way
  for a stored pin to outlive the reason it existed.
- **Writing them into the pin store** (the way arriving from another window does). Persisting a
  derived position means it survives the item being obtained, the mob leaving the list, and the
  measurement improving — a star at last month's centre, with nothing to say it was ever automatic.
- **Marking a mob the hunt places by wiki zone alone**, with no kills of your own here. There is no
  coordinate in that claim; a pin would have to invent one.
- **Only marking mobs *you* have killed.** `huntTargetsFor` keeps peers' kills out of "which zone to
  go to" on the grounds that a direction can't be checked. But you are already standing in the zone,
  and the map already draws peers' kills and pools their roam centres; the honest fix is to say whose
  the position is, which the hover does.
- **Ringing the mob's kills on hover, as the panels' rows do.** Nothing else on the canvas answers the
  cursor that way, and a map that lit up as you moved across it would be hard to read for the one
  gesture — panning — that costs nothing today.
