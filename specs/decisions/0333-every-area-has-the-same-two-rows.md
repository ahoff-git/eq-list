# 0333: Every area has the same two rows, and the trail always has its own

## Status

Accepted

## Context

[ADR 0320](./0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md) put the control window's
tabs into areas, with each area's sections on a second row. Craft had one section, Tradeskills, so it
had no second row. The panel drew its own instead: a Guides / Crafting log toggle, then the skill
picker under it. Craft looked like it had three layers of tabs where every other area had two.

The trail row ([ADR 0173](./0173-back-goes-back-one-place.md)) drew nothing until there was
somewhere to go back to. So the first link you clicked added a row and pushed the panel down under
the cursor. Craft's missing section row also moved the trail up a row there.

## Decision

- **Craft has two sections:** Guides (`tradeskills`, its old key) and Crafting log (`crafting`).
  Crafting log is greyed out where there is no log to read, like the other log-fed sections. The
  skill picker stays in the panel, because it picks content, like Hunt's zone picker.
- **The section row is always drawn**, however many sections an area has.
- **The trail row is always drawn.** With nowhere to go, back and forward are greyed out and the
  row just names where you are.

## Consequences

- Every panel starts at the same height on every screen. A link click no longer moves it.
- The window spends one row on the trail even when it has no history, a small cost for a stable
  layout.
- A remembered Tradeskills view that was on the crafting log now opens on the guides. The log is a
  section of its own now, one click away.
- An area with a single section would show a row with one tab. That is consistent, if sparse.
