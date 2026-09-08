# 0202: Two mobs sharing a name get two debuff rows, and their duration is learned

## Status

Accepted

## Context

A crowd-control class needs to know, mid-fight, which mobs still have their mez or charm and which
have broken free — the request that also produced [ADR 0201](./0201-a-detrimental-spells-landing-is-indexed-too.md).
The stakes are real: a missed re-mez is a second mob loose on the group.

EQ's log names a mob only by its display name — there is no id. `instanceKey(key, target)` keys the
buff board on exactly that string, so two mobs named "a wild tiger" collide into one row: mezzing the
second while the first is still up reads as a **refresh** of the first (same `since`, same identity),
and whichever fade arrives is applied to that one shared row regardless of which tiger it was really
about. The player would see one timer where two are running, and lose the warning for the one the
overlay silently dropped.

True identity is not recoverable from the log — this is the same wall
[ADR 0071](./0071-a-dot-tick-belongs-to-whoever-cast-it.md) hit for DoT ticks: "two people DoTing with
the same spell at once can't be told apart." The choice offered and taken was **order-based
numbering** ("1st wild tiger", "2nd wild tiger") over a safer count-only readout ("2 tigers, 1
covered") — more specific, and knowingly a heuristic that can mislabel which numbered mob is which if
cast order and engagement order disagree.

A second gap surfaced building the "how much time is left" half of the ask. The game states a buff's
duration as a *formula*, not a number — `BuffPanel`'s own header explains why nothing here has ever
shown a countdown: applying the formula needs a caster level the log never states, and "a clock we
can't stand behind would make every other figure here look like a guess too." **EQBuddy** solves the
same problem a different way: it learns a spell's duration from the player's own confirmed fades,
the same technique this app already uses for a respawn window
([spawn-timers.ts](../../src/shared/spawn-timers.ts)). That is not the refused formula-based guess —
it is a measurement, sourced the way [ADR 0025](./0025-observation-over-the-wiki.md) already prefers
observation to a claim — so it is a different decision, not a reversal of the one `BuffPanel` states.

A third gap: the numbering is admittedly a heuristic, and the existing dismiss control only ever
touches a *lapsed* row ("I know, stop reminding me"). There was no way to tell the board "that second
row isn't real" while it still reads as up.

## Decision

**`BuffInstance` gains `slot`, and only `onEnemy` rows are ever slotted.** Everything on you, your
pet, or a named player keeps the bare `instanceKey` it always had — none of those share a display
name with something else worth telling apart, so slotting them would be solving a problem they don't
have.

- **Slot assignment** (`enemySlot`, pure, in [buff-tracking.ts](../../src/shared/buff-tracking.ts)):
  reuse the lowest **lapsed** sibling's slot first — "the mez that just broke got recast" — and only
  once none is lapsed does a rise open the lowest slot not already up. Mirrors `timerId`'s `key#slot`
  in [spawn-timers.ts](../../src/shared/spawn-timers.ts), the same problem solved there for two
  spawn-timer clocks on one camp.
- **Which slot a fade closes** (`matchingInstances`, in [electron/buff-tracker.ts](../../electron/buff-tracker.ts)):
  a fade names the mob, never which instance, when more than one is up. The **oldest** by `since`
  closes — EQ durations are close to fixed per spell, so whichever landed first is statistically the
  one that ran out first. FIFO over LIFO because it needs no assumption about event-processing order
  during a replayed log gap, where LIFO would.
- **Duration is learned, not computed** (`tightenDuration`/`plausibleDuration`, pure): every confirmed
  rise-to-fade gap on an `onEnemy` row folds in, keeping the **shortest** seen — the same ratchet
  `tightenSighting` uses for a respawn, for the same reason: every gap is an upper bound (you can
  recast early; nothing can make a mob break loose *later* than the log says), so the tightest figure
  is the safe one and it only ever moves down. Stored on the spell's row (`durationSeconds`,
  `durationSamples`) beside `permanent`/`detrimental`, which are already facts-about-the-spell kept
  there. Scoped to `onEnemy` rows alone — `BuffPanel`'s own buffs are untouched by this, and its
  stated refusal to show a countdown stands for exactly the case it was written about.
- **A new control, `clearInstance`**, alongside `dismiss`: removes one instance outright, **up or
  lapsed**. `dismiss` means "I know it dropped" and refuses to touch a row that's up, on purpose —
  that gesture is for a real fact you've acknowledged. `clearInstance` means "that isn't real" — for
  when the order-based slot guessed wrong.
- **A new component, `DebuffOverlay.tsx`**, owns every `onEnemy` row instead of `BuffOverlay` showing
  them alongside its own. The two behave oppositely on purpose: an ordinary buff's "up" state is
  uninteresting (`BuffOverlay` shows only what's missing), while crowd control's "still holding" is
  exactly as worth a glance as "just broke" — one component, one job, rather than a second meaning
  bolted onto the first. `BuffPanel`'s "Not active"/"Up now" lists keep showing `onEnemy` rows too,
  now numbered the same way.

## Consequences

Two same-named mobs are now told apart, at the cost the user already accepted: a mislabelled slot
when cast order and engagement order disagree. In the common failure shape — a recast well before a
mob's mez would plausibly expire — the numbering reads it as a second mob rather than a refresh; the
new `clearInstance` control is how that gets corrected by hand rather than living with it.

The learned duration is a genuine prediction and says so (`~` in the overlay): thin on a first sample,
tightening with more, and always erring toward "sooner than shown" rather than the reverse. It is not
present at all until the spell has faded at least once this session — the board is not persisted
([ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md) covers why), though the *learned figure*
survives a restart the way `permanent`/`detrimental` already do, since it lives on the spell's stored
row rather than the board.

No migration: `slot` and the duration fields are additive, and the board itself was never persisted.
`held`, `track`, `forget`, `dismissAll`, `noteZone`, and `noteFightEnd` needed no changes at all —
every one of them already operates on the board's *values* (`.key`, `.onEnemy`, `.up`) rather than
reconstructing an id, which is what let slotting stay entirely inside `rise`/`lapse`.
