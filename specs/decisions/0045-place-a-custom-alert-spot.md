# 0045: Place a custom alert spot by lending the overlay a click

## Status

Accepted

## Context

Alerts can sit in one of six preset spots (the corners, top, centre). Some layouts want an alert
somewhere specific — beside the health bar, over the spell gems — that no preset hits. The natural
way to say where is to point at it.

But the alert overlay is deliberately **click-through and never focused** ([ADR 0035](./0035-cast-alert-overlay-window.md)):
it floats over the game and mustn't eat a click or steal focus. A window that never catches a click
can't be clicked to place anything.

## Decision

**A custom spot is a named point, stored as a fraction of the display**
(`AlertLocation { id, name, fx, fy }` in `castAlerts.locations`), so it survives a resolution
change and follows a monitor switch to the same relative place.

**Position stays one field.** `AlertStyle.position` is `AlertPosition | \`loc:<id>\`` — a preset or a
reference to a placed spot. One dropdown offers both, and switching between them never leaves a
stale second field behind (the trap a separate `locationId` would set, since the store's merge
can't clear a value). A `loc:` that no longer resolves falls back to the top rather than dropping
the alert. A spot is shared across the defaults and every watch, so one placement serves all.

**Placement lends the overlay a click.** When the user clicks "Place a spot", the main process
makes the overlay interactive and focusable *for the moment*, tells it to show a placement layer
(a dim catcher with a preview banner tracking the cursor), and waits. The overlay reports the click
as display fractions — or null on Esc — and the main process restores click-through and hands the
point back to Settings, which names it. A click always resolves, so you can't get stuck; Esc is the
graceful out.

## Consequences

Any alert — the defaults or a single watch — can be pinned exactly where it's useful, pointed at
rather than described. The overlay's normal contract is untouched: it's interactive only for the
one placing click, then click-through again.

Placement briefly takes focus from the game/app — unavoidable for a window built never to have it,
and it's a deliberate, momentary action the user started. Spots are display-relative fractions, so
one placed on the monitor the overlay covers lands at the same relative point if that monitor
changes; placing precisely for a specific screen means placing while the overlay is on it.
