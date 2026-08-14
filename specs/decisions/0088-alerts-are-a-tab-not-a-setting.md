# 0088: Alerts are a tab, not a setting

## Status

Accepted

## Context

Cast alerts began as a group inside Settings, which was the right size for what they were: a list of
substrings and three checkboxes, sitting under the log folder and the opacity slider.

Five decisions later ([0082](./0082-an-alert-can-be-scheduled.md),
[0084](./0084-a-watch-is-a-rule-not-a-substring.md),
[0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md),
[0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md),
[0087](./0087-an-old-rule-is-converted-once-and-the-path-is-one-module.md)) a rule has conditions,
timing, cancelling phrases, four drawers, a check that replays the log, a library, share codes and
shared styles — and it was still several screens down a scroll shared with "where is your log
folder?".

The mismatch is one of *kind*, not size. Settings answers a question once: you point it at your log,
you pick a translucency, you leave. Alerts is somewhere you go back to — you write a rule, watch it
miss, adjust the wording, test it against the log again. That is a workspace, and this app already
has a shape for a workspace: a tab.

## Decision

**Alerts is a tab** (`AlertsPanel`), fetching settings itself like every other panel rather than
being handed them. The `castAlerts` *data* stays in Settings, because it is a setting in the sense
that matters — it persists, it merges, it syncs to every window. Where it is **edited** is a
different question from where it is **stored**.

**It sits fourth**, after List / Hunt / Loot. `TabBar` collapses whatever doesn't fit into a `»`
menu from the **end**, and at the window's default width only six tabs fit — so putting it last
would have left the feature *two* clicks away, which is worse than the one click it had as a group
inside Settings. Promoting a feature into a menu is not promoting it. Session moves into the overflow
in its place: it is a panel you glance at, not one you work in.

**The label carries the live rule count** — `Alerts (6)` — and says `(off)` when the master switch is
down. That second state earns its place because the failure it describes is otherwise invisible: an
overlay with alerts switched off looks exactly like one with nothing to warn you about, and you find
out in the fight where it mattered.

**Every input in the panel is elastic.** The controls had been sized for the narrow column they used
to live in — 58px `<select>`s clipping "Bottom right", a condition's text box squeezed to a few
characters by two fixed-width pickers beside it. Now they grow with the panel and stop at a cap
(`.pick` / `.pick.wide`), the words in a condition take whatever the row has left, the two fields on
a rule's row have a floor under them and the row **wraps** rather than crushing them, and the label
column is a fixed width so every control in a drawer starts at the same x. The sizes live in CSS
under names that say what they're for, not in inline styles.

## Consequences

Settings is back to being settings, and shorter for it. The feature that has absorbed the last five
decisions is one click from anywhere, and says on its own tab how many rules are live.

**Session is in the `»` menu at the default width.** That is the real cost, and it is a trade rather
than a free win: the tab bar's overflow already existed for exactly this, and the answer to "I want
both" is a wider window, which the bar re-measures on resize.

Verified by running the app rather than by reading the CSS — the drawers were screenshotted at the
default width, which is how the `⚟` glyph (an anonymous angle bracket at that size, now 🎯), the
clipped "alert says… (optiona" placeholder, the "three drawers" that listed four, and the ragged
label column were all found. None of that was visible from the source.
