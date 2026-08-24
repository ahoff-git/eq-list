# 0109: A route can be denied one place, not just a whole network

## Status
Accepted

## Context
[ADR 0062](./0062-a-travel-graph-of-zone-lines.md) gave the travel graph four toggles —
`druid` · `wizard` · `gnome` · `succor` — each answering "may a route assume this conveyance?".
They are the right shape for what they were built for: a boat is a border and needs no permission, a
translocator gnome is public transport, and a succor needs a spell we cannot see.

For the two **cast** networks the question is subtly wrong, and the difference is a level.

A druid ring and a wizard spire are reached by **casting a spell**, and each destination is its own
spell with its own level: a druid gets *Circle of the Combines* long before *Circle of Toxxulia*, and
a wizard's spires come in the same staggered order. So `druid: true` does not mean "I can reach every
ring". It means "I can reach *some*" — and the graph, having only one bit to read, wires every one of
them and picks the nearest.

The result is a route that is optimal and untakeable. Told to go somewhere, a level-30 druid was
routed through a ring five levels out of reach, and the only lever the panel offered was to turn
druid ports **off** — which loses every ring they *can* cast, usually including the one that would
have been the second-best answer. The toggle can say *no* and cannot say *not that one*.

The same thing is true, less often and for different reasons, of borders: a crossing you won't make
(a corpse run, a swim you can't survive, a zone you're not welcome in) is a place to route around,
and nothing could express it.

## Decision
**A route can be denied a particular place**, alongside the networks it can be denied wholesale.

- `TravelOptions.avoid` is a list of `TravelNode` ids the search may not pass through. They are
  dropped **as nodes**, before anything is wired, so the hubs the search learns, the succor points it
  finds and both of its virtual ends are worked out over the graph that is left rather than over the
  whole one with a filter to remember. An id the graph hasn't got is simply unused — a settings file
  outlives the pack it was written against.
- Ruling out a node can never make an answer worse than not answering. A walk within a zone is priced
  between **every pair** of that zone's nodes ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)), so
  a place is somewhere you arrive or turn round at, never a corner you must cut through. What comes
  back is the **next best route**, which is the whole point.
- **It is a setting, not panel state** (`TravelSettings.avoid`), by exactly the argument that made the
  four toggles settings: which ports you can cast is a fact about *you*, not about what you're looking
  at. Re-ticking your own spellbook every session would make the feature not worth using.
- **Each entry carries its own words** — the node's `label`, and the zone it's in as a person reads
  it. The graph never leaves the main process and only a route's *steps* cross to a renderer, so once
  a place is out of every route **nothing else can name it**. Without the words the panel would list
  `butcher#druid-rings`, which is the difference between a setting and a trap.
- **The panel is where you say it**, on the route itself: a ✕ on every step, and a *Not using* strip
  above the answer where each chip is its own undo. The strip sits in the half of the panel that never
  scrolls, because a route computed around a place you have forgotten you excluded is a wrong answer
  that reads like a right one — the objection this whole subsystem is built on.
- **Two steps get no ✕**, because there is nothing there to rule out: the route's two virtual ends
  (`isRouteEnd` — routing around where you are standing is a contradiction, not a route), and a
  **hub**, which *is* the network and already has a button three lines above it. One fact, one control.
- A refusal caused by an exclusion is an ordinary `unreachable`, not a new refusal kind. The graph
  answered exactly the question it was asked; the question had a condition on it. The panel adds the
  sentence, since only the panel knows the condition was the user's own.

## Consequences
The toggle and the exclusion answer different questions and both are needed: *can I do this at all*
is a checkbox, *not that one* is a chip. A player who owns two of a druid's eight ports now converges
on a usable set by routing, pressing ✕ on what they can't cast, and keeping the result — which reads
as using the app rather than configuring it.

The exclusion is **stronger than the toggle it refines** and can make a trip impossible where a walk
existed, since a border can be ruled out too. That is intended and is why every excluded place is
listed in the panel with a one-click undo and an *Allow all*, and why the refusal says how many places
are out.

**A node id belongs to the pack it was built from.** A border is `zoneA|zoneB` and stable across packs;
a place is `<zone>#<slug of that pack's own label>` and is not
([ADR 0061](./0061-a-map-pack-names-its-own-zones.md)) — so switching map source can leave an entry
matching nothing, and a ring you had ruled out comes back. It is inert rather than broken, and it is
visible: the strip lists it whether or not the graph knows it. The alternative — naming a place by
zone plus a piece of its label, the way `manual-links.ts` deliberately does — was rejected here
because that matcher lives in the main process with the graph, and the renderer holds only ids;
carrying a matcher across IPC to make a stale entry survive a pack switch is a great deal of
machinery for a case a person fixes with one click.

Rejected along the way:

- **A checkbox per ring.** Honest, and it needs the whole node list in the renderer (new IPC, a
  second browser of places) to let you switch off ports you may never route through. The route
  already puts the one place you care about in front of you, which is where the button belongs.
- **Reading spell levels and hiding what you can't cast.** The right answer if the data existed —
  `spells_us.txt` is read ([ADR 0080](./0080-the-game-s-own-spell-file.md)) — but nothing joins a
  *Circle of X* to the ring node X, that join would be one more hand-authored table, and it still
  couldn't know that the druid porting you is not you. The manual switch is honest about not knowing.
- **A `drop` entry in `manual-links.ts`.** That already exists and means "this ring doesn't work" —
  a fact about the *world*, applied at build time for everyone. This is a fact about one player.
- **Per-route panel state rather than a setting.** Loses your spellbook every time the window closes,
  which is most of the value.
- **Its own refusal kind.** "Unreachable because you said so" is not a different thing the graph
  knows; it is the same answer with a note the panel is better placed to write.
