# 0092: A named's respawn is learned from your own kills

## Status

Accepted

## Context

We already know when a named died, where, and how confidently
([ADR 0022](./0022-invocation-effects-and-kill-locations.md),
[ADR 0023](./0023-kill-heatmap.md)) — and then throw the one number a camper actually wants away.
The gap between two of your kills of the same named **is** its respawn timer, measured on this
server and this build, which is the argument
[ADR 0025](./0025-observation-over-the-wiki.md) already makes about drop rates. `observeMobs` rolls
kills up into counts and drops the interval on the floor.

Timers themselves are not new: [ADR 0082](./0082-an-alert-can-be-scheduled.md) made a watch able to
wait, and explicitly listed "a placeholder died, it's back in 8 minutes" as one of the two things it
was for. That mechanism cannot carry a named's respawn, for three reasons that are all deliberate
properties of it rather than oversights:

- `MAX_DELAY_SECONDS` **caps a cue at 30 minutes**, and clamps rather than refuses past it. A named
  on a six-hour timer would silently alert at thirty.
- `alert-queue.ts` holds cues **in memory, on an unref'd `setTimeout`**, so every one of them dies
  when the app does. That is correct for "recast the mez" and useless for a timer measured in hours.
- A cue is armed by a **watch matching a line you typed a rule for**. A camper does not want to hand
  author a rule per named.

The distinction that resolves it: a cue holds an **alert** — something the app means to say — while
a spawn timer holds a **fact about the world**, that a mob is due at a particular time. Facts
survive a restart; a thing the app meant to say does not have to.

EQBuddy solved this first and split it across three files worth reading together (`SpawnTimers.cs`,
`SpawnCatalog.cs` for the shipped seed, `SpawnOverrides.cs` for what a player typed). The rule its
overrides file exists to protect — **nothing may overwrite a hand-typed value** — is the one we take
verbatim.

One obstacle is ours alone. The only signal a log line offers for "this is a named" is the **absence
of an article**: `a gnoll pup` is a spawn, `Lord Nagafen` is a named. `cast-alerts.ts` already leans
on exactly this and says so (`isNamedCaster`, "the only player-vs-mob signal a single cast line
offers"). But `parseKill` calls `stripArticle` on its target before anything downstream sees it
([log-parser.ts](../../src/shared/log-parser.ts)), so `KillRecord.mob` reads `gnoll pup` and the
signal is gone by the time it reaches storage. Every kill already on file has lost it.

## Decision

**A named is recognised by its article, and the article is captured where it still exists.**
`parseKill` computes `named` before it strips, `KillEvent` and `KillRecord` carry it, and the test
itself is one exported function shared with `cast-alerts.ts` rather than a second regex that can
drift from the first.

**Named-ness is a property of the mob, learned once and remembered.** One kill carrying the article
— or the player saying so outright — settles it for that name, and *every kill of it already on
file* becomes evidence about its interval retroactively. This is what makes the missing flag on old
records a delay rather than a loss: kill a named once after this ships and its whole history is
readable. A record whose flag is simply absent is **unknown, not plain**, and starts nothing.

**And the victim's article is only half of it.** The log reports every death in earshot, and a
player, a pet and a boss are all written *without* an article — so `Bunnyslayer has been slain by a
froglok shaman!` is the same shape as `Lord Nagafen has been slain by Kainos!`. What separates them
is the **killer**: a person kills a named, a mob kills a player or a pet. So `killerNamed` is read
at parse time beside `named` (it is destroyed by the same `stripArticle`), and a kill only proves a
named when both hold. Found by replaying an evening rather than by reasoning — see the flow tests;
without it a busy dungeon fills the board with every death that happened near you.

The residue is PvP, where both names lack an article and a player death would read as a named. Rare
on this server, correctable in one click, and not worth a second signal.

Rejected: **guessing the article back from capitalisation.** `Lord Nagafen` keeps its capital and
`gnoll pup` doesn't, so it looks like free recovery of the whole existing corpus — but EQ writes
plenty of ordinary spawns as `an Iksar Warrior`, which strips to a capital and would file a trash
mob as a named forever. A wrong named is a countdown that never comes true, and the honest
alternative costs one kill.

**The interval is the shortest gap ever seen, never the average.** You cannot kill a mob before it
spawns, so every gap you observe is an *upper* bound on the true respawn — you arrived late by an
unknown amount. The shortest is therefore the tightest true bound, and a longer one carries no
information whatever. An average of "when I happened to show up" describes your evening, not the
mob.

This makes the estimate a **ratchet: it only ever falls.** That is the same claim
[ADR 0031](./0031-an-inferred-bound-must-be-able-to-fall.md) makes about an inferred bound, and it
comes with the same obligation to provide a way down — which here is the hand-typed value and a
per-mob "forget what you learned", because no amount of further observation can widen a number that
only shrinks.

**A hand-typed interval is never overwritten, and never destroys what was learned.** It wins over
the observed figure and observation may not touch it, but the learned number is kept *alongside*
rather than replaced, so clearing an override restores it instead of leaving nothing. Same shape as
[ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md).

**A gap outside plausible bounds is discarded, not clamped.** Two kills of one name twenty seconds
apart are two mobs sharing a name, not a twenty-second respawn; a gap of four days is you not being
there. Both are rejected outright — clamping would invent a number, and against a ratchet that only
falls an invented *short* number is permanent. Gaps only count between kills **in the same place**
([ADR 0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md) decides what "same" means).

**A gap that spans a difficulty change is thrown out.** Changing the instance difficulty **respawns
everything**, so the mob that came back did so because the world was rebuilt, not because its timer
elapsed. That is the one error this whole design cannot survive: every other distortion makes a gap
*longer* — which the shortest-gap rule simply ignores — while this one makes it arbitrarily
**shorter**, and a bound that only falls can never recover from that.

The log reports a difficulty change as arriving in a different **variant** of the zone you were
already in, and `timerKey` deliberately folds those variants into one camp
([ADR 0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)) — Lower Guk is Lower Guk. So
the raw zone is carried as far as the gap and compared **verbatim** there: same place, different
string, no measurement. `kill-log.ts` already makes this exact exception for which `/loc` fix may
place a kill ([ADR 0059](./0059-a-zone-s-variants-are-one-zone.md)), and for the same reason.

Kills either side still teach *within* each difficulty; only the gap across the change is lost.

A **running countdown** for that place is dropped when it happens, since it is measuring from a
death the world has undone. It is not turned into "it's up": everything repopping means the *spawn
point* filled, and whether the named or its placeholder took it is exactly the guess this feature
refuses to make.

**Every kill in your own log tightens a timer, including a bystander's.**
[ADR 0027](./0027-only-your-kills-count.md) rules a stranger's kill out of *drop rates* because you
never had the corpse — but a mob dying is evidence of when it died whoever swung, which is what
`KillRecord.sharedBy` already says about shared kills. This looks like an inconsistency and is a
deliberate difference: the two questions need different evidence.

A **peer's** shared kill is the exception, and does not tighten anything. Their clock is not yours,
and against a rule that only ever shrinks a single skewed timestamp is a permanent wrong answer that
only a hand-typed value can undo. Evidence that can't be withdrawn has to be evidence you can't be
wrong about.

**A timer is a due time, not a countdown.** What is stored is `dueAt`; remaining seconds are derived
wherever they're shown. That is what lets it survive a restart, a zone change, and an app that was
closed for the whole respawn — and it is why this is a small persisted store rather than an entry in
`alert-queue.ts`.

**A pop that already happened is never alerted retroactively.** On startup an overdue timer is shown
as due, not fired: an alert for something that happened three hours ago is the precise opposite of
what an overlay is for. It ages out after a grace period, because a named you didn't come back for
is not news.

**The pop itself is an ordinary alert.** It carries a new `event: "spawn"` so the banner can word
itself, and is raised down the same path as every other, inheriting its colour, sound, position and
wording rather than growing a second notification system.

## Consequences

- A camper gets what they came for: kill a named twice and the app knows its timer, on this build,
  without anyone editing a table. The number improves the more you camp, which is the shape every
  other observed figure here already has.
- **The estimate is an upper bound and must be shown as one.** "At most 22 minutes, from 3 kills"
  is the honest sentence; "22 minutes" is not. Sample count travels with the figure exactly as it
  does for drop rates ([ADR 0024](./0024-mob-knowledge.md)).
- Timers are visible in their own tab. That is a **ninth** entry in a bar where six fit at the
  default width, and `TabBar` collapses from the end — so it sits next to Hunt, which is the tool it
  belongs with, rather than after Settings where it would be less reachable than not having shipped.
- Two timer mechanisms now exist, and the split has to be explicable or it will be merged by someone
  later: `alert-queue.ts` holds a **thing the app means to say**, briefly and in memory;
  `spawn-tracker.ts` holds a **fact about the world**, persisted and uncapped. They meet at `raise`.
- A named that shares its name across two zones is two timers, which is right, and a named with two
  spawn points in one zone is one timer, which is wrong and is the same limitation
  [ADR 0024](./0024-mob-knowledge.md) already records about two mobs sharing a name in a zone.
- **The difficulty is a fact about the world that only the zone line reveals**, so anything else
  learned from timing is exposed to it too. This is the second place a folded zone name had to be
  un-folded to stay correct, which is worth remembering as a pattern rather than a one-off.
- **A player dying near you is not a camp.** The killer's article is what says so, and it fixes your
  own pet's death by the same rule — which the kill log otherwise only catches once it knows your
  character's name.
- Nothing seeds a timer before your first two kills. The wiki figure the todo hoped for is absent
  far more often than not, and the Project Quarm baseline that would fill the gap is still an open
  question in this file — so the honest first version learns from scratch and says so.
