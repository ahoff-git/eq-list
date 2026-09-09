# 0214: A counted criterion tallies matches to a threshold, and a cast criterion is always yours

## Status

Accepted

## Context

The first achievements built under [ADR 0212](./0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md)
were all single-fire: a criterion is either satisfied or it isn't, the moment one matching event
lands. "Kill 25 hill giants" doesn't fit that shape — it needs a running count compared against a
threshold, which no existing criterion kind carries. Building it as 25 separate `"watch"` criteria
("Hill giant kill #1", "#2", …) would work mechanically but reads as absurd on the tab and would
banner 25 indistinguishable rows.

Separately, verifying "Rez someone" against the real matcher surfaced a scoping gap. `matchCast`
(`cast-alerts.ts`) exists to warn about **threats** — it fires on an ordinary mob's cast by default
and only fires on the player's own cast when `includeSelf` says so, which is a **global alert
setting** the player controls for a completely different feature (dispel-prep warnings), not
something an achievement should be at the mercy of. Worse: even forcing a synthetic watch's own
`includeSelf` to `true` doesn't close the gap on its own — `matchCast`'s "not self" branch passes an
**ordinary mob's** cast through unconditionally (that's the feature working as designed for alerts),
which would let a mob happening to cast a similarly-named spell nearby satisfy an achievement that is
supposed to be about something the player did themselves. An achievement is never about a mob's cast
or a bystander's, so this needed closing before "Rez someone" could ship honestly — and the same
audit is why every kill-line criterion in this batch is built on `"You have slain <name>!"`
specifically rather than the log's other kill sentence, `"<name> has been slain by <killer>!"`, which
names *whoever* got the kill and is exactly the sentence a bystander's or a groupmate's kill would
produce.

## Decision

**A `"count"` criterion kind** — `{ kind: "count", watch: AchievementWatch, count: { atLeast: number } }`.
The matching half is identical to `"watch"` (same `AchievementWatch` shape, same reuse of
`matchCast`/`matchFade`/`matchLine`); what's new is what the tracker does with a match. Each one
increments a per-criterion tally on `AchievementProgress` (`tally: Record<string, number>`, absent or
0 meaning never matched) rather than marking it done outright. Crossing `count.atLeast` moves the
criterion into `done` exactly like every other kind, so `isComplete` and the completion cascade need
no special case for it. Below the threshold, each increment still raises a quiet progress banner
naming the running count ("14 of 25") through the same `AchievementAlertPayload` a criterion banner
already uses, with `tally`/`tallyGoal` riding alongside — the achievement's own `done`/`total` fields
stay in the payload too, but the overlay renders the tally instead of them when both are present,
since "0 of 1 criteria" reads as nonsense next to "14 of 25 hill giants."

**A `"watch"` or `"count"` criterion built on a *cast* is scoped to the player's own casts,
unconditionally, regardless of the player's alert `includeSelf` setting or `matchCast`'s own
mob-passthrough.** `electron/achievement-tracker.ts`'s `combat()` hook only ever offers a `"cast"`
event to the achievement matchers when `event.caster === SELF` — a hard gate before `matchCast` is
called at all, not a flag `matchCast` is trusted to enforce. The synthetic watch a cast/count
criterion builds (`achievement-progress.ts`'s `criterionWatch`) additionally hardcodes
`includeSelf: true`, so a genuinely-self cast is never rejected by whatever the player's own alert
settings happen to be — the two together mean an achievement criterion answers exactly one question,
"did *I* do this", never "did anything nearby do this." Nothing about raw-line (`"onLine"`) matching
needed a parallel fix: `"You have slain <name>!"` and `"<name> has been slain by <killer>!"` are
different sentences the log already keeps apart, and every kill-line criterion in this batch is
built on the first.

**A `"zone"` criterion is matched with `placeKey` (`zones/place.ts`), not a bare `zoneKey` fold.**
`placeKey` runs a raw zone name through the same resolver (`createZoneResolver` with the curated
alias table, `typo: true`) that kill-log grouping and mob-knowledge pooling already trust for "is
this the place I mean" — a strict `zoneKey` fold only survives an exact-modulo-case-and-difficulty
match, and would silently never fire for any zone whose gazetteer name and in-game arrival text
diverge by more than that. Checked against the current gazetteer, most zones don't have this gap —
but "RunnyEye Citadel" does: the live zone-arrival line reads `"The Liberated Citadel of Runnyeye"`,
which `classifyZoneLine` itself currently calls `"unresolved"`, so **no criterion referencing this
zone can complete live today, whatever key function compares it** — recorded in
[todo.md](../todo.md) as a gazetteer gap, since fixing it is squarely the zones/gazetteer area's own
process (ADR 0075/0076) and not an achievements concern. `placeKey` is still the correct choice for
every other zone: it is strictly more capable than the fold it replaces and costs nothing.

**Five new stock achievements, all built from real, verified data rather than guessed wording** —
two silly and easy to auto-detect, one silly and left `"manual"` on purpose, and three real ones
built on this exact game's own zone rosters and spell file rather than classic-EverQuest memory,
which turned out to be wrong more than once while researching this batch (Runnyeye is a goblin
warren here, not the gnoll dungeon an older game has under the same name):

- **Die** (`"watch"`, `onLine`, `"You have been slain by"`) — the exact sentence
  `log-watching`/`combat-parser.ts` already documents for the player's own death.
- **Drown** (`"manual"`) — no confirmed line exists anywhere in this repo's fixtures, wiki cache, or
  a real 52,000-line captured log used to research this batch. Guessing classic EverQuest's
  wording would be exactly the mistake this codebase's whole "one real captured line first"
  discipline (ADR 0121, ADR 0193, several `todo.md` items) exists to prevent.
- **Die from falling damage** (`"manual"`) — `"YOU were injured by falling."` is confirmed real
  (`ideas.md`'s own high-score research already found it, and the same log used here reproduces it
  verbatim), but it's the *damage* line and states no number; the log attributes fall damage as an
  ordinary `"non-melee"` hit, which is also the generic bucket for other untyped damage, so there is
  no sentence in evidence that uniquely says a death was *caused* by a fall rather than merely
  survived one. Left manual rather than risking a criterion that fires on the wrong kind of death.
- **Rez someone** (`"watch"`, `onCast`, trigger `"Resurrect"`) — the player's own installed
  `spells_us.txt` (read live, the same file `spell-file.ts` already parses per ADR 0080) confirms
  `Resurrection`, `Divine Resurrection`, `Blessing of Resurrection` and `Gift of Resurrection I/II`
  as real spell ids; `Resurrection Sickness` also exists but is a status effect applied *to* a
  target, never something a player casts, so it can't reach a `"begin casting"` line and the
  substring match is safe.
- **Kill all the named mobs in RunnyEye Citadel** (five `"watch"`/`onLine` criteria: Borxx, Sludge
  Dankmire, The Goblin King, Goblin Elite Guard, Goblin Warlord) — the zone's own wiki page NPC
  roster (`public/data/wiki-cache`, already-shipped cached data), filtered to the entries with no
  leading article, which is this codebase's own existing test for "named" (`isNamedCaster`,
  `hasArticle`). The common, articled trash on the same roster (`A Goblin Captain`, `Dazed goblin
  guard`, …) is deliberately excluded.
- **Kill King Xorbb** (`"watch"`, `onLine`, `"You have slain King Xorbb!"`) — confirmed real page
  title; the zone he's in (`Gorge of King Xorbb`) is a separate zone from RunnyEye Citadel, also
  confirmed against the wiki cache rather than assumed from name similarity.
- **Kill 25 hill giants** (`"count"`, `onLine`, trigger `"hill giant"` inside a `"You have slain"`
  line, `atLeast: 25`) — `hill giant` (and its `corrupted`/`tainted` variants) confirmed as real,
  actually-killed mob names in a live install's own `mob-knowledge.json`. The substring match is
  deliberately generous across variants, the same rule `goalWantsMob` already applies to a
  farming goal's mob target.

Rejected alternatives:

- **A pending-cast correlation map**, the same shape `cast-alerts.ts` uses to gate a shared land-emote
  on the player's own recent cast, to make "died from falling" detectable by correlating the damage
  line with the death line that follows it. Rejected as disproportionate for one achievement: it's
  real machinery for a real problem elsewhere (a busy camp's shared emotes), not something to build
  from scratch here when `"manual"` already exists for exactly this gap.
- **Fixing the RunnyEye Citadel gazetteer gap inline.** Out of scope: the gazetteer and its alias
  table are a separate, carefully-curated area (ADR 0075, ADR 0076) with their own process, and
  patching one entry as a side effect of an achievements change is how that table drifts from being
  trustworthy. Recorded in `todo.md` instead.

## Consequences

- `AchievementProgress` gains a `tally` field; a save file written before this ADR has none, so the
  tracker's loader defaults it to `{}` the same way older `Goal`/`GoalTemplate` records default a
  missing `mode` to `"target"` (ADR 0199).
- `AchievementAlertPayload` gains optional `tally`/`tallyGoal`; the overlay banner renders them
  instead of `done`/`total` when both are present, so a single-criterion counted achievement doesn't
  show a confusing "0 of 1" beside its own "14 of 25".
- Any future achievement built on a cast is *always* self-only by construction — there is no field
  that opts a criterion into also matching a mob's or another player's cast, on purpose. If that's
  ever wanted, it's a new, explicit kind rather than a flag on this one.
- "RunnyEye Citadel" is listed in `CURATED_ZONES` and therefore already a criterion inside the
  existing **Grand Tour** achievement (ADR 0212) — it inherits the same live-unreachable gap
  recorded in `todo.md`, fixable only by the gazetteer, not by achievements.

## See also

[0212](./0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md) ·
[0027](./0027-only-your-kills-count.md) ·
[0075](./0075-a-zone-s-misspelling-is-the-same-zone.md) ·
[0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md) ·
[0080](./0080-the-game-s-own-spell-file.md) ·
[0193](./0193-a-faction-alert-rides-the-existing-line-watch.md)
