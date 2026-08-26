# 0141: A debuff is the mirror image of a buff, and a rebuff reminder waits for the fight

## Status

Accepted

## Context

[ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md) shipped the buff board, and two things about it
were wrong in play. Both are the same mistake: it treated every lapse as one kind of thing.

**The standing list filled up with corpses.** A fade line names a root or a snare wearing off a mob,
and 0140 kept those — correctly, because "re-root it" is a real reminder. But a lapse is *held* until
the buff is back, and a mob that is dead never gets re-rooted. So every debuff that ever wore off
stayed on the board for the rest of the session. An evening at a camp turns the one list you are
supposed to glance at into a wall of reminders about things that no longer exist, and a list you have
learned to ignore is worse than no list at all — it costs you the next real one.

**And the banners fired at the worst possible moment.** 0140 raised a buff lapse the instant it
happened. Mid-fight that is an interruption you can only ignore: nobody stops swinging to recast
Thistlecoat, they rebuff between pulls. Every one of those banners trains the player to dismiss the
next one, which is the same failure from the other end.

The two look like separate bugs and are one distinction never drawn: **a debuff and a buff are opposite
on both axes that matter** — how urgent the reminder is, and how long it stays true.

|  | A debuff on something you fought | One of your own buffs |
|---|---|---|
| When it matters | **Now** — a root you don't recast this second is a mob in your casters | **Between fights** — you were never going to stop swinging |
| How long it's true | Until the fight ends; then there is nothing to recast it *on* | Until the buff is back |

## Decision

**Two facts decide which kind a lapse is, and either one settles it** (`isEnemyTarget`):

- **The spell is detrimental** — the game's own file says so, and you do not root your friends. This is
  the reliable signal, and the only one that works on a **named**, whose article-less log name is
  written exactly like a player's.
- **The target carries an article** — `a wild tiger` is a mob whatever the spell was. This covers a buff
  you put on a charmed pet, and it covers everything when there is no game install to ask.

**You and your pet are never enemy targets**, whatever else is true, and that check runs *first* — so a
mislabelled spell can never sweep away the reminders this feature exists for.

**A debuff's banner fires at once; your own buff's waits for the fight to end** (`announceWhen`). Out
of combat there is nothing to wait for, so it fires immediately. What a fight *is* comes from the
damage meter's `inFight()` and nowhere else — a second opinion assembled from damage events here would
be [ADR 0036](./0036-a-fight-ends-on-death-not-a-lull.md)'s rule written twice, which is how two
panels end up disagreeing about whether you are in combat.

**Nothing about the standing on-screen list waits.** It appears the moment the buff drops and stays
until it is back. That is what makes holding the *banner* free: the quiet half is already telling you,
so the loud half can afford to pick its moment. The split is interruption versus information, and it
is the same split [ADR 0099](./0099-a-countdown-can-stay-on-screen.md) drew between a pop and a pinned
countdown.

**A fight ending does two opposite things**, which is the shape of the whole decision:

- **Waiting banners are said** — this is the moment you would have acted anyway. Except when the fight
  ended by killing **you**: everything on you went with you regardless, the list already says so under
  "you died", and a stack of "recast it" over a corpse is precisely what
  [ADR 0082](./0082-an-alert-can-be-scheduled.md)'s `cancelOnDeath` refuses. A `cut` end (a reset, a
  quit) says nothing either — that is the player's own doing, not a moment to start talking.
- **Enemy-targeted rows are dropped**, lapsed *and* up. The lapsed ones are the nagging this ADR
  exists to stop; an *up* one is a buff on a charmed pet, which would otherwise sit in "Up now"
  claiming something about a mob that is gone.

**A held banner is cancelled by anything that answers it** — the buff coming back, the row being
dismissed, the spell being unticked or cleared. A banner that arrives after the row explaining it has
gone is the app contradicting its own list.

**No duration threshold is involved, and that is deliberate.** "Long-duration buffs shouldn't interrupt
you" was the complaint, and implementing it literally would need a figure this app refuses to compute —
the duration formula needs a caster level the log will not state ([ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md),
[ADR 0080](./0080-the-game-s-own-spell-file.md)). So the question is reframed to one the log answers
outright: not *how long does this buff last* but **can you act on it right now**. Short buffs get held
too, which costs a few seconds on a reminder you would not have acted on anyway, and buys a rule with
no invented number in it.

## Consequences

- **The Buffs tab now contains debuffs, and says so.** A Root row in a tab called Buffs needs
  explaining, so the row carries a `debuff` label — which doubles as the explanation for why it
  behaves differently from everything around it, and why it will disappear on its own.
- **An honest limit, asserted rather than assumed:** with no game install, a debuff on a *named* cannot
  be told from a buff on a group-mate, because the log writes `Lord Nagafen` and `Bloop` identically
  and there is nothing left to ask. Such a row survives the fight. Keeping a row we cannot place beats
  sweeping away a reminder about a person, so this is the right way to be wrong — and ordinary mobs are
  unaffected, since the article answers those without the file.
- **`CombatTracker` gained `inFight()`** — a read of state it already owned, exposed so that "am I in
  combat" has one definition. Adding it was the smaller change: the alternative was a second fight
  boundary living in the buff tracker.
- **A held banner does not survive the process.** It is a thing the app means to say, and those have
  never been persisted here — the same line `spawn-tracker.ts` draws between a fact about the world and
  an intention. Quit mid-fight and the standing list still has everything; only the banner is lost.
- **A long fight can end with several banners at once.** Not addressed, because in practice fights end
  on a death ([ADR 0036](./0036-a-fight-ends-on-death-not-a-lull.md)) and few buffs expire inside one —
  and the case where you really do lose everything at once is a *death*, which is already silent. If it
  turns out to bite, the answer is a count rather than a stack, not a cap.
