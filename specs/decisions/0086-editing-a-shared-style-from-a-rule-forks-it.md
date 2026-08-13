# 0086: Editing a shared style from a rule forks it

## Status

Accepted

Refines the **saved styles** part of
[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md); everything else in 0085 stands.

## Context

[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md) gave a look a name so several rules
could wear one, and resolved a rule's appearance in three layers: the defaults, the saved style it
wears, then the rule's **own overrides** on top. The rule's 🎨 drawer offered a *tweak it* button
that turned that third layer on.

That third layer is the mistake. It conflates two different things:

- **Wearing a style** — "this rule looks like Loud."
- **Having a look** — "this rule looks like *this*."

With an overlay you get neither. The picker says *Loud*, the rule doesn't look like Loud, and what
it actually looks like is stored in a place with no name and no way to see it beside the styles it
is competing with. Change *Loud* later and this rule half-changes, in whichever fields it hadn't
overridden. Nobody can hold that in their head, and the panel can't show it.

The user's framing settles it, and it's the right one: **a saved style is a style. If you use it and
then change it, what you have is a new style.** Changing the *shared* one is a different intent
entirely, and different intents deserve different gestures — not the same controls behaving
differently depending on where you opened them from.

## Decision

**A rule wears exactly one look**: the defaults, a saved style, or one of its own. The picker in the
🎨 drawer says which, and it is telling the truth — picking one drops whatever it had before, because
a picker that leaves an invisible layer behind is a picker that lies.

**Changing a look from inside a rule can never change another rule.** Which of three things that
means is decided by `plan` in [alert-styles.ts](../../src/shared/alert-styles.ts), stated in the
drawer *before* the change rather than reported after it:

| what it's wearing | what an edit does |
| --- | --- |
| a look of its own | changes it in place — nobody else can be wearing it |
| a saved style **nobody else wears** | changes that style in place — same reason |
| a saved style **others wear**, or the **defaults** | **forks**: a new saved style, and this rule now wears it |

**The fork starts from what the rule looked like a moment ago** — resolved through every layer,
including any legacy overlay — plus the one change. A copy that arrived assembled from the defaults
would be a surprise, and this way the screen doesn't jump. It is named after its parent (`Loud copy`,
then `Loud copy 2`), the rule is repointed at it, and **any own-overlay is cleared**, since
everything it said is now baked into the copy.

**Not forking when nobody else wears it** is the one concession to practicality, and it is not a
softening of the rule: with a single wearer there is no one to protect, and forking anyway would
bury the list in near-identical copies after three keystrokes. Once forked, the rule owns its copy
and keeps editing it in place — the fork happens once, at the moment sharing was actually at stake.

**Changing a shared style for everyone is a different place**: the *Saved styles* list under Alert
style, which edits in place, shows each style's wearer count, and says in as many words that editing
there changes every rule wearing it. Two intents, two locations, no mode switch.

**A rule's own look can be promoted** into the shared list (`nameOwnStyle`), which is the honest
inverse of a fork and changes nothing about how the rule looks.

**The layering in `alertStyle` stays** — defaults, saved style, own — because a settings file written
before this decision can have both fields set, and because a look saved before a field existed still
has to pick that field up from below. What's gone is any way to *create* that state.

## Consequences

The picker is now readable at a glance: what a rule wears is what it looks like. "Which of my rules
will change if I edit this?" has an answer you can see — the wearer count — rather than one you have
to reconstruct from where you happened to click.

**The cost is style-list growth.** Forking makes styles, and a player who tweaks six rules that all
started on *Loud* ends with six styles. That is the honest accounting of what they did, and it beats
six invisible overlays; the list is named, countable and deletable, which none of the overlays were.

**A deleted style still falls back to the defaults** ([ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md)),
and a rule wearing a style that no longer exists now forks on its next edit rather than editing
nothing — the same rule applied to a dangling reference.

The decision is a pure module with the UI holding none of it, so the two writes a fork needs — the
new style, and the rule repointed at it — are returned together and applied in **one** patch. Applied
separately they would render for a frame as a rule pointing at a style that doesn't exist yet, which
is the defaults, which is a flash of the wrong colour on every fork.
