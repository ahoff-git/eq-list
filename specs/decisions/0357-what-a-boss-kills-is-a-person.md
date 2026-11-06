# 0357: What a boss kills is a person, unless a person killed it too

## Status

Accepted

## Context

A named is recognised by its article, on the victim and on the killer
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)), and a person is never a named:
the log says who is one **by what they kill**, because anyone seen killing something with an article has
killed a mob ([ADR 0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md)).

That leaves a person the log never sees killing anything. A raid-mate who dies once to the boss is
written exactly like a named dying (`Bunnyslayer has been slain by Lord Nagafen!`: no article on either
side) and has no kill of their own to place them, so they pass as a named and land on the spawn board.
`specs/todo.md` carried this as a known bug.

[ADR 0356](./0356-the-spawn-board-learns-from-the-whole-kill-history.md) made it matter more, since the
board now reads every kill on file and not just the last 200. Replaying one install's real log (11,232
kills), **18 of its 140 proven nameds were raid-mates**, each slain once or twice by Lord Nagafen, Lady
Vox, Master Yael, Minotaur Lord or Cazic-Thule. Three of them were already showing in the recent window.

## Decision

**`provenNamed` learns who is a person from a second signal, what kills them.** A boss a person is known
to have killed is a mob, and a mob kills players and pets — so a victim written without an article, of
such a boss, is a person. They are never a named, and what *they* kill now counts as a person's kill.

- It runs to a fixpoint, because the rules feed each other: a person's kill proves a boss, whose victims
  are people, whose kills prove further bosses. Each pass only adds a name, so it ends.
- **You are a person from the start**, whether or not the log has shown you killing a mob with an article.
- **A thing a person killed is a mob, whoever else killed it.** Mobs kill each other as well: on the same
  install `Marrowbane` and the orc emissary were "slain by" Bonefire, another named, *and* by the player.
  That is the stronger evidence, so a boss's kill never makes such a victim a person. A first version of
  this rule without the guard dropped both.
- Only a victim **recorded as written bare** is demoted. `named` absent is unknown, as ever, and is no
  evidence of anything.
- The boss's proof has to come from a person. A boss only ever killed by a stranger the log has never seen
  kill anything is not known to be a mob, so its victims are left as they were.

## Consequences

- On the install that found it, 18 of 140 "nameds" go: seventeen killed only by a boss, and one who also
  died to a wild tiger. None of the eighteen was ever killed by the player or by anyone the log shows
  killing a mob, which is what the rule's guard asks, and every named the player did kill stays.
- It is a rule of thumb, not a registry. A raid-mate who dies to a boss that nobody has killed yet stays on
  the board until somebody does, and **a named killed by another named that no person ever killed** is
  taken for a person. That is the safe direction, the one ADR 0092 already prefers: a missing row is
  fixed by adding the mob by hand, where a junk row cannot be fixed by waiting.
- `provenNamed` costs about 4 ms over 11k kills (it was 2). The extra passes look only at the small
  slice written without an article, which is what keeps them cheap.
- Pets with names of their own are still invisible to it, as before; `pet-registry.ts` knows them and a
  pure function over records cannot reach it.
