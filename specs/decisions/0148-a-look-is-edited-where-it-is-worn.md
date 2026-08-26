# 0148: A look is edited where it is worn

## Status

Accepted

Relaxes the *placement* rule in
[ADR 0090](./0090-one-style-editor-at-a-time.md) — one editor, one tab — to one editor, wherever a
look is worn. What a look is ([ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)) and
which ones cannot be deleted ([ADR 0120](./0120-a-feature-s-look-is-sticky.md)) are unchanged.

## Context

Four things outside the Alerts tab wear a saved style: a spawn timer, a tracked buff, the
scoreboard's celebration, and — one look for the whole feature
([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md)) — the shopping list. Each one
offered a **picker** and a tooltip that said, in so many words, that the look itself was edited
somewhere else.

That made "make this one green" a five-step errand: leave the board, find the Alerts tab, find the
right row among looks you named weeks ago, change it, come back and check. The tooltip was the only
thing in the app that knew where the editor was, and a tooltip is not a route. A look was findable
only by someone who already knew where it lived, which is the definition of a feature that reads as
missing.

ADR 0090's exclusivity rule was written about a **tab** — four grids of identical swatches stacked
down one page, with nothing to say which was which. That reasoning is about two editors *visible at
once*, not about which page they are on.

## Decision

**Anything that wears a look can edit it, in the same drawer, from where it is worn.**

- **The same component, not a copy.** `AlertStyleField` (picker + 🎨) and `AlertStyleDrawer` (the
  sentence + `AlertStyleFields`) are the one pair, and the Alerts tab's own feature rows use them
  too — so the six controls and the words above them are written once. ADR 0090's "one editor" is
  intact; only "in one tab" is gone.
- **An edit from a wearer is the shared edit, and says so first.** A drawer opens with who else
  wears this look, in `describeUse`'s words, above the controls rather than after the damage. A
  player opening this from a buff row is nearly always saying *buff alerts should look like this*.
- **Forking is a choice, not a side effect.** The picker's last entry — *＋ New style from this
  one…* — copies the resolved look, wears it, and opens it. This is the deliberate opposite of a
  rule's behaviour ([ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)), where the
  edit forks silently: a rule is one specific thing the player wrote, while a timer or a buff is one
  of hundreds wearing a feature's look, and forking each of those on a whim would breed
  near-identical styles nobody named.
- **The blank choice and the look it stands for are one entry.** A picker's blank *is* the built-in
  ("Spawn timer (default)"), so that style is not also listed by name, and 🎨 edits it whether it was
  chosen explicitly or fallen back to.
- **The list's look is the list's, not a row's.** The shopping list gets one control, shown once
  something is armed, because there is no style per row to hang it on (ADR 0105).

## Consequences

The style a thing wears is now reachable from the thing, which is where the question is asked. The
Alerts tab keeps every look in one readable list — that was ADR 0090's real win and it is untouched.

**Two edits now mean different things depending on where you started**, and that is deliberate:
from a rule, forking; from a wearer, the shared change. Both say which before they do it — a rule's
drawer through `plan`'s sentence, a wearer's through the "worn by" line — so the difference is
stated rather than discovered.

**Exclusivity is now per row, not per tab.** Each board already owned "which of my drawers is open"
and the style drawer joined that state, so a spawn row cannot have its length box and its look open
at once. Nothing enforces it *across* boards, and nothing needs to: they are separate screens.

**The usage read is per open drawer.** `useStyleUsage` watches three stores, so it is mounted by the
drawer rather than by the field — a board of two hundred timers pays for the one editor that is
open, not for every row that could open one.
