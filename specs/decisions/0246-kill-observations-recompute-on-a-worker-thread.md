# 0246: Kill observations recompute on a worker thread

## Status

Accepted

## Context

[ADR 0245](./0245-a-camps-cost-is-its-footprint-not-its-kill-count.md) fixed the catastrophic part of
`kill-log.ts`'s `observations()` — a farmed camp's positions no longer blow up `clusterAreas`'s cubic
nearest-pair search. What's left is smaller but not free: every call still does a full `SELECT *` over
`kill_records` (uncapped since [ADR 0243](./0243-remove-the-remaining-storage-caps.md)) and maps every
row into a `KillRecord`. That runs synchronously on the Electron main process — the same thread every
window's IPC shares — and it runs on **every kill**, not just on opening an item page: `bump()` is
called by `record()`/`noteLoot()`/`noteCoin()`/every admin edit, and `mobs.all()`/`mobs.mine()` (which
call `observations()`) are re-read on the `killsChanged` notice those fire. A character with a long
enough history pays a real, and growing, tax on every single kill for as long as any window has an
item page, the Hunt tab, or a Fippy/Drops view open — not a one-time cost, a recurring one.

## Decision

**`observations()` keeps its exact synchronous contract — always correct, the instant it's called —
but is backed by a cache that a background worker thread keeps warm instead of the main thread
recomputing it inline.**

- `kill-observations.ts` (new, split out of `kill-log.ts`) holds the row shapes (`KillRow`,
  `FrozenObservationRow`) and `computeObservations(db)` — the whole "read the tables, fold them" pipeline
  — with no side effects and no connection of its own, so anything holding a `Database` handle can run
  it: the main process (a synchronous fallback) or a separate thread with its own connection.
- `kill-observations-worker.ts` (new) is a small `node:worker_threads` entry point: it opens a **second,
  read-only** connection to the same `eqlist.db` file — safe under WAL mode, which `sqlite-store.ts`
  already turns on for exactly this kind of concurrent read — and answers a `"recompute"` message with
  `computeObservations`'s result.
- `kill-log.ts` seeds `observationsCache` synchronously once, at construction (a one-time app-init cost,
  same as `createNameRegistry`'s own seed read). Every mutation's `bump()` also fires a coalesced
  (`OBSERVATIONS_REFRESH_DEBOUNCE_MS = 300`, shorter than `main.ts`'s own 500ms `killsChanged` delay, so
  the worker gets a head start on the read it exists to spare) trigger that asks the worker to recompute
  and, if `version` hasn't moved again since that particular refresh started, adopts the result and fires
  `onObservationsChanged` — wired in `main.ts` to `broadcast(CH.killsChanged, ...)`, the same notice a
  live kill already sends, so an open window catches up once the fresher answer lands.
- **`observations()` itself**: if the cache's own recorded version doesn't match the live counter, it
  computes `computeObservations(db)` right there, synchronously, before returning. This is what keeps
  the contract airtight — a same-process caller (every test in this repo; `kill-log.test.ts`'s own
  `freshKillLog()` always uses a real file, never `:memory:`, so this is exercised by the *real* worker,
  not a stand-in for it) that reads immediately after a write has no delay for any worker to have used,
  and gets a correct answer regardless. In production the background refresh usually wins that race —
  verified directly: recording kills and reading immediately returns the correct total synchronously,
  and the worker still separately confirms the same answer and fires `onObservationsChanged` a few
  hundred milliseconds later, repeatably, across more than one refresh cycle in the same run.
- `:memory:` databases (used by essentially every test in this file, deliberately, for speed) get no
  worker at all (`db.memory` check) — a second `:memory:` connection is a distinct, empty database, not
  a view onto the first, so trying would only ever answer wrong. `observations()`'s synchronous fallback
  already covers this correctly on its own; there's nothing to fix.
- A wedged or crashed worker is discarded (mirroring `ocr.ts`'s own `discardWorker` — a worker that
  stops answering doesn't come back on its own, so the next refresh needs to build a fresh one, bounded
  by `OBSERVATIONS_WORKER_TIMEOUT_MS`). Since `observations()` never depends on the worker for
  correctness, a permanently-broken worker degrades to exactly today's pre-worker behavior (always
  computing synchronously) rather than a new failure mode.
- `coalesce()` (the leading-throttle helper `main.ts` already had, used to collapse a burst of kill
  lines into one `killsChanged` broadcast) is now shared from `electron/coalesce.ts` — this needed the
  exact same shape for a different burst, and a second hand-written copy would have been the kind of
  duplication this project already avoids elsewhere.

## Consequences

- Recording a kill no longer pays for `observations()`'s full read on the thread every window's IPC
  shares, in the common case — the background worker usually finishes before anything asks again.
- `observations()`'s contract hasn't changed: still synchronous, still always correct. No caller —
  `mob-knowledge.ts`, any IPC handler, any test — needed to change. This was deliberate: the worker is
  an implementation detail of how the cache gets kept warm, not a new shape callers have to adopt.
- The first `node:worker_threads` usage in this codebase. Confirmed (via direct research and a live
  smoke test against a real file-backed database) that it needs no new packaging: a worker script
  compiles to a sibling `.js` alongside every other `electron/*.ts` file (no bundler in
  `tsconfig.electron.json`), and it shares the same already-unpacked, already-ABI-matched
  `better-sqlite3` binary the main process uses, since a worker thread runs inside the same OS process.
- `mob_observations_frozen`'s own read (`frozenObservations()`, used by `retire()`/`clear()`) and the
  new `computeObservations`'s read of the same table are two separate prepared statements now (one per
  connection) rather than one — an acceptable, small duplication of a single-line query, in exchange for
  the row-mapping logic (the fiddly, error-prone part) staying in exactly one place
  (`rowToFrozenObservation`) that both share.
