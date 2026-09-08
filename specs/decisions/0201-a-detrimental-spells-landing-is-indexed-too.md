# 0201: A detrimental spell's landing is indexed too

## Status

Accepted

## Context

A player asked for a mez/charm coverage overlay: which mobs currently have a crowd-control spell on
them, and which have lost it. Building it exposed a gap nothing had needed to cross before.

`spell-strings.ts` reads `spells_us_str.txt` for the sentences a spell prints — landing on you,
landing on somebody else, wearing off. Since it was written, it gated the index to spells that are
both **obtainable** and **beneficial**, on the reasoning stated in its own header: "a detrimental
spell's landing is a *debuff* on somebody, which is not what any of this is for." A targeted fade
("Your Root spell has worn off of a wild tiger.") is parsed directly off the log line and never
needed the lexicon at all, so nothing had reason to look past it.

A landing emote is different. `X is mesmerized.` names no spell and no caster — the only way to know
which spell wrote it is the same reverse lookup a beneficial landing already uses. With detrimental
spells excluded from the index, that lookup returns nothing for Mesmerize or Charm, so **the app has
no way to observe a debuff going up at all**, only its fade. That is enough for the existing
"put it back on" reminder (a fade proves it was up), but not for telling two same-named mobs apart —
that needs to know the *moment each one landed*, which a fade-only view can never supply.

## Decision

**The index gate is obtainability alone.** A detrimental spell's landing and fade sentences are
indexed exactly like a beneficial spell's now.

- The reasoning the old gate stood on — "a debuff's landing is somebody else's business" — is still
  right, and still enforced. It was just never the lexicon's job: `worthWatching`/`castByYou` in
  [buff-tracking.ts](../../src/shared/buff-tracking.ts) already refuse a debuff row unless the log
  showed *you* casting it ([ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md)), and that
  gate is unchanged. Widening the lexicon does not widen what gets shown to anyone; it only widens
  what the app is capable of *noticing*.
- `buildBuffLexicon`'s obtainability filter (`isObtainable`) is unchanged and does all the same work
  it always did against out-of-era spells sharing a name.
- The test that used to assert a detrimental spell claims no sentence ("a debuff landing is not our
  business") is replaced with one asserting the opposite, and a second test keeps the out-of-era
  exclusion on its own.

## Consequences

The indexed set roughly doubles — obtainability alone admits both sides of the beneficial split — but
the failure the gate exists to prevent (an unfiltered, ~74k-row index) is still an order of magnitude
further off, so the live-file bound in `spell-strings.live.test.ts` widened rather than tightened.

A mez or charm landing on a mob is now observable the moment it happens, which is what
[ADR 0202](./0202-two-mobs-sharing-a-name-get-two-debuff-rows.md) needs to tell two same-named mobs
apart. Every other detrimental spell (a root, a snare, a DoT) gains the same capability incidentally,
but nothing changes for them in practice: `worthWatching` still requires a cast attributed to the
player, `line()`'s cast-recency gate (`castRecently`) still requires that cast to have happened
inside the same short window, and neither of those was affected by where the sentence came from.
