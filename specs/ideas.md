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
- **A placeholder cycle, named as one.** *Camping* one is no longer blocked on this: a camp can be
  told it cycles, and each kill starts a clock of its own
  ([ADR 0135](./decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)). What is
  still unbuilt is the app **knowing** that several names share one point — so that killing the
  placeholder starts the named's clock, and the named is a chance on each pop rather than the thing
  being timed. Without it, a named on a cycle is still timed by the gap between two kills of the
  *named* — the cycle length times however many pops it took, which shows up as gaps that disagree
  with each other ([ADR 0094](./decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md) reports
  that rather than hiding it). `timerKey` is still the seam. What it needs first is a way to *know*
  which names share a spawn, and that is the hard half: guessing it from co-located kills is exactly
  the kind of inference those ADRs refuse to make without evidence, so the honest version is the
  player saying so — a small UI and no cleverness at all.
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

## More high scores

The scoreboard ships with thirteen categories and two families
([ADR 0093](./decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md)). These are the ones a
sweep of a **real 228,000-line log** (three weeks, levels 2–21, 1,711 kills) turned up afterwards, each
with the figure that log actually holds — so "would this ever fire, and is the number interesting" is
answered before anyone builds it. Every one of them passes ADR 0093's own two tests: it needs a floor,
and it must not be permanently owned by your first hour.

- **Most targets hit by one cast** — *observed max 6 (Fingers of Fire), 247 casts hit more than one.*
  The best-motivated of the lot, because the app has already written the insight down twice: the log
  spells an area spell as **one line per target**, which is exactly why `damage-tree.ts` has an
  Abilities layout ([ADR 0053](./decisions/0053-damage-is-cells-rolled-up.md)). `biggest-nuke`
  therefore *cannot* see a big AoE — it only ever sees one target's share. Group landings by
  (spell, second), floor of 3.
- **Biggest single cast, all targets together** — *observed max 296 over 4 targets (Project
  Lightning).* The other half of the above, and it needs one piece of care or it's redundant: count
  only casts that hit **2+ targets**, or the record is just `biggest-nuke` again (which stands at 755
  single-target, and would win for ever).
- **Most kills in one hour** — *observed max 113.* A rolling window, so it wants the kill streak's
  crossing rule rather than the plain comparison — it beats itself on every kill while it leads. Says
  something `fight-kills` can't: what a camp's *peak* was, not one pull's.
- **Longest time alive** — *observed 7.5h of play between deaths.* The kill streak's twin: same reset
  (your death, and nothing else), different unit, and it must count only time with combat in it or
  the record is "longest away from the keyboard". Nearly free, since `noteDeath` already exists.
- **Biggest 10-second burst** — *observed 1,466 damage.* `fight-dps` averages a whole fight and hides
  a nova; this is the nova. The data is already banked per fight in `yourPerSec`.
- **Richest single corpse** — *observed 5,074 copper, over 1,585 corpse-coin lines.* Complements
  `fight-coin` the way `biggest-hit` complements `fight-damage`, and `parseCoin` already reads it.

Two are worth having but are **not scores**, and that's the interesting part — they're moments with no
number, which the board has no shape for yet. Worth deciding (see decisions/README `## Open Questions`)
whether a celebration can exist without a figure to beat:

- **Knocked out and lived.** `You have been knocked unconscious!` fired **26** times and **4** of them
  were *survived* — the fight simply carried on with no `slain` line. Rare, unambiguous, and the best
  story in the log. It has no magnitude, only a fact.
- **A named killed.** 27 distinct named-looking kills (Tranixx Darkpaw, Minotaur Lord, Abomination of
  Ro). Pairs with the spawn timers
  ([ADR 0092](./decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)), which already
  has to decide what a named is.

And four the same sweep says to **refuse**, recorded so they aren't proposed again:

- **Fastest level.** EQL levels are **per class** and the log's level line names none. `Welcome to
  level 11!` appears **four separate times** and the sequence runs `… 19 20 21 13`, because an
  achievement line beside it reads `Primary Class Unlock - Wizard`. Level is not monotonic here, so
  neither a "fastest" nor a "highest" can be read from it. *(This may also mislead
  `xp-progress.levelUp` and `hp.levelUp` — see [todo.md](./todo.md).)*
- **Biggest single XP gain.** Max 11.000% on the second day, unbeaten in the three weeks since — the
  fastest-kill failure ADR 0093 already refused. Survives only because the multi-class reset keeps
  XP-per-level percentages from decaying (mean stayed 1.8–3.9% throughout), which is luck, not design.
- **Biggest fall damage.** The log says `YOU were injured by falling.` and states **no number**.
- **Longest run of swings without a miss.** Measured at 562, which is implausible enough to be an
  artifact of concatenating sittings — and it rewards hitting weak things, which is the opposite of
  a record.

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
  ([ADR 0080](./decisions/0080-the-game-s-own-spell-file.md)) and permanence is now read off the
  duration formula ([ADR 0140](./decisions/0140-a-buff-is-watched-until-it-lapses.md)), which leaves
  three parsed fields nothing consumes: **cast time**, **recast time**, and **per-class levels**. The
  first is the interesting one — we *measure* cast time from the log already, so having the file's
  stated figure beside it turns a number into a comparison ("your 2.5s nuke is taking 3.1s") which is
  the shape of a real finding about haste or interruption. The last would let anything that asks "can
  this character even cast that" answer honestly — though note the level it would need comparing
  against is the one EQL's log refuses to state (see *Fastest level* below), so the honest version of
  that question needs the player to say what they are.

  The **duration figure** (index 12) stays deliberately unread beside its formula. Turning the two into
  a number is server-side logic and needs a caster level, which is the whole argument ADR 0140 makes for
  showing no countdown; nothing changes that until the level does.
- **Ask-the-user, applied elsewhere.** `AskValue` +
  [ADR 0017](./decisions/0017-camp-efficiency-and-asking-the-player.md) established the pattern (hover
  for why, click to fill in) and it now backs two figures: experience into the level, and maximum
  health. Worth a look for other gaps — resist-rate targets? gear goals? — rather than inventing new
  one-off inputs for each.
