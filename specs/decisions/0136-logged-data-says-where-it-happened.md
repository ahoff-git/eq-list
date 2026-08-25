# 0136: Logged data says where it happened, and how hard it was there

## Status

Accepted

## Context

Three tabs are records of what the log said: **Loot** (the drop ledger), **Damage** (fights, stored
and live) and the **kill** list behind the map's heatmap. All three exist to be compared — is this
camp better than that one, was that a good fight, does this mob drop the thing — and a comparison
needs to know where each row came from. Between them they had three different answers, none of them
whole:

- **Loot had no zone at all.** Not hidden, not folded — *never recorded*. A `LootEvent` is a parsed
  line and no loot line names a zone, so nothing ever attached one, and a ledger reaching back
  through months of play could not answer "what did I get out of Blackburrow". The kill log has
  stamped `currentZone` on every record since it existed; the loot log simply never did.
- **Damage and the records had a zone and printed it raw.** `The Steamfont Mountains 2 (Adaptive)`
  in an 11-character column, which is two facts crammed into one and clipped to neither. A reader
  scanning a fight list has to work out which part of each name is the camp and which is the
  difficulty — and the wordings differ between rows, because the log's do.
- **Kills had the zone implicitly and the difficulty nowhere.** The list is one camp already, so the
  zone would only repeat the map's own title forty times. But a kill at difficulty 3 and a kill at
  difficulty 0 sat in one list, indistinguishable, and they are not the same evidence — which is the
  split [ADR 0057](./0057-a-grade-is-not-an-identity.md) went out of its way to preserve in the data.

The parts to build this with were all in place and unused together.
[ADR 0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md) already says data is stored with
the log's wording and grouped when read, and `placeName` is that read-time fold.
[ADR 0134](./0134-a-map-reference-resolves-to-a-place.md) split a zone's name from its difficulty for
the map window and added `zoneDifficultyLabel` to say the tier out loud. What was missing was any of
it reaching the tabs where the data actually lives.

## Decision

**A drop records the zone it was looted in.** `LootRecord` is `LootEvent` plus a `zone`, stamped by
the recorder from `currentZone` exactly as a kill's is, and stored **verbatim** per ADR 0083. It is
stamped in `main.ts` rather than in the parser, because no loot line names a zone; that also makes it
correct for an eaten log, whose zone lines reach the recorder in log order. `zone` is optional and
stays optional: every drop already in a ledger has none, and neither does one looted before the log
had said where you were.

**One component says where, everywhere.** `ZoneTag` takes the recorded wording and renders the
**place** (`placeName`) as a `ZoneLink`, with the **difficulty** (`zoneDifficultyLabel`) beside it as
its own chip. The recorded string goes in the hover, and only when the fold changed it — a fold is a
claim that two names are one camp, and the row it was made about should be able to show its working.
`ZoneDifficultyTag` is the difficulty alone, for a list that is already one camp.

Applied: the Loot tab gains a **Zone** column, a zone **filter** and a zone **sort**; the Damage tab
tags history rows, the picked fight, and the live fight/session with where you are; the records board
tags each personal best; the map's kill rows carry the difficulty they were recorded at; and the
status bar — the app's one always-visible "where am I" — reads the same way as every row.

**The zone filter holds a place, not a wording.** Its options come from `lootZones`, which folds the
ledger through `placeName`, so one option covers `Blackburrow`, `Blackburrow 3` and
`The Blackburrow 1 (Awakened)`. Built from the raw strings it would have offered three camps where
the game has one, which is no filter at all. A drop with **no** zone matches no place: unknown is not
everywhere.

**Live windows say where *you* are, and say so.** A stored fight carries its own camp. "This fight"
and "Session" have none — so the tag names the current zone, and its hover states that a session can
span camps rather than letting one name stand for a whole evening.

Rejected alternatives:

- **Derive a drop's zone from the kill it came off.** `killLog.noteLoot` already ties a drop to a
  corpse, so some of them could be placed for free. It covers only drops with a corpse — a sale or a
  combine has none — and it makes the ledger's answer depend on the kill log's retention. Stamping is
  one line and always right.
- **Put `zone` on `LootEvent` itself.** Fewer types, and it makes a parsed *line* carry a field no
  line contains. `LootRecord` keeps "what the log said" and "what we filed" apart, which is the
  distinction every other record here already draws.
- **Backfill the existing ledger from the kill log.** Tempting, and it would invent a zone for drops
  whose real one is unknowable. A blank that says "the log hadn't said" beats a plausible guess.
- **Split camps by difficulty in the per-zone report.** `CampReport` pools every difficulty of a camp
  into one row and still does. That pooling is a separate decision from *showing* the difficulty on a
  row, and un-pooling it would thin every camp's sample; ADR 0057's split already lives where it
  belongs, in the per-mob observations.
- **Print the recorded wording and leave it at that.** What Damage did. It is the most faithful and
  the least readable, and it makes two rows about one camp look like two camps.

## Consequences

- The Loot tab can answer "what did this camp give me", which it could not before at any price.
- **Only going forward.** Drops already in the ledger have no zone and never will; they show `—` and
  are not offered by the zone filter. The column fills in from the next drop onward.
- Every panel that says where something happened now says it the same way, so a camp reads
  identically in the ledger, the fight list, the scoreboard and the status bar.
- `LootEvent` → `LootRecord` widened `loot.recent`, `loot.onEvent` and the loot filters. `mergeLootFeed`
  became generic over the row, since a drop's identity is still its log line.
- An unknown zone sorts after every camp, so it leads when the sort is flipped. Deliberate: pinning it
  to one end regardless of direction would make this the only column in the app that ignores its arrow.
- The difficulty chip appears only when there is one, so an ordinary zone shows nothing rather than a
  blank that reads like a missing value.
