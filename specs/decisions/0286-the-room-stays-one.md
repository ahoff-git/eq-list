# 0286: The room stays one

## Status
Accepted

## Context
`specs/decisions/README.md`'s Open Questions carried **"Should there be more than one room?"** since
[ADR 0141](./0141-the-room-is-a-meeting-place.md) made everything in a catalogue visible to everyone in
the single `eq-list` room: a buff board, a camp's countdowns, a group's loot, a shopping list for a
shared quest are all things a player wants to hand to *these five people*, not the room, and a group
room, a camp room or a server room were three live candidates — each with its own join story (who
invites, what the id is, whether it outlives a session).

[ADR 0274](./0274-a-fight-is-compared-live-with-your-party.md) wanted exactly that scoping for live
fight comparison and, rather than wait on a room answer, settled for a client-side workaround: matching
your own already-known party roster (`src/shared/combat/party.ts`, fed by `parseParty()` in
`src/shared/log-parser.ts`). [ADR 0275](./0275-a-shared-swing-proves-the-same-fight.md) found a sharper
unit for *matching* (proving two peers share a swing) that needs no room scoping at all, and
[ADR 0276](./0276-overlapping-fights-are-pooled-not-only-proven.md) brought the party roster back only
for *pooling* — merging a peer's numbers into your own total is a stronger claim than comparing them,
and the roster is what tells a confirmed party-mate from a stranger hitting the same public mob.

That workaround has been carrying every case that has actually come up. Nothing has shown up that
needs the room itself to be scoped — the proof-based and roster-gated tricks above keep answering
"who is this for" one kind at a time, without a room boundary to draw or an invite flow to build and
maintain.

## Decision
**The app keeps exactly one room (`eq-list`). No group room, camp room, or server room is being built.**
Scoping "who this data is for" stays a per-kind, client-side decision — proof (shared swing, shared
line) where one is available, the locally-known party/faction roster as a gate where pooling needs a
stronger claim than proof alone gives — rather than a property of the room itself.

If traffic or catalogue noise in the single room ever becomes a real problem, the room can be sharded
later; that is a scaling fix to revisit if and when load actually warrants it, not a reason to build
room-scoping now.

## Consequences
- `specs/decisions/README.md`'s "Should there be more than one room?" open question is resolved: no
  further design work is expected here unless a new kind of shared data shows up that genuinely can't
  be scoped by proof or by a locally-known roster the way fights, and now groups, already are.
- `specs/peers/README.md`'s "No room scoping" statement stands as the durable architecture, not a
  stopgap — future sharing kinds should default to the same proof/roster pattern ADR 0275/0276 used
  rather than treat "needs its own room" as an option on the table.
- Sharding the single room for traffic reasons, if it's ever needed, is a separate, later decision —
  this ADR only closes the "scope sharing by room" direction.
