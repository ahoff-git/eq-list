# 0371: A stats record is kept, and shared

## Status

Accepted

## Context

A stats read ([ADR 0368](./0368-a-stats-grab-reads-the-inventory-window.md), [0370](./0370-a-stats-read-says-who-you-are-and-a-bad-one-says-what-went-wrong.md))
left three things behind, and the player asked (2026-11-08) whether they survive a restart — and that they be shared
with the peer room.

**What was kept, checked against the code.** The offsets from what the plan counts live in the loadout builder's
options, which `usePersistentState` keeps in the main process *and* `localStorage` — they survive. The classes and level
live in the Items criteria, the same. The stamp that dates a read (ADR 0369) lives in `localStorage` alone: it survives a
restart, but a renderer's `localStorage` belongs to an *origin* (`app://local` packaged, `http://localhost:3000` in
development), so it is one build's and not the player's. And **what the game actually showed** — the figures, the
classes and level they were for — was kept nowhere: only its offsets. A figure the read wasn't sure of, waiting for the
player's yes, was in memory and gone at quit.

**Sharing.** The peer room already offers a character's inventory as a live, opt-in kind
([ADR 0309](./0309-an-inventory-is-shared-live-and-judged-by-the-receiver.md)), and the loadout builder can plan for
anyone who shares theirs ([ADR 0342](./0342-a-loadout-can-be-planned-for-a-peer.md)). That
plan used *your* classes, race and level and none of their calibration, so a floor on a peer's plan was in numbers
nobody's game had shown. A shared stats read is exactly what it was missing.

## Decision

- **The record is kept in the main process** (`electron/stats-record.ts`, `stats-record.json` in userData): the
  figures the game showed (the stats the plan keeps an offset for, and the regen rows), the classes, level and race they
  were measured against, when the screen was read, and any figure still awaiting the player's yes. It is written when a
  read is applied, when the player answers the held figures, and forgotten when they clear their calibration (a read
  they have taken back should not go on being offered). It is a record of the read, beside the offsets, not instead of
  them.
- **One gate for the disk and the wire** (`readStatsRecord`): known stats only, whole non-negative numbers in range, up to
  three known classes spelled the app's way, a real level, a short race code, a real date. A damaged file and a hostile peer
  meet the same rules and cost the same thing — the field, not the record — and a renderer's bad `set` is refused rather
  than treated as "forget" (only an explicit null forgets).
- **A new read folds into the one held**: under the same race, classes and level it adds to it (a read of half the page
  doesn't forget the other half); under a different one it replaces it, since the old figures were the game's totals for a
  character that has since changed.
- **At launch the page asks for it** (`restoreStatsRecord`): the held figures come back to be asked about, and a stamp the
  window has lost is put back from the record, so the "re-read your stats" reminder still knows how old the read is. A
  stamp that is there is left alone.
- **A `stats` kind joins the peer catalogue** — `live`, so off until the player switches **Character stats** on, one row,
  asked for the way inventories are (`inventoryAsksDue` takes the kind). What leaves is the record **without the figures
  awaiting a yes** (`shareableStats`); the reader on the receiving end drops them if a peer sends them anyway. A peer on an
  older build ignores a kind it doesn't know, so the protocol number is unchanged.
- **The Peers panel lists who shared what** (`PeerStats`): classes, level, race, how old the read is, HP, mana, AC.
- **The loadout builder can plan as them.** For a peer who shared both their inventory and their stats, *Plan as them* sets
  the Class and Race pickers and the level slider to theirs (the pickers are the player's own, and the button says so) and
  measures the figures their game showed against **what they wear** — their worn gear by the same reader the Items tab uses
  (`wornStats`) — so a floor on their plan means what their own Inventory window would say. Their calibration is kept with
  their plan, apart from yours, as ADR 0342 keeps their locks.
- **"Yes, use it" needs a dump**, as a read does, and says so rather than doing nothing without one.

## Consequences

- A character's real numbers can leave the machine, which is why it is a live kind: off until chosen, the figures only,
  never a guess, and never the name beyond what the room already carries in its envelope.
- The figures in a record may come from different reads of the same character (a later read of part of the page adds to an
  earlier one). The record is dated by the newest, so an old figure can sit under a new date; the offsets have the same
  property and ADR 0369's reminder is about both.
- A peer's record is a snapshot at their read, not a feed: it goes stale for them as ADR 0369 describes for you, and nothing
  tells the receiver so. The age is shown, and *Refresh from their latest* re-measures when they re-read.
- Planning as a peer moves the player's own Class, Race and level pickers. That is explicit and one button; the player's own
  plan is theirs to put back.
- The stamp is still in `localStorage` as its source of truth; the record only fills it back in when it is missing. Moving the
  stamp into the main process would make the record the whole story and is left for when it hurts.
- The loadout builder's `worn` for a peer is computed from their shared dump and **your** catalogue, so a piece you have no page
  for counts for nothing in their plan — the same limit their inventory's loadout already has.
