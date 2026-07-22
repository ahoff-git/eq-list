# 0002: Electron desktop shell over the existing Next.js app

## Status
Accepted

## Context
The goal is a floating, always-on-top overlay that reads local EverQuest log files
and shows data from eqlwiki. Two hard requirements — a transparent always-on-top
window and local filesystem access — are impossible for a browser web app, which
is all the repo was (a blank `create-next-app` scaffold).

The reference overlays (EQBuddy, eql-tooltip) are C#/WPF. Rewriting in C# would
throw away the existing React/TypeScript stack and the Node.js scraping approach
from the `eql-buff-calc` sample. Options considered: (a) rewrite in C#/WPF,
(b) Tauri (Rust backend), (c) Electron wrapping the existing renderer.

## Decision
Wrap the existing Next.js/React/TypeScript renderer in an **Electron** shell.
The main process (Node) does windows, filesystem log watching, and wiki fetching;
the renderer stays React and talks to main only through a typed `window.eql`
preload bridge (`contextIsolation` on, `nodeIntegration` off).

## Consequences
- Reuses the whole current stack and mirrors the Node scraper the user pointed to.
- Gains frameless/transparent/always-on-top windows and full `fs` access.
- Adds runtime/build dependencies: `electron`, `electron-builder`, and dev helpers
  (`concurrently`, `wait-on`, `cross-env`). Bundle is heavier than native WPF.
- Introduces a two-tsconfig build (renderer via Next, main via `tsc`) and an IPC
  boundary that must stay in sync — mitigated by shared `types.ts`/`ipc-channels.ts`.
- Not the reference stack (C#/WPF), so their code isn't directly reusable.
