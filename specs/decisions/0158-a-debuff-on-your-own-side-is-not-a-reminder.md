# 0158: A debuff on your own side is not a reminder

## Status

Accepted

Applies [ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md)'s rule to the **instance**
rather than to the spell.

## Context

ADR 0149 settled which debuffs get a row: only ones you were seen casting. It did not settle which
*landings* of them are reminders, and those turn out to be different questions — a shaman who roots
things also gets rooted.

    Your pet's Root spell has worn off.

is a root somebody put **on your pet**. `isEnemyTarget` puts you and your pet firmly on the *not a
mob* side, deliberately, so a mislabelled spell can never sweep away your own reminders. But "not a
mob" was then read as "one of your buffs", so this became a standing *you are missing this* and a
banner telling the player to go and fix it. There is nothing to fix — it wearing off is the good
outcome.

Forty-five of that exact line in one month of a real log, each one a false reminder, and every one of
them passing ADR 0149's gate honestly: Root **is** one of this player's spells.

## Decision

**A detrimental spell on you or your pet is dropped — no row, no standing lapse, no banner.**

- `doneToYou(spell, target)` states it, pure, beside `isEnemyTarget` so the two directions are read
  together: one asks *is this about a mob*, the other *was this done to me*. They are not opposites,
  and the gap between them is where the bug lived.
- It is asked on both the rise and the fade, on the **resolved** target, so an unnamed fade — which
  means "on you" — is caught by the same line.
- **Owning the spell is not owning the landing.** ADR 0149 asks who can cast it; this asks which way
  it was pointed. A player can pass the first and fail the second, and that combination is the whole
  of this decision.

## Consequences

Sixty spurious banners disappear from the measured log, and the standing list stops holding
reminders about debuffs that were never the player's to maintain.

**`isEnemyTarget` is unchanged.** It is right about what it answers, and narrowing it to make this
work would have put your own buffs at the mercy of a mislabelled spell file — the exact failure its
first check exists to prevent.

**A debuff on a group-mate is still kept.** They are not you and not your pet, and a shaman whose
slow fell off the tank wants to know. Only your own side is silent.
