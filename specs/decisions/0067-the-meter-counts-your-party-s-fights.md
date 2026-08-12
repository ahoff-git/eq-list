# 0067: The damage meter counts your party's fights, not the camp's

## Status

Accepted

## Context

EQ logs every swing in earshot, not every swing that's yours. At a shared camp — a dungeon
corridor, a contested spawn, anywhere two groups are in a room — the log carries other
people's fights: another group's pull, a guard killing a wanderer, a passing player soloing
something. The tracker admitted all of it.

Everything on the Damage tab is affected, and not by a constant factor:

- **Rows for combatants you never fought.** Strangers and their pets appear as dealers; mobs
  you never touched appear as targets. The "Dealers" view — already the wrong first question
  ([ADR 0053](./0053-damage-is-cells-rolled-up.md)) — becomes a list of the zone.
- **Every share moves.** "All damage" is the denominator the panel's percentages are taken
  against, so a stranger's fight silently shrinks your share of your own.
- **Fight boundaries move.** A fight is delimited by swings in log time
  ([ADR 0036](./0036-a-fight-ends-on-death-not-a-lull.md)). Somebody else's swing during your
  lull keeps your fight open; their fight during your downtime starts one that is nobody's.
- **The session counters and the per-mob table move.** A death across the camp was counted as
  a kill, with a time-to-kill measured from *your* fight, and it landed in the per-mob table
  that answers "is this camp worth it".

[ADR 0027](./0027-only-your-kills-count.md) settled the same question for the kill log and
found 13.6% of a real log's kill lines were somebody else's. Nothing was ever done for damage.

The obstacle is that the log never states a side, and — worse — never states a **roster**. It
announces group *changes*, so membership can only be assembled from the moment we start
reading; a group formed before the app started announces nothing at all. Any design that needs
the roster to be complete before it can meter a group is a design that fails at exactly the
moment people use it.

## Decision

**The unit of filtering is the fight, not the combatant: your side, and whatever your side is
fighting.** A fight nobody of yours is in never starts; a fight one of yours is in is metered
whole, including the parts that involve strangers.

- **`src/shared/party.ts`** — who's grouped with you, folded from `parseParty` lines
  (`log-parser.ts`): joins, leaves, removals, disbands, and — deliberately — **group chat**.
  Chat is the only evidence a *standing* group ever produces, and "Bunnyslayer tells the group"
  is a statement of membership. A group-mate's pet is the group-mate, as your own is you
  (`isTheirs`). First spelling wins, as everywhere else a name is remembered.
- **`src/shared/fight-scope.ts`** — the gate, applied to every combat event exactly **once**,
  before anything else, so the fight window and the session window can't disagree about what
  happened. Your side is you, your pet, your group-mates and theirs. Anything your side trades
  blows with joins the fight as an **enemy**, and from then on its lines count too, whoever
  they involve — a mob's damage on a group-mate we hadn't yet recognized, a passer-by who
  helps kill your mob, the mob's own healer. That's what "the fight, whole" means: dropping it
  would understate what a fight cost as surely as admitting strangers overstates it.
- **Only the near-certain direction is used.** `damage-tree.ts` settles sides over a finished
  set of cells, in passes, and can afford to lean ("an enemy hit it, so it's probably an
  ally"). This runs live, once per line, and an event admitted is tallied for good — so only
  "an ally swung at it, therefore it's an enemy" is used. Same idea, different confidence, on
  purpose.
- **The enemy set is per fight.** Who we fought last pull says nothing about this one, and left
  to accumulate, a night's mob names would admit half the zone. It's cleared *before* the first
  swing of a new fight is judged, so that swing has to stand on its own.
- **Kills are scoped the same way**: `combat-stats` counts a kill only for a mob your side
  fought. **The kill log is not** — where a mob died is worth knowing whoever killed it, which
  is [ADR 0027](./0027-only-your-kills-count.md)'s existing judgement and still the right one.
  Experience, coin and sales are unfiltered because the log only ever writes them for you.
- **It degrades, rather than failing, when the roster is unknown.** Start the app mid-camp and
  nothing has announced your group — but everyone in it is hitting the mob you're hitting, so
  the enemy set admits them anyway. The roster is what additionally covers a group-mate's pull
  you never touched. This is why membership is *evidence*, never authority: `has` returning
  false means "not known to be", never "isn't".
- **With no character name, nothing is filtered.** Sides can't be told apart without knowing
  who you are, so the gate admits everything — the same call `damage-tree.ts` makes when no
  ally appears in the cells. In the app the name always arrives (it's in the log's filename).
- **Always on, with no setting.** A meter with a truth switch is two meters, and the numbers
  people compare would depend on which one was on.
- The roster **survives a meter reset** (clearing the meter doesn't disband your group, and
  re-learning it would take until the next person joined, left or spoke) but is **cleared when
  the character changes**, and by any line meaning "the group you were in is no longer the
  group you're in" — disbanded, removed, you left, you joined a fresh one.
- An eaten log goes through the same gate, party lines and all
  ([ADR 0055](./0055-eating-a-log-fills-history.md)), so an imported evening is scoped the way
  it would have been had the app been running.

Rejected alternatives:

- **Party members only — drop any line neither side of which is yours.** The strictest reading
  of the request, and the one that breaks in the common case: with the roster unknown, a group
  meter shows one row. It also drops the mob's damage *on* the group, which is half of what a
  fight cost.
- **Reuse `enemiesIn` from `damage-tree.ts` at snapshot time.** It's the better inference, but
  the tallies (spells, per-mob, buckets, deaths, fight boundaries) are accumulated eagerly as
  events arrive; filtering only at snapshot would leave the meter and its own drill-downs
  disagreeing.
- **Name-shaped guessing at who's a player.** Rejected before, with evidence: `Bonefire` and
  `Marrowbane` are mobs we killed ([ADR 0053](./0053-damage-is-cells-rolled-up.md)).

## Consequences

The Damage tab is about your group and its mobs. Rows you never fought are gone, "All damage"
is a denominator you were part of, and a quiet stretch is no longer punctuated by fights that
were never yours.

The known limits, in order of how often they'll be met:

- **Mob names are generic, so a fight admits any mob of the same name.** While you're fighting
  "a coyote", a stranger's coyote is inside your fight. The whole app already conflates
  identical names into one row ([ADR 0027](./0027-only-your-kills-count.md)'s registry), and no
  log line distinguishes two coyotes — so this is the existing conflation, not a new one, and
  it's bounded by the fight rather than the session.
- **A group-mate's pull you never touch isn't counted until we know they're grouped.** Split
  the group across two camps before anyone speaks and the far half is invisible. One group-chat
  line fixes it.
- **The wordings are unverified on this server.** Only the invite line ("Bunnyslayer invites
  you to join a group.") has been seen in a real EQL log; the rest are classic-EQ shapes. A
  wording we don't match costs the roster, not the meter — the enemy set still carries the
  common case — but it's the first thing to check in game, and it's on the
  [manual QA checklist](../testing/manual-qa.md).
- **Stored history changes meaning at this build.** Fights recorded before it kept whatever the
  camp was doing; there's no replay to re-scope them ([ADR 0021](./0021-stored-fights-keep-their-source.md)).
- **A charmed pet is still whichever side it's fighting for**, as in
  [ADR 0053](./0053-damage-is-cells-rolled-up.md) — and the moment it charms, the log says
  nothing, so it stays where the last swing put it.
