# 0200: Your own damage shield is yours, read the way "your" already is

## Status

Accepted

## Context

[ADR 0095](./0095-your-own-dot-tick-is-yours.md) fixed the identical first-person gap for a DoT tick
and named its unfixed twin explicitly: a damage shield has the same asymmetry, one line shape along.

```
A pledge familiar is pierced by Kainos`s warder's thorns for 6 points of non-melee damage.  ← the pet's, read
A wild tiger is pierced by YOUR thorns for 1 point of non-melee damage.                     ← your own, unread
```

`SHIELD_RE` binds on the `'s` possessive a pet's or a group-mate's shield carries. Your own shield has
no possessive at all — EQ writes it `by YOUR <word>`, capitalized — so the pattern never matched and
the line fell to the unparsed pile, silently. The log ADR 0095 measured put a number on it: **907
lines, 1,576 damage** (thorns 1,034, flames 542) — small next to the DoT ticks, and real.

A second, unrelated bug turned up while tracing the fix: `electron/combat-stats.ts` sets `lastLanding`
— the "what did you just land, and when" state the invocation-heal credit and the free-cast detector
both read — off *any* non-tick spell damage from an attacker who is yours, without excluding a
shield. A shield's flavour word ("flames"/"thorns") rides in `event.spell` exactly like a real spell's
name (the same fact ADR 0130-era code already guards against in the Spells table and the scoreboard),
so an unattributed self-heal landing within `INVOCATION_HEAL_MS` of a shield tick credited the
invocation's healing to "flames" as though it were a spell you cast — a phantom row reached through a
different door than the one already guarded.

## Decision

**A shield with no possessive is still a shield, told apart by "YOUR" rather than `'s`.** A second
pattern, `SHIELD_SELF_RE`, reads `by YOUR <source>` and is tried after `SHIELD_RE` so a pet's or a
group-mate's shield is never mistakenly re-read as yours. `combatant()` already folds `you`/`your` to
`SELF`; the match hands `"your"` in as the attacker group so the existing `combatant()`/`damage()`
plumbing needs no new branch, the same shape `DOT_MINE_RE` uses for a DoT's own "your" form.

**`lastLanding` excludes a shield, the same way the Spells table and the scoreboard already do.** The
assignment now carries `!event.shield`, so a shield tick can still register as the biggest hit it is,
but never becomes the thing an invocation-heal or a free-cast check believes was just cast.

## Consequences

A character who wears a shield now has that damage counted at all — previously silent, matching the
same "your own" gap ADR 0095 closed for DoTs. It joins the combatant row's `dealt` and the damage
cells exactly as a pet's or a group-mate's shield already did; it still does not join the Spells
table, since a shield is never cast (`!event.shield` there is unchanged).

The `lastLanding` fix has no user-visible change for a shield alone — it only stops a coincidence (a
shield tick immediately followed by an unattributed self-heal) from mislabeling that heal. Forward
only, the same rule ADR 0095 states for stored fights: a fight already on disk keeps the figures it
was written with.

Removed from [todo.md](../todo.md): "Your own damage shield is unread."
