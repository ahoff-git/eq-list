# 0090: One style editor at a time, opened by a button

## Status

Accepted

Refines the presentation settled in
[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md) and
[ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md). What a look *is*, and what editing
a shared one does, are unchanged.

## Context

`AlertStyleFields` — colour swatches, a sound picker, position, motion, duration — is the right size
for **changing** a look. It was being rendered in three places at once: the defaults, once per saved
style, and inside a rule's 🎨 drawer. Three saved styles meant four sets of identical controls on
screen, one under another, with nothing to say which was which.

That is a failure of the panel rather than of the control. Six widgets is a lot of screen for a
decision that is made rarely and *read* constantly — "which of these is the loud one?" — and repeating
them turns the styles section into a wall you scroll past to reach anything else. Worse, with the
defaults' editor and a rule's own open together, two identical grids were live at once and only their
position on the page said which was which.

## Decision

**One editor is open in the whole tab at a time**, and it is opened by a button.

- **A look is a row**, not a grid (`StyleRow`): a colour dot, its name, what it does in a dozen
  characters (`chirp · Top center · Pulse · flash`), and how many rules wear it. That is what you
  scan for when choosing between looks, and it fits on one line, so several fit on a screen where two
  editors didn't.
- **🎨 opens the one editor**, indented under the row that opened it — the same shape a rule's drawer
  has, so "this belongs to the line above" reads identically in both places. The button carries the
  same `on` state a rule's drawer buttons do.
- **Creating is opening.** "＋ New saved style" makes a copy of the defaults and opens it. Making a
  look and editing one are the same gesture, so there is nothing extra to learn for the case that
  happens once.
- **Exclusivity is one piece of state.** `AlertsPanel` holds a single `OpenTarget` —
  `{kind:"rule"|"defaults"|"style"}` — rather than one flag per section, because that is what makes
  the rule enforceable rather than merely intended: a rule's drawer and a saved style cannot both be
  open, since there is only one place to say so.

## Consequences

The styles section went from a screenful per look to a line per look, and the tab has at most one
grid of swatches on it at any moment. Telling two looks apart no longer requires opening both.

**The row says less than the editor**, deliberately: it names the sound but not which beep it is,
the position but not a custom spot's coordinates. It is a label to choose by, not a summary to
verify by — the editor is one click away and is where verifying belongs.

**"Worn by N" is on the row**, which is where it does the most work: it is the difference between an
edit that changes one rule and an edit that changes six
([ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)), and it is now visible while you
decide rather than only after you have opened something.

Found by running the app and looking at it, like the rest of this tab's layout problems
([ADR 0088](./0088-alerts-are-a-tab-not-a-setting.md)) — three editors stacked is obvious on screen
and invisible in a diff.
