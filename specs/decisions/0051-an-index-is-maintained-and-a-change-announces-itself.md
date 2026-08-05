# 0051: An index is maintained, not re-derived — and a change announces itself

## Status

Accepted

## Context

[ADR 0044](./0044-the-log-position-outlives-the-app.md) made the app's state a function of the log
rather than of the launch: whatever was written while we were closed is replayed through the live
path on `start`. Its consequences claimed "replay cost is a non-issue", measured at 61,018 lines in
87ms. Restoring the map window on relaunch (it reopens if it was open) then put a second window's
whole load — source listing, zone naming, geometry parsing — on the same main thread as that replay,
and the map arrived frozen for a visible beat.

The 87ms figure was measured on a **fresh install**, which is the one state where nothing here is
expensive. Two costs scale with how much you've already played, and both were invisible until the
map window started loading during the replay instead of long after it.

**The kill log re-derived its whole index on every kill past the cap.** `kill-log.ts` keeps
`MAX_KILLS` (5000) records and indexes each one's line-identity so "have we read this line?" is
O(1) ([ADR 0033](./0033-eating-a-log-is-idempotent.md)). Trimming called `rebuildKeys()`, a pass
over all 5000 records and their drop and coin keys — correct, and once per bulk change it is
nothing. But past the cap *every* kill trims, so every kill paid for a full re-index. Measured over
a 600-kill evening replayed into a full log: `record` cost **121ms**, against **2ms** for the same
600 kills on a fresh one. Sixty times, and the whole 210ms replay was 58% this one function.

**The map refetched every kill whenever the player's position moved.** `useKills` took a
`refreshKey`, and the map passed it the length of the `/loc` trail, reasoning that the kill count
moves with play. A `/loc` is not a kill: each one refetched all 5000 records across IPC (~10ms per
hop to clone), re-filtered them and redrew the heatmap. A replayed gap delivers dozens of `/loc`
lines in one synchronous burst — precisely while the map window is asking the same blocked main
process for its geometry.

The two share a shape. Both do work proportional to everything stored, on an event that changed one
thing.

## Decision

**Unindex what leaves; don't re-derive what stayed.** `forgetKill` drops one record's keys — its own
line, plus the loot and coin lines folded into it — and the cap uses it for the records it splices
off, as does `setPlayer` for the pet deaths it prunes. Keys are unique to a line by construction, so
deleting one can't orphan another. `rebuildKeys` survives for the one case that genuinely replaces
the log wholesale (`clear`, and reading it off disk at startup).

**A kill-log change announces itself, coalesced.** `CH.killsChanged` already existed for bulk edits
(import, clear); main now fires it whenever `record`/`noteLoot`/`noteCoin` reports something
*newly* recorded, pooled over `KILLS_NOTICE_MS` (500ms — the watcher's own poll interval, so one
notice per batch of lines is the ceiling). `useKills` takes no `refreshKey` at all any more and
follows that notice alone.

Firing on the return value rather than on the call is what keeps a **re-read** log silent: those
methods already answer "was this new?" because idempotence needed them to, so the notice costs no
new bookkeeping. And a whole replayed gap is one synchronous pass, so its 600 kills coalesce into a
single refetch rather than 600.

## Consequences

The replay is back to costing what ADR 0044 said it did, and now that figure holds for a log that
has been played rather than only for a fresh one: `record` went 121ms → 4ms over the same 600 kills,
the measured replay 210ms → 102ms, and the per-kill cost no longer varies with how many kills are
stored. The map's own load stops queueing behind that, which was the visible symptom.

The map is also *more* current than before, not less. It used to learn about a kill only when the
player next typed `/loc` — which real logs show happening nine times across several evenings — so a
heatmap dot could sit unrendered indefinitely. It now appears within half a second of the kill.

`useKills(zone)` lost its second parameter. One caller, and the parameter was a proxy for exactly
the signal that now exists, so nothing is left doing the polling by hand.

The map's other panels still key off `allKills.length` for their own refreshes. That is unchanged
and still coarse — a drop landing on a corpse already counted doesn't move the length — but it is no
worse than it was, and the notice is now available to anything that wants a finer trigger.

What this does **not** address: naming zones reads every map file in the folder (a few hundred ms to
a second for a full pack) inside a synchronous IPC handler, so it still blocks the main process while
the map window loads. It always did — the map window merely used to open when the app was idle. That
one is a real remaining cost and wants its own decision, because the fix is a different shape
(off-thread, or cached across runs) rather than a smaller constant.
