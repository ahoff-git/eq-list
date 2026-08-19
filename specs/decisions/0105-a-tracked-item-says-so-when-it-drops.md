# 0105: A tracked item says so when it drops

## Status

Accepted

## Context

The whole app is a shopping list that reads your log, and the list has never spoken. A loot line
matching an entry has been noticed since the first build — `store.applyLoot` credits the count and
`CH.lootMatched` goes out — but the only thing listening is `useMatchFlashes`, which **flashes the
row gold for 1.5 seconds** in a window that is behind the game. The one moment the list exists for is
the one moment it cannot reach you.

Everything needed was already here. Two other features raise a banner off the app's own observation
rather than a watch — a personal best (`event: "record"`) and a spawn window opening
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md), `event: "spawn"`) — and both
go through `alert-router.ts` to the one overlay, wearing an ordinary saved style. A third is the same
shape.

Two things about the log decide the scope, and one of them is a limit:

- **The log only ever names your own loot.** Every pattern in `log-parser.ts` is a `You looted…`
  form, checked against EQBuddy's parser and a real EQL log, and nothing in either shows a
  group-mate's drop. So "tell me when *we* loot one" is not a thing this log can answer. A
  group-mate's drop could only arrive over the awari room, which is a different decision with a
  privacy default to settle — recorded as an Open Question rather than half-built here.
- **A loot line arrives in a flood.** A quest wants twenty Bone Chips as readily as one Flowing
  Black Robe, and everything logged while the app was shut is replayed through the live path
  ([ADR 0044](./0044-the-log-position-outlives-the-app.md)) — so an unguarded banner means a
  screenful of last night on every launch, and a chain of chips mid-camp.

## Decision

A list entry may **ask to be told**, and the loot line that satisfies it raises an ordinary alert.

- **Per entry, off by default** — a `notify` flag on `ShoppingListEntry`, toggled by a 🔔/🔕 on the
  row, which needs no new IPC (`list.update` already patches an entry). The same choice a spawn
  timer's `notify` makes, for the same reason: everything you kill gets a timer and most are not
  being camped, and everything you want gets a list row while only some of them are the reason you
  are sitting there. A **mob** entry never offers the toggle — nothing drops it, so no loot line can
  ever speak ([ADR 0098](./0098-a-mob-is-a-thing-you-hunt.md)).
- **`AlertRouter.loot`** owns every rule about whether it actually speaks, beside `record` and for the
  same reason: it skips matching and the queue (the *list* decided this was worth hearing, and a "it
  dropped" held back until later is not one), and resolving the look is this module's job. `main.ts`
  stays wiring — one call in the handler it already had.
- **The liveness rule is reused, not reinvented.** `stale()` moves from private to exported in
  `cast-alerts.ts`: a drop older than `LIVE_WITHIN_MS` raises nothing, which is what keeps a replayed
  gap quiet. High scores solved the same problem with a `setQuiet` flag flipped at `onCaughtUp`; a
  second flag would be a second thing to get wrong, and the timestamp is already in the event.
- **It speaks while the entry is outstanding, and the line that finishes it says `done`.** The
  banner words itself from the counts (`obtained` of `needed`), and the completing line is the last
  one that entry raises — a satisfied row left on the list, which is exactly what `showObtained` is
  for, must not nag for ever about a thing you already have. The prior count is `obtained - qty`, so
  a stack of two is one line that moves the list two closer.
- **The count is the row's own.** `needed` arrives already scaled by the group's runs
  (`effectiveNeeded`, via a new `runsFor`), because a banner disagreeing with the row it came from is
  worse than no banner.
- **One built-in look, `built-in:loot`** — gold, `levelup`, no flash, 5s, top-right — rather than a
  style per entry. A drop is good news and must not arrive in dispel red, which is what the
  built-ins exist for; and `Loot` is an **ordinary saved style**, editable in the Alerts tab, so
  "loot alerts should look like this" is one decision in one place
  ([ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)). Nothing is flashed, because
  the one thing you are certainly doing when this fires is reading a loot window.

## Consequences

- The list can finally interrupt you, which is what an overlay is for. A camper watching for one
  robe among a hundred chips arms one row and hears about exactly that.
- **No `styleId` per entry**, unlike a spawn timer. If two armed rows ever need telling apart by
  sound, the spawn precedent is there and this is the field to add — but the dense list row is a bad
  home for a dropdown, and the shared style covers the request as asked.
- A satisfied entry goes quiet for good, so a player who wants to keep hearing about a rare they
  farm to sell has to raise `needed`. That is the honest reading of a count that is met.
- The banner cap still applies (four, `MAX_ALERTS`), so arming twenty rows degrades rather than
  buries — but the open question about rate-limiting a noisy trigger now has a second caller.
- **Group loot is still out of reach**, and deliberately: nothing here pretends to know what a
  group-mate looted. The awari version is an Open Question in
  [decisions/README.md](./README.md).
