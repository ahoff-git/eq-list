# 0383: An achievement the game already awards is not ours to repeat, a line criterion reads the game's own sentence, and a count says nothing until it finishes

## Status

Accepted

## Context

[ADR 0212](./0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md) shipped the app's
own achievements before the app read the game's. EverQuest Legends has a full system of its own —
the Achievements window, `/outputfile achievements` (which the Exports tab already parses), and a
`You have completed achievement: <name>` log line — and replaying the author's real log (1.15 M lines,
Jul–Nov 2026) through the tracker showed how far the two overlapped, and what that cost:

- **Duplicates.** Of 37 stock achievements, 24 restated one the game awards. Grand Tour (zone
  Explorer/Traveler), the seven "Friend of …" race unlocks (the game's `Race Unlock - X` has the same
  faction objectives), Half Century (`Level 50`), Craftmaster (the tradeskill tiers), Rat Killer and
  Eight Legs Are Better Than One (borrowed from the game by name), the eight "kill 50 of a race"
  achievements (the game's Slayer: Skill, at 100), Beanstalk Problem (`A Small Giant Problem`),
  Citadel Cleared / Royal Execution (the game's per-zone `Hunter of …`, where King Xorbb is one
  objective), and Achievement Hunter — a tally of the game's own `You have completed achievement:`
  lines, so every one of its progress banners followed the game's own banner for the same thing. A
  player saw each twice, on two different counts — and the game's was the real one.
- **Wrong, not just redundant.** Craftmaster, "Max out any one tradeskill", completed at `Tinkering
  (50)`, the *first* of six tiers. Every one of the 42 kills that tallied "Kill 50 Iksar" was a generic
  `skeleton`, because the wiki page for `skeleton` states its race as `Iksar Skeleton` and `isRace`
  matches by substring; `Erudite Ghost` counted as an Erudite and `Clockwork Gnome` as a Gnome.
- **Spurious.** Replayed, the log completes Half Century on `Ramada tells General1:2, 'You have
  gained a level! Welcome to level 50! woohoo!'` — another player's chat, while the character was
  level 45. A line criterion was a *substring* of the line, and the log writes everyone's chat. (The
  same could happen to First Blood, Oops, Persona Non Grata and The Long Road.) `watch-library.ts`
  learned this for tells (`TELL_LINE`) and wrote it down.
- **Too frequent.** A counted criterion banners on every step (ADR 0214): 42 banners for one Iksar
  count, 20 for erudites, 19 for spiders, 62 for Grand Tour's zones — 200 banners in the whole log,
  against five real events once the above is fixed.

## Decision

**The app does not ship an achievement the game already awards.** The test is "would the game's own
list show this?", asked against the player's `<Character>_<server>-Achievements.txt`; `achievement-library.ts`
says so in its header, so the next author asks it first. What stays has no in-game twin: the scoreboard
ones (a 500-damage hit, a five-minute fight), the silly ones (die, drown, fall, rez, feign death,
mesmerize), burning a faction to the floor, level 60 (the game's list stops at 50), Level 50 with every
class, and Say Hello. Twenty-four are removed and thirteen remain; the saved progress of the removed
ones is left in `achievements.json`, where nothing reads it, rather than deleted.

**A stock raw-line criterion is read from the start of the line** — `systemLine(starts, ends?)`, built
on the existing `starts`/`ends` condition operators (case-insensitive, no regex, so nothing for
[ADR 0203](./0203-a-regex-condition-refuses-its-own-danger.md) to guard). The game's own sentences begin
with what they say; chat that quotes one begins with a speaker. A library test fails any stock line
criterion that is not anchored. A *custom* achievement keeps its substring semantics — the player
chose that text, and may want chat.

**A counted criterion gives no progress report — it banners once, when it finishes.** A kill count lands
a step every few seconds at a busy camp, and the Achievements tab already shows the running total to
anyone who wants it. Every step is still counted and saved; the tally in `achievements.json` is
unchanged. This replaces the "every step is news" rule in
[ADR 0214](./0214-a-counted-criterion-tallies-and-a-cast-criterion-is-always-yours.md). (A first cut
bannered at 25/50/75% of the goal, the cadence a farming goal uses; the player wanted no progress
banners for kills at all.)

**The tracker takes an optional `stock` list**, defaulting to the shipped library, so a test of the
machinery (a tally, a race kill) names its own definitions instead of depending on this month's
content. That is what lets the next pruning not break tests that were never about content.

Rejected alternatives:

- **Reconcile instead of remove**: tick an app achievement when the dump says the game's twin is done.
  Rejected — the app's count would still disagree with the game's, and the achievement would still
  banner twice.
- **Keep Grand Tour**, which covers zones the game's Travelers don't (Kunark, the planes' variants).
  Rejected: it is the same idea the game already runs, it was 62 of the 200 banners, and the game
  announces each zone itself at the same instant.
- **Keep the race-kill achievements and fix `isRace`.** Rejected: the game already has all eight, at
  100 kills, and counts by its own race table — which the app can only approximate from a wiki card.
- **Delete `raceKill` and `mob-races`** with the achievements that used them. Not done here: it is a
  sizeable generated table and an exported criterion kind that no shipped content now uses — recorded
  as an open question rather than removed unasked.

## Consequences

- A player's list loses 24 entries; any progress they had on them is gone from view (not from the file).
  Release note: Settings → What's new, line 0.6.
- A stock line criterion can no longer be completed by someone else's chat. Completions already
  filed stay filed.
- Counted criteria are silent until they finish: a 50-count raises one banner, on the 50th. The 🎉 toast
  on the control window was already completion-only (`AchievementAlertToasts.tsx`).
- `AchievementAlertPayload.tally`/`tallyGoal` and the overlay's "N of M" rendering of them
  (`CastAlerts.tsx`) are no longer set by anything. They are an exported shape, left alone here; a
  later change can drop them.
- `raceKill`, `matchesRaceKill`, `AchievementTracker.kill` and `mob-races.generated.ts` have no shipped
  user, and `isRace` still has the substring false positive above. They are tested black boxes and
  reachable only through an injected `stock`.
- A real-log replay through the compiled tracker is the check to repeat after any change to stock
  content: 200 banners before, 5 after, each of the 5 a true first.

## See also

[0212](./0212-an-achievement-criterion-can-watch-the-log-or-wait-to-be-told.md) ·
[0214](./0214-a-counted-criterion-tallies-and-a-cast-criterion-is-always-yours.md) ·
[0215](./0215-a-racekill-criterion-reads-the-wiki-s-own-mob-card.md) ·
[0216](./0216-an-achievement-is-quiet-during-a-replayed-gap.md) ·
[0198](./0198-a-goal-is-a-timeboxed-target.md) ·
[0203](./0203-a-regex-condition-refuses-its-own-danger.md)
