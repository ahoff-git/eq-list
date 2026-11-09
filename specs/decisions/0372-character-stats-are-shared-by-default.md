# 0372: Character stats are shared by default

## Status

Accepted

## Context

[ADR 0371](./0371-a-stats-record-is-kept-and-shared.md) added the `stats` peer kind as an opt-in: the rule it followed
([ADR 0161](./0161-a-public-page-is-shared-by-default.md)) is that a kind is on by default only when it is a public mirror
or a pooled observation, and off for what the player made and for what is live — so a share of a character's own numbers
"has to be a decision somebody took". The player decided (2026-11-08): **default it on**.

The case for it is that the kind is only useful if people have it. *Plan as them* needs both sides to have shared, and a
toggle that sits in the Peers tab, off, is one most players in a room would never find — the same argument ADR 0161 made
for the item catalogue. And what it shares is narrow: figures the player chose to read off their own Inventory window.

## Decision

- **`stats` is on unless the player switches it off** (`defaultOn: true`). An explicit answer still wins in both directions
  (`sharing`), so a player who turns it off stays off.
- **Nothing leaves until a stats read has been taken.** With no record there is no row, and a peer is offered nothing — a
  default-on kind with nothing behind it shares nothing. The first read is what first puts a record in the room, and only
  while the peer connection itself is switched on.
- **The limits of 0371 stand, unchanged.** Never a figure the read wasn't sure of (the sender's projection drops it and the
  receiver's reader drops it again), never anything beyond the figures, classes, level and race, and clearing the calibration
  forgets the record.
- **The player is told where it happens.** Settings' text for the stats read says what it shares and where to switch it
  off, and the Peers tab lists the kind under its own name with the toggle.

## Consequences

- This is the one `live` kind that is on by default, so ADR 0161's rule now has a stated exception rather than a silent
  one (`ShareKindSpec.defaultOn` says so).
- Players who connected to the room before this and have already read their stats start offering them on update, with no
  prompt. That is the point of a default, and it is why the Settings text and the Peers toggle say so.
- A record stays offered from the moment of a read until the player clears their calibration or switches the kind off — it
  is not withdrawn when the read goes stale (ADR 0369), only dated. The receiver shows the age.
