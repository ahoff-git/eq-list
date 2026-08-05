# 0054: A play session is a login, and a fight is named after what we fought

## Status
Accepted

## Context
The history list is meant to read as "which evening, and what did I fight". It read as neither.

**Sessions were app runs, not evenings.** A session id was minted per launch (or per manual
reset), so restarting the app mid-camp split one evening into two, and a crash split it again.
Measured on the real history file: **38 sessions** covering play that the log says was **12
sittings**. The log states the boundary outright — `Welcome to EverQuest Legends!`, once per
sitting, verified 12 times across a fortnight in a 95,000-line log — and nothing was reading it.

**Fights were named after group-mates.** The label was "the biggest damage dealer that isn't you
or your pet", which in any group is whoever out-damages you: an evening of history titled
`BunnySlayer` over and over. The mob was right there in the same data, but nothing asked which
combatant *we* were hitting — and the panel's ★-best flag derived the opponent a second,
slightly different way, so the two could disagree about the same fight.

## Decision
Take both answers from the log rather than from the app's own lifecycle.

- **`parseLogin`** matches `Welcome to EverQuest Legends!` (the game's name loosened, the
  exclamation kept) and emits a `login` event. It runs *after* `parseLevel` in the dispatcher,
  because "Welcome to level 14!" shares the opening words and must stay a level-up.
- **A login starts a play session.** `history.startSession(at)` keys the session on the login's
  **own timestamp** (`login:<at>`), not a fresh id — a replayed gap or a re-read log presents the
  same line again, and a random id would turn one evening into two, which is the bug being fixed.
  Fights recorded before any login (the app started mid-sitting) fall under a `run:<uuid>` id.
- **The tracker resets on login, before the id changes**, so the fight in progress and the Session
  tab's counters file under the sitting they happened in. This is the same reasoning as the
  existing catch-up reset ([ADR 0043](./0043-state-is-not-news-either.md) / `isSameSitting`),
  now driven by what the log says instead of by how long the app was shut.
- **A fight is named after what your side damaged most** (`opponentOf`, beside the damage cells it
  reads — [ADR 0053](./0053-damage-is-cells-rolled-up.md)), with two fallbacks, in order:
  1. what you or your pet dealt the most damage to — the answer whenever you took part;
  2. else **what died** in the fight (`byMob`) — you were healing, or the group killed it before
     you swung. Checked against the real log: every bystander fight so named came out as the mob
     (`orc centurion`, `Orc slaver`), where the old rule named the group-mate;
  3. else whatever took the most damage, for a fight nothing died in.
- **The label is recomputed on read**, not trusted from the file, so the 600-odd fights already
  stored get today's rule. `bests()` keys on the same recomputed label, so the ★ flag and the list
  can't be looking up different names for one opponent. The stored `label` stays as a cache —
  this is the cheap end of the "re-derive stored fights" option [ADR 0021](./0021-stored-fights-keep-their-source.md)
  deliberately left open.

Rejected alternatives:
- **Grouping sessions by a time gap between fights** (an hour, say). No new parsing, and it
  invents boundaries the log doesn't have: a long AFK becomes two evenings, and back-to-back
  sittings become one.
- **Telling players from mobs by their name** (no article, single capitalised word). Tempting, and
  wrong on real data: `Bonefire`, `Marrowbane` and `Bloodgurgler` are named opponents we killed —
  the same shape as a player's name. Attribution ("did *we* hit it") is the honest signal.
- **Keeping the app-run session id and adding the login as a marker inside it.** Two concepts
  where one will do, and the list would still be grouped the wrong way.

## Consequences
- The history list is one row per evening. On the real log: 12 sessions, 113/85/82/64… fights
  each, and fight labels that name mobs.
- Sessions recorded before this exist under their old per-run ids and stay as they are — nothing
  in them says which sitting they belonged to.
- A fight you took no part in *and* in which nothing died can still be titled with a person's
  name. There's no attribution to go on there, and inventing one would be worse than the guess.
- `login` is a new event kind on the watcher. Nothing else consumes it yet; a "you played 3h
  tonight" figure is now derivable, which it wasn't.
- Other players' deaths are logged like kills, so a nearby death can briefly appear as "what
  died" in a fight you were only watching. It's the same limit
  [ADR 0027](./0027-only-your-kills-count.md) records for drop rates, and it only reaches the
  label in fights you didn't fight.
