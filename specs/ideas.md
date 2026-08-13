# Ideas — features for later

Things worth building that **nothing is waiting on**: each is decided enough to start, small enough to
describe, and none of them is next. They live here so [todo.md](./todo.md) can stay a short list of
work actually in flight, and so an idea keeps the reasoning that made it worth writing down.

Three neighbours, so an item lands in the right one:

- [todo.md](./todo.md) — open work: a bug, or a decided change someone means to make.
- **here** — a feature nobody is blocked on.
- [decisions/README.md](./decisions/README.md) `## Open Questions` — anything that needs *deciding*
  before it can be built. An idea that turns out to be a question belongs there, not here.
- [testing/manual-qa.md](./testing/manual-qa.md) — built, but never run for real.

Move an item **out** of this file when work starts on it, and delete it when the thing exists (the
outcome goes in an ADR, a README, or the code — never here).

## Kills, mob knowledge and the heatmap

- **The `/loc` nag.** The load-bearing piece of the heatmap: a real 13,000-line log yielded 323 kills
  and **six** positions worth believing, because `/loc` was typed nine times across several evenings.
  Ask for one when the camp looks to have changed — the `AskValue` pattern
  ([ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md)) fits — and the map fills in.
- **Retro-scoring a kill's position.** Confidence is fixed when the kill is recorded, but the evidence
  is stored ([ADR 0023](./decisions/0023-kill-heatmap.md)) — a later `/loc` close to the earlier one
  could raise confidence for the kills in between, which is exactly the "they can only go so far so
  fast" argument the score is built on.
- **Spawn points, not just roam areas.** A roam area is the centroid and spread of where a mob died.
  With enough fixes, clusters would separate individual spawn points from a wandering path. The data
  is already stored; this is an analysis question, not a collection one.
- **Group-mates' kills.** A group-mate's killing blow is indistinguishable from a stranger's in the
  log, so those kills only count towards a drop rate once you loot the corpse
  ([ADR 0027](./decisions/0027-only-your-kills-count.md)). Telling them apart means knowing who was
  damaging the mob, which the kill log can't see and the damage meter can
  ([ADR 0067](./decisions/0067-the-meter-counts-your-party-s-fights.md) already reads the roster).
  Worth doing if grouping turns out to be common; it needs the two trackers to talk.
- **Mark undocumented drops in the 📖 panel too.** The Hunt tab reconciles wiki claims against your
  kills ([ADR 0025](./decisions/0025-observation-over-the-wiki.md)); the map's mob panel and a mob's
  own page show observed rates but don't yet say which of them the wiki has never heard of — the most
  interesting row on either screen. Same module (`drop-truth.ts`), one more lookup.

## Travel

- **Ask from the other windows too.** The 🧭 panel ships in the map window
  ([ADR 0062](./decisions/0062-a-travel-graph-of-zone-lines.md), [travel](./travel/README.md)), and
  `api().travel.route` is available to any of them. The two that would want it: the **Hunt tab**,
  which already points at zones you'd travel to ("how far is that camp?"), and an **item's drop
  zones**, where "who drops this, and where" stops short of "and how do I get there". Both are a call
  and a line of UI; the open part is where a distance belongs without turning a list into a route
  planner.

## Loot, list and the meter

- **An ignore list, and a highlight worth the name.** The Loot tab's split views, filters and sortable
  columns ship ([ADR 0058](./decisions/0058-a-ledger-needs-filters-and-a-column-to-sort-by.md)), and
  the only highlight rule is still "on your shopping list". Two things left, both filter questions
  rather than new mechanisms: an **ignore list** (trash you never want to see again — persisted,
  unlike the per-window filters), and the broader rule **"used by a quest in my level range in this
  zone"**, which needs the wiki's quest data per item and a level to compare against.
- **Split the meter by mode by default.** The per-stance / per-invocation data is already tracked and
  shown on hover ([ADR 0020](./decisions/0020-split-by-stance-and-invocation.md)). Some players will
  want those as real rows all the time — a Settings toggle, no new data needed.

## Zones

- **The gazetteer's `region` field is unread.** Every zone in
  `src/shared/zones/eql-classic-zone-maps.json` says which continent it's on — Odus, Antonica, Faydwer,
  the Planes ([ADR 0076](./decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)) — and nothing
  looks at it. Two plausible readers: the **zone picker**, which sorts by family (`sortingStr`) and
  could group by continent instead of listing 130 files alphabetically; and
  [travel](./travel/README.md), where "these two zones are on different continents" is exactly the
  fact that makes a route need a boat, and is currently only implied by the graph having no edges
  between them. Worth having in mind before either grows its own continent list.

## Talking to the app from inside the game

- **A private chat channel as a command line — a maybe, logged because it's the best idea we've seen
  from anyone.** The problem it solves is the one under *The `/loc` nag* above and under every
  click-through toggle we ship: while the game has focus, the app is read-only furniture. You can't
  ask it anything without leaving the game.
  **eql-log-reader**'s answer (in `eql_atlas.py`; see [neighbours.md](./neighbours.md)) is to make the
  log an **input** as well as a source. You `/join` a password-protected channel only you are in, and type
  `/1 find batwing` in game; the tool reads your own words back out of the log and answers on the
  overlay. Their verbs are `find`, `guide`, `quest`, `zone`, `note`, `clear`, `help`; ours would be
  smaller and obvious — add an item to the list, ask who drops one, drop a note, and whatever finally
  makes `/loc` cheap.

  Their safety model is the part worth copying intact, and it's better than it first sounds: **only
  `You tell <chan>` lines are ever parsed**, so the log itself authenticates the speaker and
  impersonation is structurally impossible rather than merely unlikely. Commands stay locked until a
  `/list` proves the channel has exactly one member, and anyone else speaking re-locks them instantly.
  Says, tells, group and public channels are never read. The password appears in plaintext in your own
  log, so the setup instructions have to say *throwaway password, one channel per character* in those
  words.

  Why it's a maybe and not work: it asks the player to do real in-game setup before anything happens
  (`/join`, `/autojoin`, confirm with `/list`), and it depends on chat timestamps being on, which we
  don't currently require. That's a big ask to justify for a shopping list — it earns its keep once
  there's enough to *ask* the app that leaving the game to do it is the annoyance. Worth revisiting
  when the map, hunt and travel panels have accumulated that much.

## Wiki data

- **The spell file's other columns.** Damage per mana is done
  ([ADR 0080](./decisions/0080-the-game-s-own-spell-file.md)) and reading `spells_us.txt` brought
  three more fields with it that nothing consumes yet: **cast time**, **recast time**, and
  **per-class levels**. The first is the interesting one — we *measure* cast time from the log
  already, so having the file's stated figure beside it turns a number into a comparison ("your 2.5s
  nuke is taking 3.1s") which is the shape of a real finding about haste or interruption. The last
  would let anything that asks "can this character even cast that" answer honestly. All three are
  already parsed; the open part is what a UI does with them.
- **Ask-the-user, applied elsewhere.** `AskValue` +
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md) established the pattern (hover
  for why, click to fill in) and it now backs two figures: experience into the level, and maximum
  health. Worth a look for other gaps — resist-rate targets? gear goals? — rather than inventing new
  one-off inputs for each.
