# 0298: NPC sightings place what you never kill

## Status

Accepted

## Context

The app places a mob from your kills, your peers' kills, or the wiki (ADR 0025, `mob-place.ts`).
None of these places an NPC you never kill: a quest giver, a merchant, the enchanter you hand a coin
to. When the wiki page states no location, as with Tarton's Wheel's Sulgar, nothing can put them on a
map. ADR 0293 had to fall back to a `/loc` typed in by hand.

The log already says when such an NPC is in front of you. `You say, 'Hail, Sulgar'` is deliberate and
short range. `Sulgar says, '…'` carries only as far as /say does. `Sulgar regards you indifferently`
is a consider, which reaches much further. The parser already turned hails and considers into
`sighting` events for respawn timing (ADR 0097), but nothing kept where they happened. None of these
lines carries a position. Your `/loc` lines do, and some players type `/loc` constantly.

Measured on one real log (2½ months, 69 MB): 117 hails, 484 considers and about 2,100 speech lines
pair with a `/loc`, placing 477 name/zone pairs. Sulgar comes out at 2999, -2399, the same spot that
was entered by hand.

## Decision

**Every hail, /say-range line and consider is paired with your nearest same-zone `/loc` within 30
seconds either side, and kept per name and zone** (`src/shared/npc/npc-sightings.ts` pairs them,
`electron/npc-sightings.ts` stores them). A sighting with no fix close enough is kept without a
position, because "seen in this zone" is still worth knowing.

**Where someone stands comes from the best kind of line only**: hails, then speech, then considers,
never averaged together. A consider from across a field would otherwise drag a hail's tight cluster
off the NPC. Each name and zone keeps its first sighting and its 19 most recent.

**Speech is filtered for what isn't an NPC**, from patterns measured on that log: `tells you` (a
/tell can come from anywhere), channels, your own lines and your group's, pets (addressed as
"Master", "oh great one", "oh splendid one", or named "X`s warder"), corpse flavor text, and a
player's bare "Hail" or "Hail, <name>". An NPC's greeting is a sentence ("Hail, traveler! …") and
passes.

**One placer serves both live tailing and a log re-read**, so an evening reads the same either way.
The store is a new data concern with `backfill`: a store that has **never been written** counts as
stale for an unattended re-read. The first start that has it reads the logs already on disk once,
after the window paints.

**Local only, never shared with peers.** A consider or a /say can name a player, and where somebody
stood is theirs to share, not ours.

**Shown on a mob/NPC page** under **Where you've seen them**: each zone, the spot with its spread
(opening the map), what placed it, and first and last seen.

## Consequences

- The position is **your spot beside them**, not theirs. Hails land within a few steps, considers
  can be far off, and the page says which kind placed it.
- A player typing keywords to an NPC in /say ("travel to Ocean of Tears") still gets through. They are
  filed under their own name, and players have no wiki page to show it on, so it does no harm.
- Nothing feeds `mob-place.ts`, the map's pins, or the quest-NPC pins yet. Those still rank kills
  and the wiki. Using sightings there is a separate decision about where "seen" ranks against
  "killed" and "stated".
- "Forget recorded kills" clears sightings too. They're derived from the same logs, and a re-read puts
  back whatever the files on disk still hold.
- Re-reading a log already watched adds nothing: a sample of the same kind within a minute of one
  already held is the same sighting.
