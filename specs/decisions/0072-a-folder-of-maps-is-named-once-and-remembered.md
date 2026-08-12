# 0072: A folder of maps is named once and remembered

## Status

Accepted

## Context

[ADR 0061](./0061-a-map-pack-names-its-own-zones.md) settled *what* a folder's gazetteer is: a source is
named from its own exit labels, solved per folder. It left *when* alone, and the answer was "every
launch, synchronously, on the main process".

The map window asks for names the moment it mounts — it has to, because a zone name is what resolves the
player's current zone to a map file — and it asks **twice**: once for the chosen pack, once for the
game's own maps, which is where a zone the pack lacks is borrowed from
([ADR 0063](./0063-a-zone-the-pack-lacks-is-borrowed.md)). Since the map window is restored at launch if
it was open last session, that landed in the middle of startup, beside everything else that begins at
once.

Measured on a real install (133 game maps beside Brewall's 568), with a warm file cache:

| | files read | bytes read | main thread held |
|---|---|---|---|
| `maps/` | 191 | 65 MB | ~130 ms |
| `maps/Brewall/` | 1,130 | 134 MB | ~630 ms |

So opening the map window read **199 MB across 1,321 files** and held the main process for about
**0.8 s warm** — longer cold, and the reads themselves saturated the disk queue, which is what a person
notices as the whole machine going slow rather than one app being busy. Every window's IPC queues behind
the main process, so the app was frozen for the duration.

Three further findings shaped the fix:

- **The bytes are nearly all waste.** Naming reads `P` (labelled point) lines; a big zone's base file is
  most of a megabyte of `L` geometry. Brewall's 134 MB carries 2 MB of labels. Decoding all of it to a JS
  string (which doubles it, latin1 → UTF-16) and splitting it into a million throwaway line strings was
  about half the cost, and all of the garbage.
- **The geometry files still can't be skipped.** Reading only the `_1` label layer would cut Brewall to
  2 MB and lose exactly one name of 266 — but the game's own maps put exit labels in the *base* file, and
  skipping it there loses **24 of 54** names (the Dreadlands, the Nexus, Ak`Anon, North Karana…). A
  cheaper read that names fewer zones is not the same feature.
- **The travel graph read the folder twice more.** `buildFromSource` called `zoneNamesFor`, which built a
  *fresh* namer — bypassing the app's cached one — and then `harvestSource` read every file again for the
  same `P` lines.

## Decision

**A folder is named once and the answer is kept in `userData`.** `createZoneNamer(cacheDir)` stores each
folder's gazetteer in `map-zone-names.json`, keyed by folder path, beside a cheap **signature** of what
that folder looked like: how many `.txt` files, how many bytes, and the newest mtime. A signature that
matches is a cache hit; a pack installed, updated in place or uninstalled moves it and re-solves. Statting
a 1,700-file pack costs ~25 ms against the ~1 s scan it stands in for.

**When a solve is needed, it is background work.** One shared `readFolderPois` reads a folder a few files
at a time (`SCAN_CONCURRENCY`) through `fs.promises`, so the I/O lands on libuv's pool and every `await` is
a chance for the event loop to serve the windows: the longest the main thread is held is one zone's labels,
not one folder's. The concurrency is bounded on purpose — turned loose it saturates the disk queue, which
is the "whole machine went slow" symptom rather than a fix for it. `zoneNamer.names()` is therefore async,
and in-flight solves are shared so two windows asking at once cause one scan.

**Labels are sieved from the raw bytes.** `poiLines` scans the `Buffer` for lines beginning with `P` and
decodes only those, instead of decoding the file and splitting it. Same input to the same shared
`parseEqMap`; roughly half the time and a small fraction of the garbage.

**The travel graph shares the app's namer** (`buildFromSource(source, outOfEra, namer)`) and harvests from
the same `readFolderPois` pass — one read of a folder for the two of them, and none for the naming once
it's cached.

Rejected alternatives:

- **A worker thread.** It is the obvious answer to "get it off the main thread", and it was the wrong
  size: with the result cached, a solve happens once per pack per install, and async I/O with a bounded
  pool already keeps the main thread free during it. A worker would add a second execution context —
  and, packaged, a script loaded out of `app.asar` — to speed up something that now happens approximately
  never.
- **Read only the `_1` label layer.** Cheap and lossy; see the measurement above.
- **Ship a gazetteer with the app.** That is the catalogue, and it stays small on purpose
  ([ADR 0039](./0039-render-the-game-s-own-maps.md), [ADR 0061](./0061-a-map-pack-names-its-own-zones.md)).
- **Solve lazily, only for the zone being viewed.** `solveZoneNames` is global by design — one name to one
  file is what lets it refuse a confident wrong answer — so there is no per-zone slice of it to take.

## Consequences

- Launch reads a ~30 KB JSON instead of 199 MB. The freeze and the disk storm are gone, and the second
  and later launches of a given install cost nothing at all.
- A **first** run after installing a pack still pays the scan once — now spread across the event loop
  instead of blocking it. The picker is usable by file name while it is in flight and relabels itself when
  it lands, which is unchanged behaviour ([ADR 0061](./0061-a-map-pack-names-its-own-zones.md)).
- `zoneNamer.names()` returns a promise. `map.names` was already an async IPC call, so no renderer changed.
- The signature is not a content hash. The failure it can miss is an edit that preserves both the total
  byte count and every mtime; the cost is one stale zone name until something else touches the folder.
  `GAZETTEER_VERSION` covers the other direction — a change to the naming *rule* invalidates every stored
  gazetteer, since the files won't have moved.
- Building a travel graph is one pass over a folder rather than three.
