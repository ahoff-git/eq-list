# 0120: A feature's look is sticky, and the tab says who wears what

## Status

Accepted

## Context

Three things raise a banner with **no rule behind them**: a personal best
([ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md)), a spawn window opening
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)) and a tracked item dropping
([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md)). Each is built on a shipped saved style —
`built-in:record`, `built-in:spawn`, `built-in:loot` — deliberately made an **ordinary** style so there
is one style editor in one place ([ADR 0090](./0090-one-style-editor-at-a-time.md)).

Ordinary turned out to be too ordinary, and the tell was a question nobody could answer from the
screen: *which style do loot alerts use, and what happens if I delete it?*

- **The Saved styles list counted rules only.** `styleWearers` filtered `castAlerts.watches`, so the
  look every loot banner on the machine wears read **worn by 0**, beside a ✕ whose tooltip promised
  that "rules wearing it fall back to the defaults" — which is to say, *nothing will happen*. Both
  halves were false. The same blindness hid a spawn timer wearing a hand-made style, and the
  celebration's own choice.
- **The same count decides whether an edit forks.** `plan` read it to tell "a saved style nobody else
  wears" (edit in place) from "a shared one" (fork,
  [ADR 0086](./0086-editing-a-shared-style-from-a-rule-forks-it.md)). So a rule wearing the **Loot**
  look and given a new colour repainted every loot banner in place — the exact overreach ADR 0086
  exists to prevent, arriving through the one wearer it wasn't counting.
- **The Alerts tab listed rules and nothing else**, so the three features that alert *without* a rule
  were invisible in the tab named after them. The only route to "a loot banner exists, and it wears
  the gold one" was reading `alert-router.ts`.
- **Deleting one half-worked.** `seedBuiltInStyles` puts a missing built-in back on the next launch
  ([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md)), so the style returned — but until then
  the feature fell through to the alert defaults, which is dispel red: a drop landing announced itself
  as an emergency, which is the precise thing the built-ins exist to avoid. A rename stuck for good.

The three call sites were the root of it. Each named a built-in id inline, and nothing anywhere said
they were the same kind of thing — so no count could include them and no row could list them.

## Decision

**Name the sources, count them as wearers, and make the look they are built on sticky.**

- **`ALERT_SOURCES`** in `alert-styles.ts` is the one list of things that alert without a rule: a
  label, a sentence saying what sets it off and where its on/off lives, the style it ships with, and
  two functions — `worn` (which style its alerts wear today) and `armed` (how many of its things would
  speak right now). `BUILT_IN_STYLES` is derived from it, so seeding, the store defaults and the
  registry cannot drift apart. Only the spawn board overrides `wears`, its timers choosing one each.
- **Wearing and arming are separate questions.** Wearing is a setting; arming is a switch the player
  flips whenever they like. A silent timer still wears its style, and deleting that style would still
  change how it looks the moment it speaks — so the count follows the setting, and the row shows the
  switch.
- **`styleUse` replaces the rules-only count** wherever a decision hangs on it, returning the rules,
  the features by name, and the total. `describeUse` words it: *worn by 2 rules · Loot drops*, or
  *worn by nobody* — which a bare `0` never managed to say. The `AlertUsage` it reads is optional per
  field, because callers know different amounts: the Alerts tab gathers all of it (a spawn read of its
  own, not `useSpawns`, whose 1Hz pulse would re-render the tab to learn nothing), and a rule's picker
  has only the settings it was handed. Absent means *unknown*, and every fallback errs towards
  "shared" — the direction that protects somebody.
- **A sticky style may be restyled, but not renamed or deleted.** Sticky is derived — `stickySource`
  asks whether any source is built on the id — so a fourth source protects its look by arriving. The
  rows withhold the ✕ and the name field and show a 🔒 saying whose look it is (a greyed ✕ invites a
  click to find out why; the 🔒 answers first), and `withoutStyle` / `withStyleName` refuse underneath,
  so the rule has one home rather than two.
- **`plan` forks on a sticky style, always.** A feature is built on that look; "make *this* rule green"
  must not repaint every drop. This is ADR 0086's rule, applied to a wearer that isn't a rule.
- **Each source gets its own row in the Alerts tab**, shaped like a style row because it *is* a look
  plus a sentence: name, which look it wears, how many things are armed, and the same 🎨 that opens
  every other editor in the tab — under the row you clicked, which is why `source` is its own open
  target rather than a reuse of `style`. **No ✕ at all**: the feature is part of the app, and there is
  nothing for deleting its row to mean.
- **Arming stays where the thing being armed lives** — 🔔 on a list row, 🔔 on a timer, the switch on
  the Records board. The row reports it and does not duplicate it: the decision is made where the
  player is when they make it, and a second switch is a second thing to disagree with the first.

## Consequences

- The question that started this is answerable from the screen. **Loot drops · wears Loot · 2 list rows
  armed**, and the Loot style says **worn by Loot drops** and offers a 🔒 instead of a lie.
- **A player can no longer remove a built-in style**, only restyle it. That is a real loss of freedom
  and a small one: the seeding already put it back next launch, so what "delete" actually bought was
  one session of loot banners in dispel red.
- **A rule wearing a feature's look now forks** where it used to edit in place. Anyone who had used
  that as a way to restyle their loot banners from a rule has lost it — Saved styles, or the feature's
  own row, is where that is done, and both change it for everything at once.
- **A built-in renamed by an older build keeps its custom name.** Nothing rewrites stored settings:
  the name is theirs, and only further renaming is refused.
- The Alerts tab now reads two stores it had no other reason to touch. Cheap (a spawn view and the
  shopping list, both already followed elsewhere) and bounded to the tab being open.
- **`unit` is a singular noun** and the wording goes through `format.count`, so "1 timers armed" can't
  come back.
- Everything the features need is now in one list, which is the point: a fourth source gets a row, a
  count and a sticky look by being added to it. What it does *not* get is a per-thing style — that
  remains a per-source decision, and ADR 0105's reasons for loot not having one still hold.
