# 0290: A debuff's duration can be typed

## Status

Accepted

## Context

[ADR 0289](./0289-a-debuff-counts-down-from-the-file-s-ceiling.md) counts a debuff down from the
spell file's tick cap. In play the countdown read too short. The cause is **rank**. EQL casts ranked
spells (`Bunnyslayer begins casting Mesmerization IV.`), but `spells_us.txt` holds no ranked rows for
them, only the base `Mesmerization` at 4 ticks (24s). The server scales a ranked spell's duration,
and nothing in the file or the log states by how much. The player's own learned figures agree that
24s is short: Mesmerization's longest confirmed hold was 42s across 255 fades.

The eql-alerts neighbour ([neighbours.md](../neighbours.md)) scales "unranked base × roman rank".
That is one project's unverified guess. Building it in would swap one confidently wrong number for
another.

## Decision

**The player can type how long a debuff lasts**, per spell, from the Buffs tab. The control is a
⏱ button on a debuff's row, using the same `SecondsField` the spawn board uses for a claimed respawn.
To share it, the field moved out of `SpawnPanel` into its own component. The value is stored as
`customDurationSeconds` on the spell's row.

**A typed figure outranks everything** in `debuffCountdown` (`basis: "custom"`). It outranks the
learned figure and the file's ceiling, because it is the only one of the three that can know the
rank. The overlay shows it with no hedge symbol, since it is the player's own claim. Clearing it
falls back to ADR 0289's order.

The ceiling stays as the default. It is right for unranked spells, and it is a sensible starting
figure for ranked ones.

## Consequences

A player running a ranked mez types its real duration once, and every countdown and urgency colour
afterwards uses it.

The figure belongs to the spell, not to the rank. `Mesmerization` and `Mesmerization IV` fold to one
row (`buffKey` drops the rank), so a player who casts two ranks of the same spell shares one figure
between them. That is rare in practice, and splitting rows by rank would change how every buff is
keyed.

If a reliable rank-scaling rule is ever confirmed against real logs, it could replace the typed
figure as the default. Until then, the player's number is the honest source.
