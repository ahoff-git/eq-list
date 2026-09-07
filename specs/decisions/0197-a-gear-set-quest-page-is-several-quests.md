# 0197: A "gear-set" quest page is several quests

## Status
Accepted

## Context
Reported bug: `https://eqlwiki.com/ShadowBound_Armor_Quests` "fails to parse." It has
a single shared `table.questTopTable` (one giver, one start zone, one level), so
`parseWikiPage` classified it as one ordinary quest — but the page describes **three
independent armor-piece quests** (ShadowBound Boots / Gloves / Robe of Enshroudment),
each with its own turn-in checklist, off one NPC. Its Reward section is also not the
`<ul>` every ordinary quest uses: it's `table.eql-gear-set-table`
(`Template:Gear_Set`), which the existing `parseRewards` (built only for `<ul>`) reads
as zero rewards. Net effect: the page parsed successfully but returned almost
nothing — no rewards, and turn-ins scattered across three sections the existing
Walkthrough/Checklist merge never looked at.

Checked the live wiki rather than assuming this is a one-off: `Category:Gear_Sets`
has 273 pages, several dozen of them titled "`<Class> <Zone> Armor Quests`" — a
real, recurring template, not a one-off page. Fetched four real examples
(`action=parse`) and found **two different DOM shapes** for "which turn-ins go with
which piece," plus two shapes that are gear-set tables but genuinely aren't bundles:

- **Per-piece heading** (`ShadowBound Armor Quests`): one `<h2>` per armor piece,
  heading text equal to the reward's own name, each holding its own
  `.checkbox-list` (`Template:CheckboxList`) of turn-ins.
- **Consolidated checklist** (`Cleric Kael Armor Quests`): per-piece `<h2>`s hold
  only prose ("Hand in an X and three Y") that no existing turn-in heuristic
  matches at all (the link is always the first token in its own sentence, so no
  quantity/verb cue precedes it) — but a single `<h2 id="Checklist">` holds one
  `.checkbox-list` with repeating (bare single-link `<ul>` naming the piece,
  `<dl><dd><ul>` of its turn-ins) pairs, in reward-table order. The reward table
  itself can also legitimately repeat one item (e.g. "Templar's Bracer" listed
  twice — the same craftable piece, worn in both bracer slots).
- **Not a bundle** (`Curscale Armor Quest`): also `.eql-gear-set-table`-shaped
  (eleven pieces!) but with no per-piece heading and no "Checklist" section at all
  — every piece's turn-ins are folded into one undifferentiated Walkthrough. Genuinely
  one ordinary quest; only its reward table needed reading.
- **Out of scope**: `Monk Quests` concatenates **five separate** `questTopTable`s on
  one page (a sash line, a headband line, a numbered "Shackle Quest" line, …) — a
  much larger, differently-shaped page. It keeps parsing exactly as before (the
  first `questTopTable` on the page, same as any multi-table page always has);
  fixing that shape is not part of this change.

The key fact that kept this cheap: `ShoppingListEntry.origin.name` (the shopping
list's grouping/toast label) was already never required to equal `WikiPage.title` —
traced through `addFromPage`, `originKey`, and the peer wire format
(`readSharedPage`, which doesn't even carry a quest's `rewards`). So a bundle's
pieces can each be added under their own name with **zero changes** to the store,
IPC, `wiki-add.ts`, `addToList.ts`, `list-add.ts`, `grouping.ts`, or peer-share —
each piece is simply another `WikiPage`-shaped value fed through the exact
`addPage`/`addPageItself` calls that already exist.

## Decision
- `WikiPage` gains one additive field, `subQuests?: WikiSubQuest[]`
  (`{title, wikiPath, sources, components, rewards}`) — `kind` stays `"quest"`, no
  new `WikiPageKind`. `components`/`rewards` at the top level stay flat and become
  the **union** of every sub-quest's, so the existing whole-page "+ Add full quest"
  action is unaffected either way.
- Reward-row reading gains a fallback: when a quest's Reward section has no `<ul>`,
  read `table.eql-gear-set-table` instead (first `.hbdiv > a` per row, skipping the
  Totals row, deduplicated by name). This alone fixes `Curscale Armor Quest`-shaped
  pages without making them a bundle.
- Splitting into `subQuests` requires **2 or more** reward rows to get turn-ins from
  either DOM shape above, matched **by the piece's own name, never by heading or
  table position** (the two shapes disagree on order, and Cleric Kael's headings
  don't name the reward at all). A gear-set table alone is not enough of a signal —
  `Curscale` has one with zero matched pieces and correctly stays flat.
- `WikiPageView` renders `subQuests`, when present, as one section per piece — its
  own heading, its own turn-ins with per-item "+ Add", its own reward line, and its
  own "+ Add full quest" built from that piece alone — in place of (not alongside)
  the flat single "Turn-in items"/"Rewards" lists. Modeled on the existing
  faction-page precedent (`FactionSides` — a page yielding several named,
  independently-addable things).

## Consequences
- A piece with no distinguishable turn-ins (neither DOM shape matched it) still
  gets a `subQuests` entry once the *page* clears the 2-match bundle threshold — it
  shows the existing "couldn't auto-detect" line for that one piece rather than
  silently vanishing, the same as a whole quest with no turn-ins does today.
- `Monk Quests` and any other page shaped like several full, independent
  `questTopTable`s remain unsplit — still read as one flat quest off the first
  table, exactly as before this change. A future fix for that shape is a separate
  decision.
- A cached quest page from before this change is missing rewards entirely (silently,
  if it was gear-set-table-shaped) or shows one undifferentiated turn-in list where
  several independent ones exist, until its 90-day TTL lapses or it's refreshed by
  hand — `CACHE_VERSION`/`MIN_PARSE_VERSION.quest` are both bumped so every quest
  page re-parses once, without forcing a re-fetch of the rest of the catalogue.
