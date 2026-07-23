# Todo

Open work only. Delete an item when it's done and record the outcome where it
belongs (ADR, README, or code).

_Implemented but unverified in the dev sandbox (no display / GPU / OCR) — needs a
real machine to confirm:_

- **Screengrab lookup, end-to-end.** Verify the `Ctrl/Cmd+Shift+L` flow: region
  select → capture → Tesseract OCR accuracy → fuzzy match. First OCR downloads the
  English model (needs network); tune the crop / text cleanup if accuracy is poor.
- **Packaged build.** Run `npm run dist` and confirm the installed app works:
  Tesseract assets load from `asar.unpacked`, the renderer loads over `app://` from
  the asar, and the `eqlist://` deep link launches/focuses the app.
- **Map window, real run.** Confirm the map window opens (🗺 button), draws the zone
  image, and plots the player dot on a `/loc` line. If a P99 map doesn't line up,
  re-tune it with the in-app calibration tool (enable Debug logging in the tray).
- **Peer networking (awari), real run.** With "Connect to the peer-to-peer network"
  on, confirm two clients join via the bootstrap-service; that clicking the map pings
  the other (a gold named marker in the *viewed* zone); that "Share my location" adds
  live green dots; that the connection now lives in the **main window** and survives
  **closing the map window** (reopening the map still shows peers); and that toggling
  "Connect" off leaves the room. Needs real network + WebRTC (unavailable in the dev
  sandbox). See [ADR 0012](./decisions/0012-awari-connection-owned-by-main-window.md).

_Distribution wiring (needs a host/repo decision):_

- **Landing page — publish + host.** `landing/index.html`'s buttons are wired:
  Download → `github.com/ahoff-git/eq-list/releases/latest`, Launch → `eqlist://open`.
  Remaining: actually **publish a release** so the Download resolves (`npm run dist --
  --publish always`, or upload `release/*.exe` to a GitHub release), and **host** the
  landing page somewhere (e.g. GitHub Pages).
