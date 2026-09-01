# 0165: The page cache is a few files, not eleven thousand

## Status

Accepted

Replaces the on-disk shape the wiki cache has had since it existed. Sits under
[ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md) (what fills it) and
[ADR 0160](./0160-a-room-fills-the-catalogue-once.md) (who else fills it).

## Context

A parsed wiki page was a file. That is the obvious design, it was right for a cache of a few hundred
pages, and it stopped being right somewhere around eleven thousand. Measured on a real install:

- **11,523 files**, holding 19.4 MB of JSON and occupying **53.5 MB**, because every file is rounded
  up to a 4 KB cluster and the average page is 1.7 KB.
- A full read is **11,523 separate opens**. On Windows each one is a real-time antimalware scan, which
  is why a catalogue build presented as the machine seizing up rather than as a slow read.
- A harvest **creates a file a second for three hours**, which is a shape a ransomware heuristic takes
  an interest in — and the app is unsigned, so it starts from no benefit of the doubt.

The catalogue pack hid the read cost on a warm launch: the built rows go to one file, so a launch is
one read of 26 ms rather than a 706 ms walk. What it could not hide is that **the pack is dropped
whenever a page changes**, and pages change constantly — a peer hands you a shard, you open an item,
the harvest ticks. Every one of those put the next Items open back on the full 11,523-file walk. The
pack made the bad case rarer without making it cheaper, and the reports kept coming.

Three shapes were considered. **One file for everything** makes reads trivial and writes absurd: 19 MB
rewritten per page during a harvest. **A database** (SQLite) is the industrial answer and brings a
native dependency into an Electron build for a store with one key and no queries. **Bucketed
append-only files** is the one that fits what this actually is: a key/value cache with a hot write
path of one small page at a time and a cold read path of "give me everything".

## Decision

**Pages live in 256 append-only bucket files, keyed by the hash the peer sharding already uses.**

- **A page is one line** — `title \t parse-version \t page-json`. A wiki title contains no tab and no
  newline, so the split is exact and needs no escaping, and a bucket can be loaded and indexed
  **without parsing the pages in it**: a lookup parses one page, not the forty it shares a file with.
- **A write appends.** It costs what a file-per-page write cost, so the harvest still writes about
  2 KB per page rather than rewriting a bucket — and it writes to a file that already exists, which
  is the half of the antimalware problem that the pack never addressed. The last line for a title
  wins; a bucket is rewritten only once the superseded lines outweigh the live ones.
- **256 buckets**, at about 75 KB each. The two costs pull opposite ways — reading everything is one
  open per bucket, reading one page loads its whole bucket — and 256 puts a full read at 45× fewer
  opens while keeping a bucket a few milliseconds to load.
- **The bucket is `shardOf(title) % 256`**, reusing [item-shards](../../src/shared/item-shards.ts)
  rather than inventing a second hash. Because 1024 shards divide evenly by 256 buckets, every page
  of a peer shard lands in one file.
- **A torn line costs one page.** An append can be cut short by a power cut; a line that does not
  split into three, or whose JSON does not parse, is skipped when the bucket loads. That is exactly
  what a truncated file cost before, and it cannot spread, because a line is self-contained.
- **The old cache is folded in on first launch and then deleted**, in the background, with lookups
  reading through to the old files until it finishes. An upgrade is never a re-crawl and never a
  pause.
- **Migration keys by the page's own title**, which quietly drops the graded aliases: asking for
  `Cloth Cape +2` cached the base page under the asked-for name
  ([ADR 0057](./0057-a-grade-is-not-an-identity.md)), so 36 pages were on disk twice. There is no way
  to recover `+2` from `Cloth_Cape_2` and no reason to want to.
- **The pack stays**, and is now trusted correctly: `dropDerived` marks it stale **synchronously**
  rather than relying on a fire-and-forget unlink, which closed a window where a page arriving and
  the Items tab asking in the same tick were served the rows from before it landed.
- **The catalogue is sorted always**, not only when a duplicate was folded. The store visits pages in
  bucket order, which is a hash — an unsorted catalogue would come out shuffled.

## Consequences

**The cold path is no longer a cliff.** Measured on the real 11,126-item catalogue: a cold build is
**345 ms and 261 file opens**, against 706 ms and 11,523. A warm launch is unchanged at 11 ms and five
opens. And because a bucket stays in memory once read, a *rebuild* after a page is written — the case
that made this painful — is **253 ms and no file I/O at all**, where it used to be the full walk every
time.

**The cache is a third of the size it was**: 9.0 MB in 256 files against 53.5 MB in 11,523. Most of
that is the cluster rounding; the rest is that pages were pretty-printed and now are not.

**A harvest no longer creates a file a second.** It appends to 256 existing files, which is an
ordinary application write pattern rather than one that resembles an encryption run.

**About 20 MB stays resident in main** once the whole cache has been read — the raw page text, held as
strings, parsed on demand. That is the price of the buckets staying loaded, and it is what takes the
disk out of a rebuild. It is bounded by the cache, which is bounded by the wiki.

**The store is a black box with its own tests** ([page-store.ts](../../electron/wiki/page-store.ts)),
including the migration, the read-through while it runs, and the torn line. The wiki client no longer
knows what a cache file is called.

**A page seeded into the cache directory behind a running client's back is no longer noticed.** The
walk used to re-read the directory every time, so a test — or a hand-edit — could drop a file in and
have it appear. Nothing in the app does that, and the tests now seed through the store.

**The obvious next step is smaller than it was.** Nothing about this stops the pack being *patched*
for a single written page rather than rebuilt, which would take the rebuild from 253 ms to nothing.
It is no longer urgent, which is the point.
