# 0303: A tradeskill guide follows your skill, your combines are a log, and success rates are shared

## Status

Accepted

## Context

[ADR 0302](./0302-tradeskill-guides-are-generated-static-data.md) shipped the tradeskill guides as
static data and noted that the tab tracked nothing about you. The user asked for the guide to be
"live": current values, the parts you've outgrown greyed out. Then for a combat-log-like record of
all your crafting, with your success rate for each craft at each level. Then for those success rates
to be shared with peers.

Read against a real 70 MB log before anything was built:

- **A skill-up states the new value**: `You have become better at Blacksmithing! (60)`. It's the only
  place the log states a skill, and every skill uses the one wording. The log held thousands of them
  (combat, casting, instruments), 59 of them Blacksmithing.
- **A combine states its result and its item, never its skill**:
  `You have fashioned the items together to create something new: Sheet Metal.` and
  `You lacked the skills to fashion Sheet Metal.` 398 such lines from one evening of smithing.
- **The game prints a skill-up before the result of the combine that earned it.** Two quick points
  can therefore arrive with the earning combine not yet written.
- **Most combines raise nothing.** Of the 398, 251 came after the evening's last skill-up: 143
  trivial Metal Bits, ore bricks made for later. Dividing all combines by all points gives 6.7
  combines a point. Counting only the combines that led to points gives 147 for 58, which is 2.5,
  the same as the guides' own 370-STR smith. The first figure was briefly reported as a finding in
  this conversation, and was wrong.
- **The live watcher pins a never-read log at its end** ([ADR 0030](./0030-history-is-not-news.md)),
  so on its own it would never see a skill reached before the app was installed. A skill is state,
  not news.

## Decision

**Two new line types** in `log-parser.ts`: `skillup` (skill, value) and `combine` (item, ok). Both
are tight anchors, placed in the matcher chain with the busier lines.

**Your progress is read from the log's history once, then followed** (`electron/skill-progress.ts`).
On start the active log is scanned in the background, a 4 MB chunk per turn of the event loop,
reading only lines that mention "better at" or "fashion". What's stored is "this file, read up to
byte N", and the next start reads on from N. That's the de-duplication: a timestamp can't tell a
repeat from a neighbour when a skill-up and its combine share a second. Live events go into a working
copy on top, only when newer than the scan's last line, and the next start's scan reads them for real.

**A combine is credited by its sitting** (`skill-progress.ts`, `crafting-log.ts`). A sitting is an
unbroken run of crafting with no gap over ten minutes, and it belongs to the tradeskill that skills
up in it. For **your pace**, only combines that led to a point count, and a skill-up inside a sitting
already being measured counts as a point even with no combine pending (the print order above). For
**the crafting log**, every combine counts. A sitting where nothing skilled up borrows the item's
tradeskill from any sitting that did, and its level from your skill-up history. A combine no sitting
ever ties to a skill (a quest combine) stays without one.

**The guide places each step against your skill** (`step-cost.ts`'s `placeStep`):
- a step you've passed is greyed and marked "trivial for you";
- the step you're in is marked "you · 60" and estimated for the points left;
- every combine range is scaled by **your pace relative to the model's** over the span you measured
  it on (`rateFactor`), so a slow crafter's ceiling rises at every level, not only the levels they've
  been through. A skill with no data of its own borrows the factor from your most-measured tradeskill.
  INT/WIS govern most of them alike, so that's a better guess than the guides' characters.

"+ List" on the current step presets its runs to the points left.

**The crafting log** is a second view in the Tradeskills tab, made of three shared grids
([ADR 0230](./0230-every-table-gets-a-column-menu.md)): sittings (newest first: skill, combines,
success, skill-ups), items, and **items by skill level**, which is the success-rate-at-each-level the
request asked for.

**Success rates are a new observation share kind, `crafting`.** What travels is the log's conclusion
only: per tradeskill, item and skill level, combines and successes, with the row's origin (`by`/`byId`)
like every observation kind ([ADR 0242](./0242-a-pooled-row-keeps-its-own-origin.md)). No times, no
sittings, nothing about the character. It is checked twice:
- on the wire (`readCraftRate`): whole numbers, `0 ≤ ok ≤ attempts`, a reachable level;
- again on filing (`electron/peer-crafting.ts`, `contributions.ts`'s five rules).

It's off until switched on, like every kind with anything of yours in it. The room's rates are added
up per item and level (`poolCraftRates`) and shown **beside** yours, in their own columns and their
own "The room" table, never mixed into your figures. Your success at a level is a fact about your
character, and a pooled one is a different fact. Forgetting a contributor forgets their rates too.

## Consequences

- Measured against the real log: your Blacksmithing pace is about the guides' (factor ≈ 1.0); the log
  holds 7 sittings, 399 combines, 84% success; Sheet Metal climbs from 2 of 7 at skill 43 to 9 of 9 at 46.
- `skill-progress.json` holds the scanned state per log file, crafting log included. A store written
  before the log existed is read again from the top once. The log keeps every combine, so a lifetime
  of crafting is tens of thousands of small records; if that ever weighs, it moves to SQLite on
  [ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)'s terms.
- A combine's level is read one high for the single combine whose result prints after its skill-up.
  Over a sitting it doesn't move a rate.
- The web build has no log: the guide shows without the "you" parts, the crafting log says so, and it
  offers no `crafting` rows.
- Not built: crafting rates don't feed the guide's estimates. A pooled "Sheet Metal comes out 60% at
  36" could become a cost multiplier (failed combines spend materials), and that would be its own
  decision.
