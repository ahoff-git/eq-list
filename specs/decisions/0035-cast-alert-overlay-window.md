# 0035: Cast alerts get their own click-through overlay window, over the game

## Status

Accepted

## Context

Cast alerts (dispel-prep: "⚠ BunnySlayer casting Charm") rendered inside the app's own windows —
the control window and the map. Both sit *behind* a fullscreen EverQuest client, so the one moment
the alert exists for — glance up, dispel now — is the one moment you can't see it. An alert you
have to alt-tab to read is not an alert.

Two smaller problems rode along. The alert fired in every window that mounted it, so the beep
doubled when the map was open (papered over with a `canBeep` flag). And a watch matched *any*
non-self caster, so a groupmate — "BunnySlayer" — casting Charm raised the same alarm as an enemy,
which is noise: you don't prep a dispel against your own group.

[ADR 0009](./0009-single-window-with-tray.md) established one main window plus an on-demand map, and
[ADR 0032](./0032-remove-dead-overlay-surface.md) removed a dead click-through API that was never
wired to anything. Neither forbids a *purposeful* overlay — 0032 removed unused surface, not the
technique.

## Decision

**A dedicated alert overlay window, floating over the game.** A frameless, transparent window
stretched over the primary display, pinned always-on-top (`screen-saver` level) and **click-through**
(`setIgnoreMouseEvents`), never focusable. It renders only the alert visuals (the banner and the
red border flash) on a transparent body, so when idle it's invisible and every click passes straight
to the game. Click-through is applied in the main process on this one window — it does not
reintroduce the renderer-facing API 0032 deleted. The window exists only while cast alerts are
enabled; turning them off closes it.

**The beep stays on the main window; the overlay owns the visuals.** A window that is never focused
can't unlock Web Audio, so a click-through overlay can't reliably beep. The always-alive control
window plays the sound (with `autoplay-policy=no-user-gesture-required` so the very first alert
isn't silent); the overlay shows the banner and flash. One event, two windows, no double beep.

**A watch fires on mobs by default; named casters are opt-in per watch.** A caster is treated as a
plain mob when its log name carries an article ("a gnoll") and as *named* — player, pet, or named
NPC — when it doesn't ("BunnySlayer", "Lord Nagafen"). A watch ignores named casters unless its
`includePlayers` toggle is on. The article is the only player-vs-mob signal a single cast line
offers, so a *named boss* also needs the toggle to alert — an honest limit, and the toggle sits
right on the watch.

## Consequences

Alerts now land where you're looking during a fight, without stealing focus or a click from the
game. The overlay covers the **primary** display; a game on a second monitor won't get the flash
there, and a truly *exclusive*-fullscreen game may cover any overlay — both inherent to the
approach, to confirm on a real run (see the manual QA checklist).

The named-caster heuristic will misfile a named NPC boss as a "player" and stay quiet by default —
acceptable, since the common threat is ordinary mobs and the per-watch toggle is one click. If a
better player signal is ever wanted (the peer roster, or who's damaging alongside you in the combat
tracker), it can refine `isNamedCaster` without changing the toggle.
