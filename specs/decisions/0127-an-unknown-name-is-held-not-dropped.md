# 0127: An unknown name is held, not dropped

## Status
Accepted

## Context
0077 got the rule right and the consequence wrong. Its own doc admits the outcome — a named pet's
damage "went missing rather than landing on the wrong row" — and treats that as the acceptable price
of not guessing. It is a third option presented as the only alternative to guessing, and it is a
decision to be wrong in a quieter direction.

The log is not a stream to be judged once. It is a record in which a name that means nothing at
21:12 is proven to be your pet at 21:18, and every line in between was always about your pet — we
simply hadn't been told yet. Discarding those lines throws away data whose meaning arrives later,
and there is no clean, safe way to assume our way past that. So hold it.

**Measured stakes**, from one magician's 26 MB / 315,601-line log. A summon generates a fresh name
every time, so 34 pets in three weeks, each blind from 15 seconds to 5½ minutes:

| | blind (today) | with every pet known up front | recoverable |
|---|---|---|---|
| `totalDealt` | 2,144,142 | 2,144,788 | **646** (0.03%) |
| `yourDealt` | 1,517,776 | 1,523,384 | **5,608** (0.4%) |
| `yourTaken` | 292,286 | 294,413 | **2,127** (0.7%) |

Small in aggregate, concentrated where it shows: **26 fights**, and for four pets the damage before
the proof *exceeded* the damage after it (`Xebeker` 671 against 201; `Vobtik` 519 against 79).

Two things in that table decide how this gets built, and both are the opposite of what the obvious
reading suggests.

**The data is already held, nearly everywhere.** `totalDealt` is only 646 short — 0.03% — because
the scope usually admits a pet's line anyway: you had already engaged the mob, so the mob is an
enemy and the line rides in on the fight. Rows and damage cells are keyed by **name**, and
`mine` is evaluated at `summarize` time, not at record time. So the meter is *already* doing this,
for its two biggest consumers, and has been all along. The 5,608 is almost entirely a **timing**
problem, not a discarding one: those fights were summarized before the proof landed.

**A holding pen alone would recover nothing.** Every one of the 26 fights had already been filed by
the time its pet was proven. Even in the pre-[0126](./0126-a-fight-is-filed-when-it-ends.md) world,
where a fight waited for the next pull, only **4 of 26** (1,003 damage of 5,283, 19%) were still
open. Build the buffer first and it drains into fights nobody can change.

## Decision
**A name we cannot yet place — player, pet, or mob — has its data *held loosely* until something in
the log decides, and is then processed as whatever it turned out to be.** Not guessed, and not
discarded either. "Unproven" is a statement about what we know, not about the data.

[ADR 0077](./0077-a-pet-is-proven-not-guessed.md) stands unchanged: identity comes from proof, never
from the shape of a name. What changes is the disposal of everything that arrives *before* the proof.

## Consequences
So the work has an order, and it is not the order the idea suggests:

1. **Re-deriving a stored fight is the gate. Built** —
   [ADR 0128](./0128-a-fight-is-re-derived-not-refused.md). Without it, 81–100% of the mass is
   unreachable no matter what the live path does; with it, re-reading the measured log with every
   pet's identity known refreshes 1,000 stored fights and puts 3,906 damage into them. Its two open
   problems — a fight whose log file is gone, and idempotency against
   [ADR 0033](./0033-eating-a-log-is-idempotent.md)'s keying — are settled there.
2. **Attribution becomes a read-time question everywhere, not just for rows.** `mine` is already
   read-time at [combat-stats.ts:558](../../electron/combat-stats.ts); it is baked at record time in
   seven other places — the per-second sparkline (`w.bucket`), the per-spell table, the per-invocation
   proc tallies, the incoming-damage buffer behind a death recap, the cast repertoire, the pending
   cast, and `lastLanding`. Those are the places where one fight currently contradicts itself: a
   proven pet's damage shows on its row and in the drill-down (both off the cells) and is absent from
   the Spells tab and the sparkline (both baked). One question, two answers, which is the failure
   this codebase guards against elsewhere by construction. The shape: tally an undecided name into a
   **held** side-tally keyed by that name, and merge it in the moment the name is decided — literally
   hold, then process. Bounded, because only ambiguous names get one.
3. **Then the scope stops dropping.** `admits` returns a boolean and the doc says why: it "runs live,
   once per line, with no way back: an event admitted is tallied for good", which is exactly why it
   uses only the near-certain direction while `damage-tree.ts` — working over a finished set of cells,
   in passes — can afford to lean. Once (1) and (2) exist there *is* a way back, and that
   justification weakens: the third value is `hold`, and expiry of a held event means drop, so this
   degrades to today's behaviour rather than risking anything new.

**What decides a name**, since a holding pen with no decision procedure never drains. Every one of
these was checked against the log rather than assumed:

- `<Pet> told you, 'Attacking <mob> Master.'` — 242 lines. 0077's proof; a private channel.
- `<Pet> says, 'Sorry, Master... calming down.'` — 138 lines, every name among the already-proven
  pets, none from the group's other pet classes. Same class of proof, and worth having once there is
  somewhere to put it — though on this log it would have shortened exactly one blind window.
- A party join, or group chat — `party.ts` already reads these, but only forwards.
- An **article** on the name makes it a mob (`hasArticle`), which the app already relies on.
- **Negative deciders, which a holding pen needs as much as positive ones**: a name that talks in a
  chat channel (`tells General:2`) is a player, and a pet cannot. That is what lets the pen discard
  rather than hold to expiry.
- **Not proof**: `<Name> was partially successful in capturing <mob>'s attention.` — 1,242 lines, and
  442 of them name `Bunnyslayer`, a *player* in the group. A taunt is a taunt whoever throws it, and
  reading it as ownership is precisely 0077's mistake in new clothes.
- **Proof of a pet, but nameless**: `Captured <mob>'s attention, Master!` and `Failed to capture
  <mob>'s attention, Master.` — 1,635 lines, unambiguously addressed to an owner and naming no pet.
- **Rejected**: correlating the summon (`You begin casting Elemental: Water.` three seconds before
  `Konn slashes a gnoll scout`) with the next unrecognised combatant. It is an inference dressed as
  evidence, and holding the data until something states the answer is strictly better than inferring
  one — which is the whole point of this decision.
