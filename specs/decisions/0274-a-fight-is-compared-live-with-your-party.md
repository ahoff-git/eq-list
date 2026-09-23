# 0274: A fight is compared live with your party

## Status
Accepted

## Context
"How did my fight compare with the rest of the group" had no answer anywhere in the app. The peer
network already solved the adjacent problem for a *lifetime* number — `PeerScores` sits a party-mate's
personal bests beside your own, self-reported and never merged
([ADR 0141](./0141-the-room-is-a-meeting-place.md)) — but nothing carried a **single fight's** figures
across the wire, and nothing said which of two installs' fights was the *same* one.

That second half is the hard part, and it stays hard: EQ's log gives no shared fight or mob-instance
id, `StoredFight.key` is deliberately **per-player** (the log filename plus each side's own observed
swing boundaries — `electron/combat-history.ts`'s `fightKey`), and even "the same pull" can end at
slightly different moments on two logs (ADR 0036's lull tolerance is measured per tracker). Nothing
here can *prove* two installs are in the same fight.

What made the rest of it tractable was narrowing who could ever be a candidate. The room today is
flat — everyone running the app, or one peer directly — and giving it group/camp-scoped rooms is its
own unresolved question (see "Should there be more than one room?" in
[decisions/README.md](./README.md)), not one this feature needed to answer. Restricting comparison to
**your own party** (`src/shared/party.ts`, folded purely from your log's own group lines) turns "is
this the fight I'm in" from an unsolvable identity problem into a much weaker, honestly-reported
question: a party-mate, sharing, in your zone, active a moment ago, almost certainly *is* the pull
you're in — the same standard [ADR 0067](./0067-the-meter-counts-your-party-s-fights.md) already
applies to every other row on this tab.

## Decision
**A live fight is a new `ShareKind`, matched against your own roster, never resolved further than
"probably this one."**

- `FightShare` (`peer-share.ts`) carries the same headline figures the Combat tab's own stat tiles
  show: `zone`, `opponent` (named the same way `opponentOf` labels a stored fight), `startedAt`,
  `endedAt`, `durationSec`, `yourDealt`, `yourTaken`, `yourHealed`, `yourHealReceived`, `kills`.
  `endedAt` is **not** a "still fighting" flag — it is exactly what `FightStats.endedAt` already is,
  the sender's last-damage timestamp, moving forward while they keep swinging. A receiver judges
  liveness the same way the tab judges its own fight: by how recent that timestamp claims to be.
- `fight` is `family: "live"`, **off by default** — the same rule every personal kind in the table
  follows (`scores`/`buffs`/`timers` included). This corrected an assumption made out loud mid-design
  that scores were shared automatically; they aren't, and this doesn't get a carve-out either.
- `fightShareOf(fight, zone)` (pure, in `peer-share.ts`) is the whole projection: `undefined` before
  anything has happened this session, otherwise the window's own figures plus whatever zone the log
  currently says. Read fresh on every catalogue tick, the same unversioned treatment `timers`/`buffs`
  already get — a fight's numbers move mid-swing, and a version that ever answered "unchanged" while
  they did is exactly the lie `ShareSource` forbids.
- `CombatStats` gains `party: string[]` — the same roster `CombatTracker.party()` already exposed for
  tests, now riding the snapshot every reader of `combat.get()`/`onChanged` already gets. No new IPC
  channel: a reader that wants "who's in my group right now" already has it.
- `PeerFightCompare` (Combat tab, **`scope === "fight"` only** — there is no fight id to match a
  *stored* fight against a peer's, so History/Records never show this): folds `usePeerShare()`'s
  `received` down to rows from `useParty()` members, splits them into **live** (zone matches, and the
  sender's `endedAt` is within `PEER_LIVE_MS` — 120s, generous headroom over the share hub's own 60s
  catalogue tick plus a round trip) and **elsewhere** (in the party and sharing, just not a live
  match — named rather than silently dropped, the same "say what's uncertain" instinct ADR 0130
  applies everywhere else). A comparison table follows for the live set: one column per person, one
  row per metric, a metric's row hidden entirely when nobody in it is nonzero, and the leading column
  called out only for the four metrics where "more" reads as an answer (Damage, DPS, Healing, HPS —
  not Taken or Healing received, where it wouldn't).
- The section renders nothing at all when you aren't grouped — most fights aren't — and an empty
  state that teaches the toggle when you are grouped but nobody's sharing yet.

## Consequences
- Self-reported and unverified, exactly like `PeerScores` — there is no way to check a peer's
  `yourDealt`, and nothing here tries to. What makes it safe anyway is the same rule: a peer's figures
  sit in their own column and never touch yours.
- Matching is a **report, not a proof** — a party-mate in a different zone, or gone quiet a while, is
  named as unmatched rather than guessed into the table, and a coincidental false match (two
  party-mates who split up but happen to re-enter the same zone within the window) is a real if rare
  cost of a heuristic that has no fight id to lean on instead.
- Deliberately **narrower than "the whole room"** — a rival group at a shared camp is exactly the case
  this stays quiet about, on purpose, matching how every other figure on this tab already treats
  "somebody else's fight." Room-wide matching, if ever wanted, needs the room itself to grow scoping
  first (the open question this ADR leans on rather than answers).
- Deliberately **live-only** — no comparison for a fight already filed to History, since two already-
  ended fights have no shared id and no synchronized clock to match them by either. Worth revisiting
  only if a fight ever gains something to key on that today's log doesn't give it.
