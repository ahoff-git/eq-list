# 0382: The shopping list counts what you hold

## Status

Accepted

## Context

A shopping-list row counted only what the log had seen drop since it was added, or what the player typed
(`obtained`). A player who already carried 651 Bone Chips was asked to farm 20; one who had them in the bank
had to open the dump and cross-check by hand. Everything needed to answer "do I already have this?" was
already in the app: the game's `/outputfile inventory` dump (read for the stats read, the loadout builder and
the race-unlock steps — [ADR 0322](./0322-a-race-unlock-step-knows-what-you-hold.md) already seeds a *new* row
from it), and the loot ledger, which carries a timestamp on every drop.

The model is EQBuddy's `SinceDump` (`src/EQBuddy.Core/InventoryFile.cs`, with `ItemsGainedSince` in
`SessionStats.cs`, read in the sibling checkout): the dump is a baseline, the log keeps it current — loot adds,
sells and destroys subtract, nothing goes below zero (selling something the dump never saw proves the dump
stale, not a negative bag), and a row stamped at or before the dump is the dump's already.

**What this app's ledger does and doesn't say**, read from a real character's (10,307 rows) and log, because it
is not what EQBuddy's events are:

- **An auto-sell is not a loss.** `You looted X from Y and sold it for …` is one line: the vendor price scales
  with the stack looted (1 Chunk of Meat = 10, 2 = 20, 3 = 30; 196 Tiger Skins at 107 each), so it sells what
  dropped, never a stack already in a bag. It never reached the dump. Treated as a subtraction it would put
  the count 4,913 below the truth on this ledger.
- **`stored` is three places**: the tradeskill depot (1,569 rows), the Dragon's Hoard (166), and the currency
  tab (357 — Motes). The dump lists the first two only when their windows were open
  (`CONDITIONAL_AREAS`), so the app carries the last one it saw forward
  ([ADR 0315](./0315-every-export-is-kept.md)'s `carryForward`), dated: the real dump has no depot, and the
  carried one is eleven minutes older than the dump. The currency tab is in no dump.
- **`combined`** (663 rows) is a loot-and-combine upgrade: it consumed an unknown number of the player's own
  copies to make a higher grade (`Embroidered Black Cape +1` … `+5`).
- **What leaves a bag is not recorded.** `You successfully destroyed N Torch.` is in the real log 63 times
  for that one item, and a hand-sell, a trade, a turn-in or a death writes nothing at all. No ledger holds
  them.
- **The ledger carries no character.** A second character's loot after the first's dump is in it too.

## Decision

**The count is a pure function** (`src/shared/items/held-count.ts`, a tested black box): names, the newest dump
and the ledger rows after it in, a count and its sum out.

    held = (copies in the dump, every area) + (looted since) − (known to have left since), floored at 0

- **Since** is strictly after the dump's second. Log stamps are whole seconds; one at the dump's own second is
  taken to be in it, so nothing counts twice (under-counting is the safe way to be wrong, as
  [ADR 0033](./0033-eating-a-log-is-idempotent.md) chose for the ledger itself).
- **Each section is counted from its own date.** A `kept` drop is dated by the dump; a drop `stored` in the depot
  or hoard is dated by that section — the carried copy's, when it was carried. The ledger is asked from the
  oldest of them.
- **Auto-sold adds and takes nothing**, and is told apart ("2 more were auto-sold as they dropped") so the
  number is not a mystery.
- **What the ledger can't place makes the count *unknown*, not a guess:** a combine since the dump, or a drop
  stored in the currency tab. The row says why instead of a number. A drop stored in a section the dump never
  had is counted, and the explanation says what's missing.
- **`gone` rows** (destroyed, handed in, sold by hand) are in the rule so that a source for them, when one
  exists, can't make the count negative — it floors at 0 and says the dump is out of date. No source feeds
  them yet (`specs/todo.md`).
- Names meet through `normalizeItemName` (grades and case fold) and the dump's own `inventoryTotals` — the
  same totals "how many have I got" reads everywhere else. No second normaliser.

**A row counts the larger of its own tally and the inventory's**, unless the player typed it. A pushed list
holds figures typed or looted over months; taking the larger means switching this on can only *raise* a count,
never un-tick a row (a turn-in that used the items up has still been got). Typing a figure, or stepping it with
− and +, sets `ShoppingListEntry.countedByHand`: the figure is then the player's, and a later loot line still
adds to it. **↺** beside the note hands it back, and the row takes the inventory's figure. The field is optional; a list saved before it loads, counts and
saves exactly as it did (a test holds the stored shape).

**Where it runs.** In the renderer (`useCountedList`), from what it already reads: the dump (`useInventory`) and
a new `loot.since(stamp, names)` that asks the ledger for the named items' rows after a time (indexed on `at`;
grades folded in the main process). It returns the list with each item's `obtained` replaced by the figure it
counts, so `satisfied`, a group's tally and order, and the hunt list all read one number rather than each
learning the rule. The List tab and the Hunt tab (`useHunt(counted)`, and the map's hunt pins) use it; nothing
derived is persisted. Until the ledger has answered, and with no dump, the list is exactly as stored.

**It is shown, and it can be overruled.** A row that holds any gets a quiet `🎒 12 held · need 8 more`; hovering
gives the sum (`12 in your inventory dump (Nov 8, 12:05 AM) + 3 looted since = 15`) and what was left out. The
note and the list's header line turn amber when the dump is past the same half-life the status bar's nudge uses
([ADR 0326](./0326-the-status-bar-is-a-way-in.md): half of the 12 hours an inventory dump is good for). With no
dump the header says how to take one. Old age is a hint, never a switch: the count is shown, and the player
decides.

**Not changed:** a row's stored `obtained` (still the loot-since-added tally, still what the alerts and goals
read), loot matching in the store, what peers are sent, and the Quest plan, pickup page, drop banner and BiS
tables, which still read the stored figure.

## Consequences

- A farmed-out item ticks the moment the dump says so, a drop after it moves the count, and the Hunt tab stops
  listing what you hold. On a real ledger and dump: Mistmoore Heirloom Ring (0 on the list) ticks from the dump,
  Ruby goes from 2 to 6, Phosphorous Powder reads 218 in the dump (2 in bags, 216 in the carried depot) + 78
  stored since = 296, against the list's own 340 — the larger stays and the note says what the dump says.
- **The count can be too high**, because what leaves a bag isn't recorded: a turn-in, a destroy, a trade or a
  hand-sell since the dump is invisible. That is why the sum is always one hover away, why age is flagged, and
  why a typed figure wins. Parsing `You successfully destroyed N X.` into the ledger would close part of it
  and is on `specs/todo.md`; the `gone` rule is already shaped for it.
- **An alternate character's loot since the main's dump counts toward the main**, since no ledger row names a
  character. The override is the answer until rows are tagged.
- A row is credited in full in every group that wants the item (as a drop always was), so two groups wanting 4
  and 8 with 6 held show the first done and the second not; the "(12)" total still says what everything wants.
- A dump written part-way through a second and a drop logged in that same second are taken to be one: it
  under-counts by that one drop at most.
- Quest plans, pickup pages and the drop banner still show the stored figure, so a row can read done on the List
  tab and `0/1` on a quest page until they are moved onto `useCountedList` too.
- Name matching is exact after folding: a list name that isn't the item's own title (a plural, a different
  spelling) simply finds nothing and counts 0, which never ticks a row.
