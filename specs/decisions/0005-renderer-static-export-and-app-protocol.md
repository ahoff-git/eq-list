# 0005: Static-export renderer served over an app:// protocol

## Status
Accepted

## Context
Next.js normally runs a Node server (SSR). Inside Electron that's unnecessary and
awkward: the UI is a single-user SPA whose data all arrives over IPC. We need the
renderer to load both in dev (hot reload) and in a packaged app, with asset paths
that resolve correctly. Loading exported files over `file://` breaks Next's
absolute `/_next/...` asset URLs and gives the page no real origin.

## Decision
Configure Next with `output: "export"` (+ `trailingSlash`, `images.unoptimized`) so
each route becomes static HTML under `out/`. In dev, Electron loads the `next dev`
server (`http://localhost:3000`); in production it registers a custom, privileged
`app://` scheme (`electron/protocol.ts`) that serves `out/` — giving the page a
real origin so `/_next/...` resolves. Window role (`main` vs `overlay`) is passed
to the preload via an `--eql-role` argument.

## Consequences
- No server to run or secure in production; the renderer is plain static assets.
- Dev keeps fast refresh via the Next dev server.
- Requires the two-mode load path in `windows.ts` and a path-traversal guard in the
  protocol handler.
- Renderer code must never assume SSR or a Node runtime, and must guard `window.eql`
  (absent during static prerender).
