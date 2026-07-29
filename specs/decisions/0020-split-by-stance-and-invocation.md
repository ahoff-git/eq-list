# 0020: Split every tally by stance and invocation

## Status
Accepted

## Context
EQ Legends has two combat modes the player switches between: a **stance** (melee) and an
**invocation** (casting). Both apply multipliers and both change cast times. That makes
every figure the damage meter produces conditional on which was active — and the meter
was averaging straight across them.

The size of the error, measured on a real log:

```
Shock of Lightning  —  blended: 52 casts, 1.46s, 62.9 dmg/s cast
    empowering        15 casts   1.57s   127 dmg/cast   81.0/s
    arcane mastery    22 casts   1.36s    90 dmg/cast   66.1/s
    divine            10 casts   1.83s    56 dmg/cast   30.5/s
```

Under one invocation the same spell hits for **2.3× what it does under another**, and is
also faster. The blended figure describes no configuration the character was ever in, so
"which spell is efficient" can't be answered from it — the answer changes with the
invocation, which is exactly the decision the player is making.

The log announces a change and then names the result, and only the naming line is usable:

```
You begin to change your stance.        ← no idea which
You assume an evasive stance.           ← this one
You begin to change your invocation.    ← no idea which
You begin reciting the empowering invocation.   ← this one
```

## Decision
**Tally internally per mode; present combined; expose the split on hover.**

- Two new events, `stance` and `invocation`, parsed from the *naming* lines. The names
  aren't enumerated — the pattern takes whatever the log says, which is how "recovery" and
  "spellblade" appeared in real data without a code change.
- The tracker holds the current stance and invocation and files every tally under whichever
  was active: **spells by invocation**, **your melee by stance**. `SpellStat.byInvocation`
  and `CombatantStat.byStance` carry the breakdown, including per-mode cast time and
  damage-per-cast.
- **Top-level rows stay the blend.** That's what you want at a glance, and it keeps the
  table narrow; the split appears on hover, and only when more than one mode contributed
  (under a single mode the row already *is* the answer).
- Modes are **not session state** and survive a reset — they describe what the character is
  doing right now, not something being counted.
- Before the log has named a mode, tallies file under **"unknown"** rather than being
  dropped or silently merged into whichever mode comes first.
- Other people's melee is **not** split: the log never states their stance, and inventing an
  "unknown" bucket for every group member would be noise.

Rejected alternatives:
- **Averaging across modes and moving on** — the status quo, and the numbers above are why
  it doesn't work.
- **Splitting the rows by default in the table.** Real logs show up to six invocations for
  one spell; six rows per spell is unreadable at a glance. A setting to split by default is
  noted in the todo — the data is already there, it's purely presentation.
- **Enumerating the known stances/invocations.** The log names them; a hardcoded list would
  have missed two of the six that turned up in one evening's play.
- **Keying only spells and leaving melee blended** — stances change melee multipliers, so
  the same argument applies with the same force.

## Consequences
- Cast times and damage-per-cast are now comparable, because they're comparable *within* a
  mode. The blended row is still there, and still the fastest thing to read.
- A spell cast under several invocations shows the interesting variance on hover, which is
  where the actual tuning decision lives.
- One more axis in the data: `SpellStat` and `CombatantStat` each carry a per-mode array.
  Stored fights carry it too, so a past fight can be broken down the same way.
- The "unknown" bucket appears until the first mode line — usually only at app start, since
  a change gets announced the first time the player switches.
- A proc or damage shield has no cast, so its per-mode entries show damage with no casts.
  That's honest (the shield fired while that invocation was up) but the mode is incidental.
