# EQ List — specs

EQ List is a desktop overlay for **EverQuest Legends**. You build a shopping list
of items (directly, or from a quest / recipe on [eqlwiki.com](https://eqlwiki.com)),
and a translucent always-on-top window lights up the moment one of those items
drops in your log.

Start here, then branch out by area:

- [architecture](./architecture/README.md) — how the pieces fit (Electron main ↔ renderer).
- [log-watching](./log-watching/README.md) — tailing the EQ log and parsing loot lines.
- [wiki-data](./wiki-data/README.md) — sourcing items/quests/recipes from eqlwiki.
- [overlay-ui](./overlay-ui/README.md) — the control window and the floating overlay.
- [map](./map/README.md) — the sibling map window that plots your live location.
- [testing](./testing/README.md) — what's a tested black box and how to run it.

Decisions are logged as ADRs in [decisions/](./decisions/README.md). Open work is
tracked in [todo.md](./todo.md).
