# 0222: A race unlock guide is generated static data

## Status

Accepted

## Context

The user asked to bring [Alanna's Race Unlock Guide](https://eqlwiki.com/User:Alanna/Alanna%27s_Race_Unlock_Guide)
into the Faction tab: which factions each of the sixteen races needs maxed, the quests that raise
them, and how close the player's own ledger has actually gotten — plus an opt-in alert when a watched
race's faction moves.

This is a different kind of wiki source from anything the app already reads. `specs/wiki-data/README.md`'s
Non-responsibilities section is explicit: item/quest/recipe/faction data is fetched at runtime and
cached (ADR 0003), with exactly one carved-out exception — the zone facts under `src/shared/zones/`,
because they're fetched off a *uniform* MediaWiki infobox template and change essentially never. The
per-faction pages this app already parses (ADR 0192, `.eql-factionpage`) are the same kind of uniform
template, and they name **no point values at all** — direction only, by the wiki's own design.

Alanna's guide has no template behind it at all. It's one person's hand-maintained `User:` namespace
page — prose, wikitext tables, and a lot of freeform detail — and it's the *only* place on the wiki
that states actual faction-point deltas per quest. Two real constraints followed from that:

- **It has to ship as data, not be fetched live.** A generic prose page can be reformatted by its
  author at any time in a way nothing here can predict, and this app has no existing pattern for
  parsing an *arbitrary* hand-written page — only uniform templates. Fetching it at runtime would mean
  a parser silently breaking inside a shipped app the next time Alanna edits a paragraph. Confirmed
  with the user: ship it as committed, generated data instead, the same category the zone facts
  already are, so a reformat shows up as a diff to review before it ships, not a runtime failure.
- **The parser has to fail loudly, not softly.** Nothing else re-checks this data against the live
  game, so a bad regen has to be impossible to commit by accident. Checked against the guide's real
  wikitext directly (fetched via the API, not guessed from the rendered page) before writing a single
  regex — the same discipline this app already holds every parser to (`specs/log-watching/README.md`;
  ADR 0219/0220 for the same reason inside this same faction feature).

Reading the real wikitext also settled how deep to parse it. The guide is regular in two places (a
race's required factions, and its recommended method's numbered steps) and irregular in a third
(faction-point breakdowns are `* Faction Name +5`-shaped bullets, but scattered under headings that
vary in depth and sometimes repeat mid-paragraph with no new heading between them) and very irregular
in a fourth ("Alternative Methods", which mixes prose, nested sub-quests and nothing that says how to
tell one turn-in's numbers apart from the next reliably). Two races don't fit the "maximize factions"
shape at all: Half Elf unlocks by having Human or Wood Elf already, and Kerran by completing a task,
not a faction grind.

## Decision

- **Shipped as committed, generated data** — `scripts/fetch-race-unlocks.mjs` (using the existing
  MediaWiki client, `scripts/lib/eqlwiki.mjs`) writes `src/shared/race-unlocks.generated.ts`, exactly
  the "generator script → committed file, hand-written lookup beside it" shape the zone facts already
  use. `npm run factions:unlocks` re-runs it; `--dry-run` previews the diff without writing, matching
  the existing zone scripts' convention.
- **Only the structurally regular parts are parsed**, by `scripts/lib/race-unlocks-parse.mjs`: each
  race's required factions (`kind: "factions"`, or `"prerequisite-race"` for Half Elf /
  `"task"` for Kerran — a discriminated union rather than optional fields on one shape, since the
  three requirement kinds have nothing in common to default), its recommended method's numbered steps
  and the quests/items/NPCs they link to, and every `Faction ±N` bullet block found underneath,
  **grouped by the guide's own nearest heading and never merged or summed across groups** — two
  turn-ins under one race can name the same faction with different numbers because they're
  alternatives to each other, not additive (Halfling's Pickclaw vs. Runnyeye goblins is the clearest
  real case). "Alternative Methods" is not parsed at all; the guide page itself is one `ItemLink`
  away for that detail, rather than a second, staler copy of it living in this repo.
- **The parser throws, by name, on anything that doesn't fit** — a race with no faction-point
  breakdown despite needing factions maxed, a "Requirements" section matching none of the three known
  shapes, fewer race sections than expected. `fetch-race-unlocks.mjs` turns that into a non-zero exit
  naming exactly what broke, so a bad regen cannot be committed without someone reading the error.
  `electron/tests/race-unlocks.test.ts` is the second net: a review the *committed* file has to pass
  too, the same role `zone-gazetteer.test.ts` plays for the zone gazetteer, for the cases a hand edit
  or a merge conflict could slip past the generator's own guard.
- **Joined against the live ledger at render time, never baked into the generated data**:
  `src/shared/faction-unlock-progress.ts`'s `computeRaceUnlockProgress` folds `RACE_UNLOCKS` onto
  `FactionStanding[]` by faction name. Surfaced as a third view on the Faction tab
  (`RaceUnlocksView`, `FactionPanel`'s "Race Unlocks" segment) — the one view not gated behind "any
  hits recorded yet", since it's reference data and useful on a fresh install.
- **Never claims "unlocked".** `FactionStanding.net` is what this app has *observed change* since it
  started watching a character's logs, not the character's lifetime faction total — a character can
  start above or below zero with a given faction from race/class/deity modifiers alone, which nothing
  here can see. So `computeRaceUnlockProgress` reports `net`/`remaining` as informational movement
  toward the guide's stated `+2000` target, and the opt-in alert (`RaceUnlockAlerts`, watched per race
  via a star on `RaceUnlocksView`, toast via the existing `showToast` bus) only ever reports "this
  faction moved," never a threshold crossed or a race unlocked. This is the same discipline ADR 0219
  holds a *guessed cause* to, applied here to a *guessed total*.

## Consequences

- A second generated-static exception now exists alongside the zone facts, both documented in
  `specs/wiki-data/README.md`'s Non-responsibilities. The rule stays narrow: this is for a page that
  is *itself* hand-authored and irregular, not a reason to start generating item/quest/recipe data
  that already has a working runtime-cache path (ADR 0003).
- The data goes stale the moment Alanna edits the guide, until someone runs `npm run factions:unlocks`
  again and commits the diff — no CI schedule regenerates it automatically. Re-running is cheap and
  the script says plainly what changed; automating that further is future work, not asked for here.
- A reader who started tracking mid-grind sees a progress bar that understates their real standing,
  and the UI's own copy says so rather than presenting a false percentage. Nobody should read "0/2000"
  on this view as "you have zero faction" — only as "this app hasn't watched this faction change yet."
- "Alternative Methods" detail lives only on the wiki page itself; a reader who wants it clicks through
  via `ItemLink`. If a race's *recommended* method ever turns out to be worse than its alternatives,
  that's a fact about the guide, not something this feature can correct or flag.
