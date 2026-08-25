# 0140: A buff is watched until it lapses, and the game's own words name it

## Status

Accepted

## Decision

**Track every buff cast on you or by you until it lapses, and say so — as a banner and as a standing
message that stays until the buff is back.**

Six things follow, and each is a decision rather than an implementation detail.

**Read `spells_us_str.txt`, for the sentences the log won't name.** The file ships beside
`spells_us.txt` ([ADR 0080](./0080-the-game-s-own-spell-file.md)), holds `CASTEDMETXT`,
`CASTEDOTHERTXT` and `SPELLGONE` per spell, and keys them by the id we already parse. Its header names
its own six columns, so unlike its sibling there is no stability rule to write. Read lazily and
separately from the facts file: a session that watches buffs and never opens the meter should not read
38 MB, and one that does the reverse should not read 5 MB.

**A sentence resolves to candidates, never to a spell.** Measured on a live install: 422 distinct fade
sentences among obtainable beneficial spells, **272 of them shared by more than one**. `Shield of
Thistles` (Druid 7) and `Shield of Thorns` (Druid 47) share both their landing line and `The brambles
fall away.` So a lookup returns a list, and two things outside the file narrow it — in order of how
much they prove: **one candidate is already up** (we watched it land), then **you were just seen
casting one**. Where neither decides, the row and the banner name every candidate. EQBuddy reached the
same conclusion hand-maintaining the same mapping (`FadeMessageCatalog.cs`), and this is
**eql-alerts**' emote gate turned round — they narrow a shared *landing* by your own cast, we narrow a
shared *fade* by what we already watched land. Their v0.1.29 lesson is taken whole: a pending cast is
**withdrawn** on a fizzle, interrupt or resist, not left to expire.

**The index is gated to obtainable, beneficial spells.** ~7k rows out of ~74k. Both halves earn their
place: ungated, the file's NPC and out-of-era tiers would hand a player's own sentence to a spell
nobody here can cast — the collision ADR 0080 already solved for mana costs, in the same file, for the
same reason — and a detrimental spell's landing is a *debuff*, which the existing fade watches already
cover. `The thorns fall away.` is therefore deliberately unclaimed: it belongs to a Thorns no class
here can cast, and the druid line uses Thistlecoat and Thorncoat instead.

**A lapse is a state, not an event.** A banner answers "what just happened" and goes away; the useful
fact about a buff is that *right now* you are without it. So a lapse is held — on the panel and, opt-in
per spell, over the game — until you recast the spell or stand it down.

**Your death lapses your buffs quietly.** Dying strips everything on you at once, and a dozen banners
is not a dozen pieces of news. The lapses are recorded, because "what do I need re-buffed" is the
question a corpse actually has; the banners are suppressed. Same reasoning as
[ADR 0082](./0082-an-alert-can-be-scheduled.md)'s `cancelOnDeath`: "recast it" is noise from a corpse.
Buffs you put on *other people* survive your death, and the log reports those with its own fade lines.

**Read the duration formula's id, and nothing else about duration.** Index 11 says which formula, index
12 its figure; both sit inside the 0–102 range ADR 0080 calls never-moved. Computing a duration is
still refused for the reasons that ADR gave — the formula table is server-side logic and the only
implementations are EQEmu's classic-era ones — and now for a second reason it did not have to state:
the caster level a formula needs is one **this log will not give us**, since EQL's levels are per class
and its level line names none ([ideas.md](../ideas.md)). But asking the formula one yes/no question
needs no arithmetic and no level, and answers something EQL players are bitten by daily. So
`SpellFacts.permanent` is read, and **no countdown is shown anywhere**.

**Two controls, two different promises.** **Uncheck** is the durable "never mention this again" and
*keeps the row*; **clear** forgets the row, which returns if the spell is cast again. Deleting to
silence is the mistake [ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) had to
correct for dismissed mobs — a dismissal you can't see is one you can't undo.

## Context

The log answers "is my Thistlecoat still on?" and nothing collected the answer.

A buff **ending** was already well served. [log-watching](../log-watching/README.md) measured all three
shapes on a real 15 MB log, and two name the spell outright — `Your Thorns spell has worn off of
Bloop.` (134 lines) and `Your pet's Burst of Strength spell has worn off.` (63). The third is the
majority and names nothing: `The spirit of wolf leaves you.`, 248 lines of per-spell flavour text.
[cast-alerts.ts](../../src/shared/cast-alerts.ts) recorded that as an honest limit — and it was a
**missing input**, not a property of the log. Every one of those sentences was sitting in the player's
own install. [neighbours.md](../neighbours.md) noted that nobody has read a fade line back to its
spell from `spells_us_str.txt`; EQBuddy hand-maintains the mapping instead.

A buff **starting** is worse served, and the shortfall shapes the design. `You begin casting Spirit of
Wolf.` names the spell and no target; a landing line names the target and no spell. Only together do
they say who got what, and neither is guaranteed — plenty of spells land in silence (Burnout's
`SPELLGONE` is empty entirely). So a rise is assembled from whatever turned up, and an instance whose
target we never learned is a legitimate state rather than a hole to fill with a guess.

The watch system could already be *pointed* at this. [ADR 0084](./0084-a-watch-is-a-rule-not-a-substring.md)
gives a rule conditions, [ADR 0082](./0082-an-alert-can-be-scheduled.md) gives it a delay and a repeat,
and `CastWatch.onFade` fires on a fade line. What it cannot do is hold a **model** of what is up: a
watch matches a line, and a rule per buff typed by hand is exactly the work
[ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) refused to ask of a camper.

One trap was recorded before any of this was built. [todo.md](../todo.md) carried **eql-alerts**' find
that a large set of classic short self-buffs are `Duration: Permanent` on EQL, shipped as a hand-built
list (`samples/eql_permanent_buffs.json`), and warned that it would bite "any buff timer we build".
Checked against a live install, `buffdurationformula == 50` reproduces that list exactly — including
the split it calls out by name, where Yaulp I–III never expire and **Yaulp IV lasts four ticks** — and
so are Divine Might, Divine Purpose, Lich, Elemental Armor, Greater Wolf Form, Grim Aura, Deadeye,
Firefist and Shielding. So the list is not borrowed: the player's install states it, which is
[ADR 0025](./0025-observation-over-the-wiki.md)'s argument applied to a source that is *this* game
rather than an older one.

## Consequences

- **The limit `cast-alerts.ts` documented is closed**, and its wording there is now historical: a fade
  on you names a spell. The watch path is untouched and still matches on the words, because a watch is
  the player saying "tell me when the game says this" and that is a different feature.
- **`spells_us_str.txt` is a second file we depend on that patches weekly.** The mitigation is the same
  as its sibling's and stronger: the layout is six named columns, nothing validates a width, and a
  changed sentence degrades to an unattributed fade rather than to a wrong one. `spell-strings.live.test.ts`
  is what would notice.
- **Two figures are now readable and unused**: the duration formula's figure (index 12), and
  `CASTEDMETXT`/`CASTEDOTHERTXT` as a general grammar for buff *landings* — which
  [log-watching](../log-watching/README.md) lists as out of scope for the parser and which this reads
  without making it one. A landing event kind is the obvious next consumer.
- **The board does not survive a restart, and says so by being empty.** Which buffs are up is a fact
  about a login: nothing in the log restates it, [ADR 0043](./0043-state-is-not-news-either.md)'s
  catch-up recovers your zone and position for exactly that reason and stops there, and buffs don't
  survive a logout in EQ anyway. Restarting mid-session costs the buffs whose landing lines have
  already scrolled past. Claiming otherwise would be inventing state the first fade line would
  contradict.
- **A buff cast on you by a group-mate is indistinguishable from your own** where the spell lands
  quietly, because only the landing sentence says it reached you and only a cast line says who threw
  it. `mine` records that we have seen *you* cast it, which is the closest honest answer.
- **The permanent-buff list stops being a thing to carry.** The todo item is answered by a column, and
  the same column is what keeps the feature from nagging you to recast Thistlecoat for ever.
- A tenth tab. `TabBar` collapses from the end, so Buffs sits beside Timers — a buff that dropped is
  something you need mid-fight, which is exactly when you cannot go hunting through a » menu.
