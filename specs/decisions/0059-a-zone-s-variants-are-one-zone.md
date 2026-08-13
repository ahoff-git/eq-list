# 0059: A zone's variants are one zone

## Status

Accepted — the `keyOf` third of the decision below is **superseded by
[0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)**, which moves that fold from the
stored key to the read. "One Steamfont is one camp" stands; it is now grouped when the data is read
rather than folded when it is written, because `keyOf` also keys what gets *stored* — which this ADR
described as a question rather than storage, and which it wasn't.

## Context

EQL opens a zone at a difficulty and under a ruleset, and writes both into the name it puts in
the log: `You have entered The Steamfont Mountains 2 (Adaptive).`

[ADR 0057](./0057-a-grade-is-not-an-identity.md) established the right rule for this — a number
that describes *this copy* of a thing is not part of its identity, so it folds away wherever names
are matched — and applied it to the wiki, the map lookup and the shopping list. But it drew the
line at the kill log, deliberately:

> **Difficulty is preserved by not folding anything else.** The current zone, kill records,
> per-zone reports and pooled mob observations all keep the log's wording, so a mob's rates at
> difficulty 3 are a separate sample from the same mob at difficulty 1.

That reasoning was made without the feature in front of us — 0057 says so itself: *"the
zone-difficulty spellings are inferred rather than observed: no zone line in the sample log carries
one."* With real lines to look at, it doesn't hold:

- **There is one Steamfont, and one map of it.** The zone's geometry is a file on disk; nothing
  about difficulty moves a wall or a spawn. A kill at difficulty 2 happened at a real place that
  the ordinary map draws, so leaving it out of that map's heatmap loses a true fact about where
  the mob lives. The map asks the kill log for `Steamfont Mountains` — the name its *file* has —
  and every kill of an evening spent at difficulty 2 was invisible.
- **Splitting the sample is the expensive half of the trade, and it bought nothing.** A drop rate
  is only worth reading once the sample is big enough (~15 kills before an observed rate leads,
  [ADR 0025](./0025-observation-over-the-wiki.md)). Cutting one camp's kills across two or three
  difficulty settings is the surest way to keep every rate below that bar forever, and 0057's
  own consequence conceded it: *"a sample takes longer to become believable in a zone you play at
  more than one difficulty."*
- **The split isn't even reliably a split.** The number is on the *zone*, not the mob. Nothing
  says the ruleset changes a loot table; what it changes is what the mobs hit for.

## Decision

**A zone's difficulty and ruleset variants are one zone wherever a kill is filed or found.** This
is 0057's rule carried through rather than a new one: fold where names are *matched*, keep the
log's wording where the log is *recorded*.

`sameZone(a, b)` (`src/shared/sources.ts`) is the one test — exact equality of `normalizeZone`,
which now strips the ruleset tag as well as the number. Deliberately **not** `zoneMatches`, whose
loose containment is right for meeting the wiki halfway on a name it spells differently and quite
wrong for keying: `commonlands` sits inside `east commonlands`, so a query for one would answer
with the other's kills.

It is applied at three places, all of them questions rather than storage:

- `killLog.kills(zone)` — so the map's own name for a zone reaches every variant's kills.
- `mobKnowledge.forZone(zone)` — the same, for the 📖 panel.
- `keyOf(mob, zone)` in `mob-stats.ts` — so observations tally as one sample.

Folding at the **key** rather than at write time is what makes this retroactive and
version-tolerant: tallies already retired under a decorated name, and a peer's sent by a build
that never folded, merge into the same entry with no migration and no counts lost.

An **observation** is named with `zoneBaseName`, not the first spelling seen. It now pools every
variant, so labelling it with whichever door happened to come first would misdescribe its own
sample. A **kill record** keeps the log's full wording, exactly as 0057 said: the fold is in the
question, not the answer.

**One comparison stays verbatim: which `/loc` fixes can place a kill.** Stepping from Steamfont 2
to Steamfont 3 is the same teleport as any other zoning — you arrive at the zone-in point — so the
fix taken on the other side is wrong in precisely the way that guard exists to catch. It's the one
place the two names mean different things, and it's commented as such.

Rejected alternatives:

- **Folding when the zone event is parsed.** Cheapest, and it destroys the difficulty everywhere
  at once — the status bar, the kill list and a camp's history all legitimately want to say
  "Blackburrow 3". This is the alternative 0057 already rejected for grades, for the same reason.
- **Folding only for the map, leaving observations split.** Half the change, and incoherent: the
  same kills would be one heatmap and two drop rates.
- **Keeping the split and having the map query every variant.** Pushes the fold outward to every
  caller, which is how `findZone` came to carry its own near-copy of `normalizeZone` before 0057
  removed it.

## Consequences

- The paragraph of 0057 quoted above no longer holds for the zone. The rest of 0057 stands
  unchanged — item grades, the fold at the wiki and the list, and the principle both ADRs share.
  0057 keeps its `Accepted` status because its other half is still the governing decision.
- Rates in a zone played at several difficulties become believable roughly N× sooner, and a camp's
  heatmap shows every evening spent there.
- If a ruleset does turn out to change a loot table, this pools two genuinely different samples
  and neither can be recovered from the observation (the *records* still carry the full zone name
  until they age out, so a future split would work on new data only). That's the bet: an
  unreadably small sample is a certain cost, and this is a possible one.
- `zoneDifficulty` / `zoneMode` still read the numbers off a name, so a camp comparison that wants
  to group by difficulty can — from records, and from the log's own wording, which is kept.
