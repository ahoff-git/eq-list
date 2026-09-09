# 0209: A swing's verb is a skill only when the log names one

## Status

Accepted

## Context

The user's report: several classes' signature combat arts — Berserker Frenzy, Shadow Knight Harm
Touch, Warrior Cleave, Monk Tiger Claw/Eagle Strike, Rogue Backstab — read as generic "strike"
damage in the meter instead of by name, while Backstab was already correctly labeled. The ask was
to make the others just as distinct.

`meleeSkill` (`combat-parser.ts`) already turns a swing's verb into its skill name — "backstabs" /
"backstab" → "Backstab", the same table `MELEE_RE` matches the line against. So the question for
each reported skill was purely empirical: does the log actually word it with its own verb, the way
Backstab is? Checked against a real 615,000-line log (character "Kainos", a GM-flagged test
character carrying every class's skills at once — useful here precisely because it swings with all
of them):

- **Frenzy, Reave, Smite** all have their own dedicated verb — `frenzy(ies)`, `reave(s)`,
  `smite(s)` — and none of the three was in `MELEE_VERBS` at all. Their lines matched no pattern and
  were silently dropped: 438 Frenzy hits, 135 Reave, 33 Smite, gone before this fix, not merely
  mislabeled. Frenzy is also worded with "on" before its target ("You frenzy on a lesser ebon
  drake…", "X frenzies on YOU…", "tries to frenzy on Y, but…") — the only verb in the whole log that
  does, first- and third-person and in the miss form alike.
- **Backstab** and **Cleave** were already correct — both were already in `MELEE_VERBS`, and Cleave
  reads as its own verb in the log (`Kareker cleaves a tomb spiderling…`) distinct from ordinary
  weapon-type swings (`crush`, `slash`, `pierce`), not a re-skin of one of them.
- **Harm Touch** was already correct too, by a different route: the log words it
  `<attacker> hit <target> for N points of magic damage by Harm Touch.` — `SPELL_RE`'s shape, so the
  name survives in `event.spell` exactly like a nuke's. It rolls up under the meter's "Spell" bucket
  rather than a melee one, which is a `damageKind` categorization question, not a lost name.
- **Tiger Claw, Eagle Strike, Round Kick** (and by the same mechanism, Monk Strike, and presumably
  Flying Kick/Dragon Punch) are a harder case, and the log settles it in the negative. `Kainos` gains
  and loses these repeatedly over the log — not a one-time unlock — always through a paired
  announcement:

  ```
  You have gained the ability to use Round Kick.
  You will now use Round Kick instead of Kick while attacking.
  …
  You will now use Kick instead of Round Kick while attacking.
  You will now use Round Kick instead of Kick while attacking.
  ```

  and the same pattern for `Eagle Strike` / `Tiger Claw`. But every damage line for either slot,
  checked across the whole log and on both sides of every one of these transitions, is worded with
  the same plain verb regardless of which tier is active — `kick`, never `round kick`; `strike` /
  `punch`, never `claw` or a skill name. `claw` as a verb never once appears for the player's own
  hits in 615,000 lines despite Tiger Claw being active for most of that span. The tier name exists
  **only** in the announcement line, never on the swing that follows it. And the announcements
  themselves can fire faster than a state tracker could usefully bind to a hit — four of them one
  second apart in the real log, toggling both slots back and forth. There is no way to tag an
  individual swing with the tier that produced it; the log does not carry that fact.
- **Double Attack / Triple Attack** carry no signal at all — they are a passive chance for a second
  or third ordinary swing in the same round, worded identically to any other swing. Nothing marks
  one as the "extra" hit.

## Decision

**Add the verbs the log actually has and nothing more.** `frenzy`/`frenzies`, `reave`/`reaves`,
`smite`/`smites` join `MELEE_VERBS`. `MELEE_RE` and `MISS_RE` both gain an optional `(?:on )?`
immediately before the target group — harmless for every other verb (no EQ name starts with "on "),
and required for Frenzy's own grammar, in both its landing and its miss form (`tries to frenzy on
X, but misses!` was already matching as a bare `\w+` miss verb, but with `target` reading as `"on
X"` instead of `X` — fixed as part of the same change rather than left as a second bug found later).

**No attempt to track which kick/strike tier is active.** Doing so would mean a new stateful module
(this file is deliberately pure, no I/O, no state — see its own header) built on a signal — the
announcement line — that has already been shown, in this same log, to change faster than the hits
it would be labeling. A best-guess label attached to the wrong hit is worse than the honest generic
one, and nothing here is worth guessing at without evidence the way ADR 0206/0208 held themselves
to. `Kick` and `Round Kick` stay one bucket; so do `Monk Strike`, `Eagle Strike` and `Tiger Claw`,
under whichever plain verb the log actually used. Double/Triple Attack get no bucket of their own
for the same reason — there is nothing in the log to key one on.

## Consequences

Frenzy, Reave and Smite now show up as their own rows in the meter and the high-score board
(`meleeCategory`/`meleeSkill` already do the rest once the verb reaches them) instead of vanishing.
Backstab, Cleave and Harm Touch needed no change — confirmed, not assumed.

The Monk fist/kick line is a known, permanent gap rather than an unfixed bug: `Round Kick` reads as
`Kick`, and `Eagle Strike`/`Tiger Claw` read as whatever generic verb the log used for that slot
(`strike` or `punch`, per what was observed), for as long as EQ Legends' own client declines to word
a special attack with a verb of its own. If a future log ever shows one of these tiers writing its
own verb — the way Backstab, Cleave, Frenzy, Reave and Smite already do — the fix is the one-line
addition this record just made five times over, not a new mechanism.
