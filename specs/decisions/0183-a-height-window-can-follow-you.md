# 0183: The hand-set height window can follow your own `/loc` height

## Status

Accepted

## Context

For a zone with no labelled floors ([ADR 0040](./0040-floors-come-from-the-mapmaker.md)), the
only way to isolate one layer of geometry is the hand-set height window in the filter panel — two
sliders you drag to bracket a `z` span. Moving through a tall, unlabelled zone (Greater Faydark's
platforms, a multi-level outdoor camp) means re-dragging both handles every time you climb or
descend, which is exactly the busywork a `/loc`-aware app should be able to do for you: the
player's own height is already parsed into `LocEvent.z` and used elsewhere (ADR 0040's "· you"
floor marker).

Deriving a window from `/loc` automatically risks repeating the thing ADR 0040 ruled out —
inferring structure from height alone. This is narrower: it invents no floor and no label, it only
re-centers the *same kind of manual window* the player could drag themselves, on a span they also
choose. It has to stay optional, too — someone lining up a static view of one layer (say, aligning
a stair) doesn't want their own footsteps pulling the window out from under them mid-look.

## Decision

`useFloors` grows a persisted `heightFollow` toggle and a persisted `heightFollowRange` (the
± half-width, default 30 raw `/loc` z units — a guess at "one storey"). When both are set and the
map has no labelled floors, an effect re-centers the hand-set window on `loc.z ± heightFollowRange`
each time the player's height changes, writing the same `HeightPick` state a manual drag would.

The two never fight, on purpose:

- **A manual edit turns following off.** `setHeight` clears `heightFollow` before writing the
  pick, so dragging a handle is a decision, not something the next `/loc` line quietly overwrites.
- **"all" ends following too**, for the same reason — otherwise the button would appear to do
  nothing the moment you next took a step.
- **Follow and floors don't mix.** The effect no-ops once a map has more than one labelled floor;
  a map with real storeys keeps ADR 0040's answer untouched.

The toggle and its range persist like the rest of the panel's standing preferences
(`mapHeightFollow`, `mapHeightFollowRange`) — a habit of how you read maps, not a fact about the
zone you're in — while the resulting window itself stays the existing per-zone, unpersisted
`HeightPick`.

## Consequences

Walking a tall outdoor zone with the panel open keeps the drawn geometry roughly at your own feet
without touching the sliders, and turning it off — or dragging a handle, or stepping into a zone
with real floors — falls back to exactly the behavior the panel already had. The range is a flat,
adjustable guess rather than something derived from the map, because there's no zone-wide figure to
derive it from: `zRange` is the whole span, not a floor's share of it. It's exposed as a small
number field beside the toggle instead.
