# 0258: A spell's class is read from the file, not the player

## Status

Accepted

## Context

The Spells list on the Buffs tab (`BuffPanel.tsx`) is a catalogue, bounded but large
(`MAX_KNOWN_BUFFS`), and it grows the same way the rest of the board does — one row per spell ever
seen, never asked for by name. A player running several buffing alts, or simply a long-lived
character, ends up scrolling past every class's spells to find their own, with no way to narrow the
list and no way to reset it besides unchecking rows one at a time.

Two more small gaps sat next to it. There was no bulk control at all — no "stop watching everything"
and no "start again with just what I use" — only the per-spell `track` toggle. And the standing HUD
reminder drawn over the game (`BuffOverlay`/`DebuffOverlay`) carried exactly one control, the ✕ that
stands a lapse down for now; turning a spell's alerts off for good still meant alt-tabbing to the
Buffs tab mid-fight.

A filter *by class* is the obvious answer to the first problem, and the obvious question it raises is
where "class" comes from. [ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md) already
turned down asking the spell file which classes may cast a spell as evidence of *whose* debuff it is
— that would be a claim about the player's own character, which nothing here knows, standing in for
a claim about what happened. This decision is not that one: it never asks who the player *is*, only
what a spell *is*, which is exactly the question `permanent` and `detrimental` already put to the same
file ([ADR 0080](./0080-the-game-s-own-spell-file.md)).

## Decision

**`KnownBuff` gains an optional `classes: string[]`** — every class the game's own `spells_us.txt`
says can cast this spell, in the file's own order, read alongside `permanent`/`detrimental` and
re-asserted the same way: a row written before the file was findable gets it filled in the next time
the spell is seen, rather than needing a migration. Absent means the file was never available, or
never matched the name — not "no class can cast this."

**The Spells list filters by it, failing open.** A row with no `classes` always shows, whatever is
picked — the filter can only narrow what it is *sure* isn't the chosen class, and a name the file
never resolved is not evidence of anything. Without an install, every row's `classes` is absent, so
the filter quietly does nothing rather than emptying the list.

**Two bulk actions ride the same field:**
- `disableAll` untracks every known spell — the panic button, doing per-row what `track(key, false)`
  already does (drop the row's board entries and held banners) so an unchecked spell doesn't leave a
  standing message with nothing left to explain it.
- `enableAllByClass(cls)` tracks every spell whose `classes` includes `cls`, whatever it was set to,
  and leaves everything else alone — including a spell `classes` never named, since there's nothing
  there to say it belongs. Meant to follow `disableAll`: clear the board, then bring back one class's
  set in a click, rather than re-checking a catalogue by hand.

**The HUD row gains a second control, 🔕, beside the existing ✕.** It throws the same `notify` switch
the Buffs tab's own "Notify" checkbox does — a future lapse of this spell stops raising a banner — and
nothing else: the row still shows here until the buff is back, because that promise is `onScreen`'s,
not `notify`'s, and no one asked to end it. It only ever turns notify *off* and only appears while
notify is still on, so there is never a control on screen that does nothing. It trails the row rather
than leading it, the opposite pull from the ✕ ([ADR 0147](./0147-an-overlay-control-takes-its-own-clicks.md)):
the ✕ is reached for constantly and mid-fight, so it gets the spot under the cursor; 🔕 is reached for
rarely, so it gets the quiet corner instead.

## Consequences

The catalogue is now something a player can shrink to their own class in two clicks and rebuild the
same way, without the filter ever pretending to know something about an install that isn't there.

**Class and ownership stay separate questions.** `mine`/`detrimental` still answer "did you cast
this," entirely from evidence; `classes` only ever answers "who could," entirely from the file. Uses
that need one must not reach for the other, the same seam ADR 0149 drew.

**A renamed or reclassified spell (a game patch) self-heals the same way `permanent`/`detrimental`
already do** — the next sighting re-reads the file and overwrites `classes`, rather than trusting
whatever was true when the row was first created.

**The overlay now carries two clickable islands per row instead of one.** `SOLID` marks both, so the
window still rests as glass everywhere else; the CSS comments documenting "the one part of a
reminder you can click" were the one place this had to be said twice.
