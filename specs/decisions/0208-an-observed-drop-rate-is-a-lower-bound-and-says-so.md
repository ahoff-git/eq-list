# 0208: An observed drop rate is a lower bound, and says so

## Status

Accepted

## Context

The user's own suspicion about the drop-rate figures, going in: double-counting, or credit for a kill
whose loot went to somebody else nearby. Auditing `kill-log.ts` against a real captured log
([ADR 0207](./0207-a-retired-kill-still-remembers-its-own-line.md)) found and fixed two real
double-counting bugs — but turned up nothing that inflates a rate the way "credited for a kill you
didn't loot" describes. The reverse does happen, though, and it's structural rather than a bug:

`observeMobs` (`mob-stats.ts`) counts a kill toward the denominator whenever you landed the killing
blow (`kill.mine === true`), regardless of whether you personally looted the corpse. That's the right
call *for the kill count* — you killed it, full stop — but it means the denominator includes every
kill you were credited for, while the numerator (`MobDrop.myCount`, fed from `KillRecord.drops`) only
ever grows from a loot line **you** generated. In a solo camp those two always move together. In a
group or raid where looting is round-robin, leader-controlled, or simply first-come, they don't: a
kill you land can be looted by whoever gets to the corpse, and EQ never broadcasts another player's
loot to a bystander who didn't do the looting — confirmed empirically, zero such lines in a real
50MB log. That corpse contributes to `kills` and to nothing else. There is no signal in the log that
tells this case apart from "it genuinely didn't drop" — no line says *someone else* looted it, only
that *you* didn't.

This can only push an observed rate down, never up — a corpse never adds a drop it wasn't seen
dropping — so it is a one-directional bias, not noise. That also means it doesn't shrink with more
kills the way sample noise does: killing the mob another hundred times makes the *count* more solid
without doing anything to correct the bias, since every one of those kills is subject to the same
gap. A rate shown as "settled" at 50+ kills can still be a settled measurement of the wrong number.

`party.ts`'s roster is explicitly non-authoritative (`has` answering false means "not known to be",
never "isn't"), so there is no reliable way to detect *which* of your kills were grouped or raided at
the time and flag only those — the honest options are silence or an unconditional note.

## Decision

**Every place an observed rate is shown grows one caveat sentence**, unconditional — not gated on
group state (nothing here can tell reliably), not gated on sample size (the bias doesn't shrink with
one), stated once beside the number rather than buried in a doc comment nobody reads from the UI:

> Counts kills credited to you even when someone else looted the corpse first, so a grouped or
> raided rate can read low.

Landed in the three tooltip call sites that already share `drop-truth.ts`'s `rateWhy(kills)`
(`ItemDrops.tsx`, `MobKills.tsx`, `MobKnowledge.tsx`), in `HuntPanel.tsx`'s own local `rateWhy`
(observed branch only — the wiki's own figure isn't subject to this), and in
`wiki-contribution.ts`'s pasteable text, since that one leaves the app and an editor reading it on
eqlwiki has no other way to know the number in front of them might be a floor rather than a
measurement.

**No attempt to detect or correct it.** Inventing a heuristic here would repeat the mistake this
session already corrected itself out of once before landing ADR 0207 — a number tuned against nothing
is a guess wearing a measurement's clothes, and "proof from evidence, never guessed" is the standard
this codebase has held itself to elsewhere (the AoE-detection rule in `buff-tracker.ts`, the 5×
duration-erratic ratio in ADR 0206, both measured against real logs before being written down). There
is no real log evidence available for how large this bias typically runs, so no number is offered.

## Consequences

A player reading any observed rate — on screen, or pasted into eqlwiki — now sees the one sentence
that answers the user's original suspicion honestly: this can undercount, here's exactly how,
and no amount of grinding fixes it on its own. Solo play, where the bias doesn't apply, gets the same
sentence as raid play, where it can be significant — a false generality traded deliberately against
the alternative of pretending to know which of a player's kills were grouped.

**This is not a fix.** The underlying gap — no signal distinguishes "looted by someone else" from
"never drops" — is unresolved and, on the log format alone, unresolvable. If EQ's client ever logged
a "so-and-so looted X" line visible to bystanders, or if group/raid membership became reliably
knowable at kill time, the caveat could narrow to the kills it actually applies to instead of every
observed rate; neither exists today.
