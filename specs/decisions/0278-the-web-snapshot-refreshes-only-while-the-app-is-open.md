# 0278: The web snapshot refreshes only while the app is open

## Status

Accepted

## Context

`npm run web:snapshot` (`scripts/build-web-snapshot.mjs`) publishes `public/data`, the static
mirror the web build fetches. Keeping a developer machine's copy fresh without remembering to run
it by hand was previously a Windows Scheduled Task: `run-web-snapshot.cmd` on a 6-hour repeating
trigger, entirely outside the app's own process.

That task ran regardless of whether the app was open. Since the wiki cache export needs
`better-sqlite3`'s Electron-ABI build (ADR 0232), every firing ran `predev`'s equivalent
(`rebuild:electron`, spawning `prebuild-install`) through `cmd.exe` → `npm.cmd` → `node.exe`, none of
it hidden — a console window (and sometimes a network fetch) could pop up at any time, including
with the app fully closed, days after the user had last touched it. Sysmon process-creation logs
surfaced this as `node.exe` launching unexplained.

## Decision

**The 6-hour cadence moves onto the app's own lifecycle. Nothing runs unless the app is already
open, and a run missed while it was closed is caught up once, the next time it opens — not repeated
per interval missed.**

- `electron/web-snapshot.ts` is `build-web-snapshot.mjs`'s copy/export logic, extracted into a
  plain, testable `buildWebSnapshot(opts)` function (no `process.argv`/`process.exit`/`console.log`
  baked in). The CLI script is now a thin wrapper around it — same flags, same output — so the app
  and the script share one implementation instead of two copies drifting apart.
- `electron/web-snapshot-job.ts` (`createWebSnapshotJob`) persists `lastRunAt` in
  `userData/web-snapshot-state.json` (`json-store.ts`). On start it checks elapsed time against a
  6-hour interval — matching the retired task's own cadence — runs immediately if overdue (including
  "never run"), then self-reschedules from each run's completion, mirroring the injectable
  `now`/timer style every other tracker in `electron/` already uses (`ticker.ts`'s new
  `realTimeout`/`realClearTimeout`, alongside its existing `realInterval` pair).
- The export itself runs on a worker thread (`electron/web-snapshot-worker.ts`), not inline on the
  main process — the maps section alone can be ~215 MB, and copying that synchronously on the
  thread every window's IPC and hotkey handling shares would stall the app mid-session. Same
  reasoning as ADR 0246's `kill-observations-worker.ts`: a fresh **read-only** connection to
  `eqlist.db`, safe alongside the main process's own connection under WAL mode.
- Gated to `!app.isPackaged` — a packaged build has no repo checkout for `public/data` to land in,
  so this is dev-machine-only, the same boundary the update checker uses in the other direction
  (`app.isPackaged` only). Also skipped whenever `process.env.EQL_DEV` is set, i.e. under
  `npm run dev`: that already refreshes the same snapshot on its own, much shorter cadence
  (`dev-snapshot-loop.mjs`, 20 minutes) — running both would be two writers to `public/data` at once.
- The Windows Scheduled Task (`EQList Web Snapshot`) is disabled rather than deleted, so it's easy
  to confirm it's inert and easy to fully remove later; it no longer runs anything.

## Consequences

- No process launches, visible or not, while the app is closed. The cadence a person actually
  experiences is unchanged (still roughly every 6 hours), just no longer capable of surprising
  someone with a flashing console window at 3 AM.
- A long stretch with the app closed no longer means a burst of catch-up runs once reopened — at
  most one, same as running `npm run web:snapshot` by hand once.
- `build-web-snapshot.mjs`'s own CLI usage, flags, and printed output are unchanged; only its
  internals moved.
