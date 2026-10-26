# 0339: A spell nobody cast is a proc

## Status

Accepted

## Context

The loadout planner now predicts procs a minute from DEX
([ADR 0337](./0337-a-weapon-is-weighed-by-what-it-hits-for-in-its-hand.md),
[ADR 0338](./0338-haste-and-proc-damage-are-part-of-a-swing.md)). The damage meter couldn't say how
often anyone actually procs. EQ Legends writes no proc message. A proc lands exactly as a cast spell
does:

    Astah hit Master Brewer for 48 points of magic damage by Reaving Strike.
    You hit a coyote for 12 points of cold damage by Blast of Cold.

The difference is the line before. A cast is announced with "begins casting"; a proc never is. On the
real 960,000-line log, the spell hits whose attacker never cast that spell were exactly the procs:
- weapon procs: Reaving Strike, Smiting Strike, Condemnation of Nife
- warder procs: Spirit of Lightning Strike, Spirit of Blizzard Strike
- mob specials: Lava Breath, Plague Rat Disease

No nuke anyone cast landed in that set.

The tracker already counts Spell Blade's "free casts". That count takes the opposite clause: a landing
with nothing in flight, of a spell you *do* cast.

## Decision

**A spell hit whose attacker was never seen casting that spell is that attacker's proc.**

- `proc-spotter.ts` remembers who has cast what, for anyone, kept across meter resets. It's fed
  before the fight scope, like DoT attribution, because a cast outside your fight still proves who
  casts that spell. Swings, damage shields and DoT ticks are never procs.
- The tracker counts each combatant's procs by spell, plus their melee swings. Each meter row
  carries `procs` and `swings`. Both are optional, so stored fights from before this still read.
- The proc counts sit beside the spell split, not in it, the way qualifiers do. A proc is already in
  Spell → its name, so a separate level would count it twice.
- In the Dealers view, the meter shows a "procs N/min" line: procs per minute of fighting, the
  planner's unit, and each spell's share of swings.

## Consequences

- You can now set a weapon's planned procs a minute next to the meter's figure. They measure
  different things: the meter counts every proc you have, weapon and buff alike.
- A spell its attacker also casts never counts as a proc. The main case is a buff that procs a spell
  of its own name, such as Vampiric Embrace. Your own unpaired landings of a spell you cast stay
  free casts.
- A group-mate's nuke whose cast line was out of log range counts as their proc until a cast of it
  is seen. A landing seen before its first cast counts as a proc too.
- A mob's castless special, like a dragon's breath, counts as its proc. That is the same
  observation, and the meter doesn't separate it out.
