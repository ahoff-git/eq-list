# 0284: A held event replays at its own moment

## Status
Accepted

## Context
[ADR 0127](./0127-an-unknown-name-is-held-not-dropped.md) named three steps and built the first two:
re-deriving a stored fight ([ADR 0128](./0128-a-fight-is-re-derived-not-refused.md)), then making
attribution read-time everywhere it was baked. Its own doc for `fight-scope.ts` named the third and
said why it had been left out until now: `admits` "runs live, once per line, with no way back: an
event admitted is tallied for good" — so only the near-certain direction was used (an ally swung at
it, therefore it's an enemy) and the weak one — a bare name, unplaced, that *might* turn out to be a
pet or a group-mate — was dropped outright. (1) and (2) were the "way back" ADR 0127 wanted before
building a third answer: a dropped swing that turns out to matter had nowhere to land.

That gate is the floor ADR 0127 measured: **646 damage** on `totalDealt`, **5,608** on `yourDealt`,
**2,127** on `yourTaken`, over one real log, before a pet or group-mate was ever recognized. Steps 1
and 2 already closed most of that — a pet's lines usually ride in because the mob they hit was
already an enemy from your own swing — but the residue is exactly the case where *neither* side was
yet recognized the first time the scope saw the exchange: a pet's opening swing against a mob you
hadn't engaged yet, landed before its own proof arrived.

## Decision
**`FightScope.admits` answers one of three ways — `"admit"`, `"hold"`, `"drop"` — and `combat-stats.ts`
keeps a queue of held events, re-asked on every subsequent line, applied the moment one finally
admits.**

**The tri-state, in `fight-scope.ts`.** `"drop"` is for the case nothing can ever change: both names
already carry an article, so the game itself has said both are creatures, and a creature never turns
out to be ours. `"hold"` is everything else that isn't already `"admit"` — at least one bare,
unplaced name stands between the event and an answer. The distinction matters operationally: without
it, a zone full of wildlife fighting itself (`"A wolf bites a rabbit"`) would sit in the held queue
forever, re-asked on every line for nothing. `hasArticle` is the one new thing `fight-scope.ts` reads
to tell the two apart — a name with no article is a player, a pet or a named mob, all three of which
*could* still prove to be ours; one with an article never will.

**The queue lives beside `doubted`/`held`/`heldIncoming` in `combat-stats.ts`, not inside
`fight-scope.ts`.** `fight-scope.ts` stays what its own doc already claimed: "pure and stateless
apart from [the enemies] set — a black box the tracker asks and resets." It only ever answers "in,
out, or not yet" for one event; what to do with "not yet" — queue it, retry it, replay it against
history — is a different kind of state (the events themselves, waiting) and belongs with the module
that already owns this exact shape of problem.

**Retrying is a plain re-ask, not a dirty-name index.** `scope.admits`/`isOurs`/`scope.fought` are
cheap, pure lookups, so `retryHeld` just asks the whole queue again after every line (`record`) and
after a party change (`recordParty`, which otherwise bypasses `record` entirely). Nothing tracks
*which* name a held event is waiting on; re-checking everything on every line was measured as fine in
practice (the queue is bounded by one fight's own unplaced names) and is simpler than building
anything smarter.

### The ambient-state problem, and why a snapshot is the answer

The hard part is that `apply()` and the surrounding handler read ambient, time-varying context that
moves on after a held event's own line: `stance`, `invocation`, the in-flight cast (`pending`), the
self-heal attribution window (`lastLanding`), and the cast-pairing arithmetic (`pairCast`,
`CAST_PAIR_MS`). Replaying a held event "now", against whatever those currently say, would file a
decade-old swing under today's stance, or let it pair with a cast that hadn't happened yet when the
line was actually logged.

**Each `HeldEvent` snapshots `stance`, `invocation`, `pending` and `lastLanding` the moment it's
first held, and `replayHeld` swaps the live values out for the snapshot, for the span of one replay,
then restores them.** `apply`/`admittedCastMs` read these off the tracker's closure rather than as
parameters, so the swap is a plain save-and-restore around one call, not a signature change to
either.

Two consequences of "restore, always":

- **A held event's own cast, once confirmed mine, does not arm live pairing for its own later
  landing.** If Garn's `cast` line was itself held (because Garn wasn't yet placed) and only his
  *landing* comes in as a separate, directly-admitted line afterward, that landing's cast time goes
  unmeasured — the same outcome ADR 0127 step 2 already accepted for a doubted caster's `pending`,
  just reached from the other direction. The alternative — letting a held cast's replay *write
  forward* into live `pending` — was rejected: `pending` is a single global slot (one caster's one
  in-flight cast, by construction, see `pairCast`'s own comment), and a held event resolving in the
  middle of live processing could silently overwrite a real, currently-relevant cast some other
  caster has in flight *right now*. Losing one cast-time sample for a rare case is a bounded,
  cosmetic gap; overwriting a real caster's live pairing mid-stream is exactly the kind of silent
  corruption this whole mechanism exists to avoid. Restoring always is the conservative choice, and
  it's the one that can't corrupt something live.
- **Identity lookups (`isMine`, `owns`, `party.has`, `canon`) are never snapshotted — they always run
  live, at replay time.** That's the entire point of the replay: the name just got placed, and the
  replay should use that knowledge. Only the *time-varying, non-identity* ambient state needs to
  stay frozen at the event's own moment.

Two worked examples, pinned as tests in `electron/tests/combat-stats.test.ts`:

- *"a held swing resolves with the stance and invocation it actually had, not whatever is current
  when it's finally admitted"* — Garn swings under `defensive`/`spellblade`; both change before his
  pet-tell proof arrives three lines later; his swing's `byStance`/invocation entry still reads
  `defensive`/`spellblade`. Without the snapshot, this reads `aggressive`/`empowering` instead — a
  silently wrong number, not a missing one.
- *"a held swing's own replay doesn't corrupt a cast-pairing it has nothing to do with"* — your own
  `Blast of Cold` is in flight when Garn's unrelated swing gets held; three seconds later your own
  cast lands and is timed correctly (`avgCastSec: 3`), proving the held line sitting in the queue,
  and its later retry/replay, never touched your real `pending`.

### Windows, and why a replay doesn't ask `stale`/`lastCombatAt` first

The live path (`handleLine`) checks `stale`/`lastCombatAt` before applying a swing, because a *new*
line might be the first one after a long enough silence to mean a new fight. A held event's own fight
already proved it exists — the event was placed in the queue while that fight's window was open — and
`heldQueue` is cleared the instant that fight closes, by whichever of three things gets there first:
a fresh engagement (`handleLine`'s own `scope.reset()`, same moment as always), `endFight` actually
filing (covers `settle()` closing a fight quietly, fight window left standing but done), or
`newFight()` (belt and braces, for a fight that was nothing but held events so far, so `endFight` had
nothing to file and returned early). So a held event only ever reaches `replayHeld` while its own
fight is provably still open, and it's applied to both `fight` and `session` unconditionally.

**`span.firstAt`/`lines.from`-`to` widen backward; `span.lastAt`/`lines.to` never rewind.** `w.mark`
and `w.note` used to assume a monotonic caller. A held event's own `at` can be *earlier* than
whatever the window has already recorded (a pet's opening swing, held, resolving after your own
later swing already set `span.firstAt`) — so both now treat `firstAt`/`lines.from` as a running
minimum and `lastAt`/`lines.to` as a running maximum, rather than blindly overwriting. `activeMs`
(the DPS denominator) is deliberately *not* rebuilt from a sorted timeline for a replayed swing — it
only accrues for a forward-moving gap, same as it always did, so a replay into the past simply adds
no active time rather than corrupting what's already there. Getting the damage numbers right is this
ADR's job; getting activeSec exactly right for a swing replayed out of order is a smaller, separate
problem that active-time accounting was already coarse about ("EQ logs to the second").

### Does a held event keep a fight open?

**No — only a *resolved* (admitted, replayed) swing extends `lastCombatAt`, and even then only
forward.** A merely-held, still-unresolved event touches nothing that `quietBy` reads. This was
checked both ways:

- **A flood of never-resolving held swings must not keep a fight open forever.** Pinned: a real fight
  opens at t=1s; held swings against an unplaced name arrive at t=30s and t=59s and never resolve;
  `settle` at t=62s still closes it as `"timeout"` — the held lines were never activity, exactly as
  if they'd been dropped on sight.
- **A fight built *only* from held swings must still be able to time out once one of them resolves.**
  If no live swing ever ran, `lastCombatAt` would otherwise sit at `0` forever and `quietBy` would
  never see the fight as stale (`stale: !!lastCombatAt && …`). So `replayHeld` also does
  `lastCombatAt = Math.max(lastCombatAt, at)` for a swing kind — forward-only, so a resolved event
  from the past can never *rewind* a clock a later live swing already advanced, but it can *start*
  one that nothing else ever has.

A held event that is still unresolved when the fight closes is simply dropped with the rest of
`heldQueue` — no new timer, no expiry window, exactly ADR 0127's own line: "expiry of a held event
means drop, so it degrades to today's behaviour."

## Consequences
- `FightScope.admits(event: CombatEvent): "admit" | "hold" | "drop"` — its one call site
  (`combat-stats.ts`) is updated; `electron/tests/fight-scope.test.ts`'s existing cases are rephrased
  against the tri-state and new ones cover `hold` (a bare name either side) and `drop` (two articled
  creatures).
- `combat-stats.ts` gains `HeldEvent`, `heldQueue`, `captureHeld`, `retryHeld`, `replayHeld`,
  `admittedCastMs` (the cast-pairing/`lastLanding`/incoming-buffer logic shared between the live path
  and a replay, factored out rather than duplicated) and `trackIncoming`. `record`'s body moved,
  unchanged in substance, into `handleLine`, so `record` itself can call `retryHeld` exactly once
  after every line regardless of which of `handleLine`'s several early returns ran.
- `endFight`, `newFight` and `reset` each clear `heldQueue` — see "windows", above, for why there are
  three places rather than one.
- Nothing about `doubted`/`held`/`heldIncoming`/`resolveHeld` (ADR 0127 step 2) changed. Once a held
  event is admitted and applied, it's an ordinary admitted event from that point on, including being
  just as capable of landing in a per-name held tally if *its own* attacker/target is still doubted —
  the two mechanisms compose rather than overlap.
- This closes [ADR 0127](./0127-an-unknown-name-is-held-not-dropped.md)'s three-step plan.
