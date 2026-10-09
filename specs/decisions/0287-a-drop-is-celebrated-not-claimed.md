# 0287: A drop is celebrated, not claimed

## Status
Accepted

## Context
[ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md) built a live banner for a tracked list
entry's own loot line, and deliberately stopped at your own log: "the log only ever names your own
loot... a group-mate's drop could only arrive over the awari room, which is a different decision with
a privacy default to settle" — left as the Open Question "Should a group-mate's drop reach your
overlay?" in `specs/decisions/README.md`, quoting the request it came from as "tell me when *one of
us* loots it."

Read literally, that request is a claim about the world: the item is accounted for, a camper can stop.
Answering it that way needs real design the open question flagged as unresolved — whose list an
arriving drop credits (given [ADR 0027](./0027-only-your-kills-count.md): only your own kills count for
you), and a hard limit that doesn't go away with any privacy default: a peer not running the app, or
with the feature off, is invisible while sitting in the same group, which makes silence
indistinguishable from "they didn't loot it." A claim that can be silently, undetectably wrong is a
worse feature than none.

Talking it through surfaced that the claim was never the point. Players already coordinate "are we
done camping this" by talking to each other — voice chat, group chat — the same way they already
decide anything else mid-session. What was actually wanted is simpler: being told your group-mate just
got the thing you're both after, so you can share the moment, not a system that tells you whether to
stop hunting.

## Decision
**A watched item's drop can be shared as a celebration, never as a claim.** A player who loots an
entry on their own tracked list ([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md)) may
broadcast that moment to the room as a `live`-family event, the same shape `timers`/`buffs`/`score`
already use (`SHARE_KINDS`, `src/shared/peers/peer-share.ts`) — transient, not pooled, not persisted,
gone the moment nobody's listening.

- **It credits nobody's list but the looter's own.** A celebration never checks, touches, or satisfies
  any other peer's tracked entry. It carries no claim that "this one's accounted for now" — whether
  anyone else keeps hunting the same item is exactly as much their own business as it was before this
  existed, settled the way it already is: by talking to each other.
- **Both ends opt in, independently.** Sending one is a per-player setting ("share my watched-item
  wins"), same family as `shareLocation`'s privacy default. Receiving one is a separate setting on the
  listener's side. Neither implies the other, so nobody is broadcast to an audience they didn't choose,
  and nobody's screen lights up with someone else's wins they didn't ask to see.
- **Silence carries no meaning.** Because nothing here is a claim, a party-mate who never sends one —
  offline, feature off, or simply didn't loot it — reads exactly the same: nothing happened that you
  were told about. There is no false "all clear" to detect, because there was never a claim to
  contradict.

## Consequences
- The literal original ask — "tell me when one of us loots it" as a signal to stop camping — is
  answered by *not building it*: that coordination stays a conversation between players, same as
  deciding anything else about a camp. This ADR resolves the open question by narrowing it, not by
  building the stronger claim it originally described.
- `specs/decisions/README.md`'s "Should a group-mate's drop reach your overlay?" open question is
  closed: the cost half was already settled (a share kind and a direct peer route exist per
  [ADR 0141](./0141-the-room-is-a-meeting-place.md)); the design half is this ADR.
- A celebration is cosmetic, so it carries none of ADR 0105's `done`/liveness bookkeeping for *other*
  peers' rows — only the looter's own list state changes; a listener's overlay just shows a banner that
  means "good for them," nothing more.
- Whichever tab the two new toggles land in (likely beside `shareLocation`'s privacy defaults) is an
  implementation detail for whenever this gets built, not part of this decision.
