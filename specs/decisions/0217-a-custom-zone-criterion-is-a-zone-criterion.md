# 0217: A custom zone criterion is a zone criterion

## Status

Accepted

## Context

`achievement-progress.ts`'s `matchesZone` resolves both sides through `placeKey` (`zones/place.ts`) —
the same alias-and-typo-tolerant resolver kill-log grouping and mob-knowledge pooling already trust —
so a stock `"zone"` criterion (every entry `zoneCriteria()` builds for "Grand Tour") folds a difficulty
variant ("The Steamfont Mountains 2 (Adaptive)") or a known alternate spelling into the same place.

The Achievement Wizard's "Enter a zone" step (`AchievementsPanel.tsx`) never produced one of these.
Its `CRITERION_TYPES` entry carried a `template: (name) => "You have entered ${name}"`, and
`toInput` fed that templated sentence through as ordinary `trigger.text` — indistinguishable, by the
time it reached `electron/achievement-tracker.ts`'s `create()`, from a `"See a log line"` step. `create()`
has no branch for a zone at all: every non-manual custom criterion becomes `kind: "watch"` or
`kind: "count"`, matched as raw line text via `.includes()`.

For the common case this happened to work by accident — a difficulty suffix is *appended after* the
zone name in the log's own sentence ("You have entered Blackburrow 2 (Adaptive).", the same order the
template produces), so a plain substring match still finds it. What it silently cannot do is what
`placeKey` exists for: fold a *different* known wording of the same place. A custom "enter a zone"
achievement was quietly a worse version of the exact feature `"zone"` criteria already provide, on
every achievement except the one built by hand.

## Decision

`AchievementCriterionInput.trigger` gains a `zone?: boolean` marker. The wizard's zone step sets it
(`{ text: value, zone: true }`) instead of templating a sentence, and drops the "× count" field for
that step entirely — a zone is either visited or not, the same way `zoneCriteria()` treats every stock
one. `achievement-tracker.ts`'s `create()` checks it before falling through to the watch/count path:
`if (c.trigger?.zone) return { id, label, kind: "zone", zone: text };` — a custom zone criterion is now
matched exactly like a stock one, through `matchesZone`/`placeKey`, not through `.includes()` on a
sentence it built itself.

`AchievementCriterion.zone`'s doc comment is widened to say so: not only "a name from `CURATED_ZONES`"
but "whatever the player typed for a custom one" — `placeKey` degrades gracefully to matching a name
literally when the gazetteer has never heard of it, so an unrecognized zone name still works, just
without the alias-folding bonus.

## Consequences

- A custom "Enter a zone" achievement now gets everything a stock one does: difficulty-variant folding
  and known-alias folding, for free, from the same resolver.
- The wizard's `CRITERION_TYPES.zone` entry no longer needs a `template` function — the only other
  entries that used one (`kill`, `cast`) still build a literal watch, since neither has an equivalent
  structured-matching criterion kind to delegate to.
- Any future wizard step that maps onto a criterion kind with its own dedicated matcher (rather than a
  raw-text watch) should follow the same shape: a boolean marker on the trigger `create()` branches on,
  not a templated sentence indistinguishable from free text.
