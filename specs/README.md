# EQ List — specs

EQ List is a desktop overlay for **EverQuest Legends**. You build a shopping list
of items (directly, or from a quest / recipe on [eqlwiki.com](https://eqlwiki.com)),
and a translucent always-on-top window lights up the moment one of those items
drops in your log.

Start here, then branch out by area:

- [architecture](./architecture/README.md) — how the pieces fit (Electron main ↔ renderer).
- [log-watching](./log-watching/README.md) — tailing the EQ log and parsing loot lines.
- [wiki-data](./wiki-data/README.md) — sourcing items/quests/recipes from eqlwiki.
- [lucy-data](./lucy-data/README.md) — the borrowed second opinion, for names eqlwiki hasn't got.
- [overlay-ui](./overlay-ui/README.md) — the control window and the floating overlay.
- [map](./map/README.md) — the sibling map window that plots your live location.
- [travel](./travel/README.md) — the zone-line graph behind "how do I get from here to there?".
- [testing](./testing/README.md) — what's a tested black box and how to run it.

Decisions are logged as ADRs in [decisions/](./decisions/README.md), and
[decisions/requirements.md](./decisions/requirements.md) consolidates them: every rule they still
hold, stated once, grouped by area, each citing the records it came from. Everything not yet
built has one of four homes, so no list has to be read to find out whether it's the right
one:

- [todo.md](./todo.md) — **open work**: a bug, or a decided change someone means to make.
- [ideas.md](./ideas.md) — **features for later**, that nothing is waiting on.
- [decisions/README.md](./decisions/README.md) `## Open Questions` — what needs **deciding**
  before it can be built.
- [testing/manual-qa.md](./testing/manual-qa.md) — built and tested, but never **run for real**.

[neighbours.md](./neighbours.md) is the address book for the other EQ Legends tools — what each one
is and which file to open, for the notes in `todo.md` that begin "a neighbour does this".
