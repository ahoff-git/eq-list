# 0099: A countdown can stay on screen, and a timer picks a saved look

## Status

Accepted

## Context

Spawn timers reached the screen in exactly one way: a banner at the moment of the pop
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md),
[ADR 0097](./0097-a-sighting-is-the-tightest-evidence-there-is.md)). That answers *"it's up now"*,
once, and then goes away.

It is not the question a camper asks. **"How long left"** is asked constantly, in the middle of a
pull, and the only place to read it was the Timers tab — which means alt-tabbing out of the fight to
look at a number. That is precisely the trip an overlay exists to remove, and every other live figure
in the app already avoids it.

The banner also had no wardrobe. A cast alert wears the defaults, a saved style, or its own look
([ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md),
[ADR 0090](./0090-one-style-editor-at-a-time.md)); a spawn pop wore the defaults and nothing else, so
a camp you're waiting on all evening looked identical to a raid call.

## Decision

**A timer wears a saved style, or the defaults, and never a look of its own.** Exactly the call
[ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md) made for a celebration, and for
the same reason: a per-timer style editor would be a *third* source of truth beside the defaults and
the saved styles, which 0086 and 0090 exist to prevent. The row offers a picker of the looks the
Alerts tab defines; making and editing a look stays in one place.

Resolved in main, at the moment of the alert, and sent **with** it — the overlay window only knows
the defaults, so a per-timer look could reach the screen no other way. A `styleId` that no longer
resolves falls through to the defaults rather than dropping the alert: something that can't be
styled must still be *seen*.

The picker appears only when **Notify** is on. A look for a banner that will never be raised is a
control describing nothing.

**A countdown can be pinned to the screen, per timer, opt-in.** `onScreen` puts that row on the
overlay for as long as it runs. Opt-in for the same reason `notify` is: everything you kill is
tracked, and a list of every named you happened to walk past would be a wall of text over the game
rather than a glance. Nothing renders until you pin one.

**It is a separate question from `notify`, and deliberately not folded into it.** One is a *moment*,
the other is a *dial*. A camper very often wants the clock in front of them and no banner at all —
and someone watching two camps wants two clocks and one alert. Folding them together would make the
common case unreachable.

**It rides the existing alert overlay window.** Everything that makes `/alert` right for a banner —
frameless, transparent, always-on-top, click-through — is what a pinned countdown wants too, and a
second window would be a second lot of window state to place, remember and restore
([ADR 0074](./0074-how-a-window-was-left-is-window-state.md)). The HUD sets `pointer-events: none`,
so a read-only list never takes a click back from the game.

**A pinned countdown sits where its own alert would.** It answers to the same style the pop wears —
the defaults, or the saved one the timer picked — so a player who put their alerts bottom-right gets
their clocks in the corner they already look at, custom placed spots included. Two timers wearing
different styles are two stacks, exactly as two banners at different positions are.

That made `placement` shared rather than the banner's private helper: it moved into
`alert-styles.ts` as `alertPlacement`, and the six position rules moved onto an `.overlay-at` class
both wear. One setting, one definition — a second copy would have been a second thing to keep in
step the first time a position was added.

The style is resolved **in the renderer, from the id**, which is the opposite of a banner and
deliberately so: a banner's look is frozen at the moment it fired so nothing restyles it afterwards,
while this is a live readout and restyling one should move it there and then. `RunningSpawn`
therefore carries `styleId`, not a resolved `AlertStyle`.

Where the two collide — a timer pinned to the very spot its own pop lands on, which is now the
*common* case rather than an edge — the **banner draws over the countdown** and goes away by itself.
It is the thing to read at that moment, and the clock underneath has not gone anywhere.

**Colour and state divide the row between them.** The style's colour marks the row's edge, so a
pinned countdown is recognisable as the thing whose banner is coming; the *clock* keeps the panel's
own state vocabulary, because "up" and "waiting" must stay tellable apart at a glance whatever
colour the player chose. Neither touches the other's half.

**It draws its own backdrop.** It floats on a transparent body over whatever the game is showing, so
text alone would be unreadable against a bright wall — the row carries a dark panel and a shadow
rather than relying on the page having a background, which it does not.

**The app ships the two looks, rather than leaving both to the defaults.** A cast alert is a
*warning* and keeps the red; a **record** and a **spawn** are *news*, and arriving in the same red
in the same place as "dispel now" is the sameness that makes a feature look broken before anyone has
configured anything. So `BUILT_IN_STYLES` ships a gold **Record** (no flash — a personal best is
worth a moment of pleasure, not a jolt) and a green **Spawn timer** (top-right, out of the warning's
spot, and lingering, because a pop is news you may be seconds late to notice where a dispel prompt
is useless the moment it is missed). High scores wear the first by default; a timer falls back to
the second.

They are **ordinary saved styles** — in the Alerts tab's list, editable, renamable, deletable, and
wearable by anything else. A built-in the player couldn't reach would be a second wardrobe under
another name, which is what 0090 exists to prevent.

Seeding them needs a migration rather than a defaults merge, because `deepMerge` replaces an array
wholesale: right for a list the player curates (a style they deleted stays deleted) and wrong for one
the app also contributes to. `seedBuiltInStyles` reconciles by **id**, appending only what is absent
and never touching what is there. It is deliberately *not* schema-gated — the question it asks is its
own answer, and a stamp would only be a way for a later built-in to be skipped.

Rejected alternatives:

- **Showing every running timer.** Free to build, unusable by the second evening — the board exists
  because tracking is automatic, and the HUD exists because glancing is not.
- **A placement control of its own.** It needs none: it inherits the alert's, including a custom
  placed spot, so the control already exists and is somewhere the player has already been.
- **A fixed corner** (what shipped first). Top-left was the corner nothing else claimed, which is a
  fact about *this* layout rather than about the player — and it put the countdown somewhere they
  had not chosen to look, while their alerts appeared somewhere they had.
- **A wardrobe of its own**, separate from the alert's. It borrows the alert's colour and position
  instead: a readout and the banner it precedes are the same thing at two moments, and two sets of
  looks for one feature is one too many. What it does *not* borrow is how a state reads — waiting,
  window, up and alive keep the panel's vocabulary, because a colour the player chose for visibility
  must not be able to make two states look alike.

## Consequences

- The Timers tab stops being somewhere you have to *go*. For a camper with one mob pinned it becomes
  setup rather than a place to sit, which is what a tab in an overlay should be.
- The overlay window now renders two unrelated things. Both are inert until they have something to
  say, so the cost is one more component mounting on a window that was already there — but it is now
  a surface with more than one owner, and a third would want a reason.
- **A pinned countdown is only as visible as the window it rides.** Alerts being switched off does
  not hide it (it is not an alert), but hiding the overlay does — which is right, and worth knowing.
- Four states have to read in the space of a HUD line, so the row shows the clock and the name and
  nothing else. Everything about *provenance* — the bound, the sample, the caveat — stays on the
  panel, where there is room to be honest about it.
