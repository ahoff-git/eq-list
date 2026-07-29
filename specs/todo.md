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

_Distribution wiring:_

- **CI build — verify first run.** `.github/workflows/build-windows.yml` auto-builds the
  installer and publishes it to the rolling `latest` release on every push to `main`
  ([ADR 0013](./decisions/0013-ci-rolling-latest-windows-build.md)). The first run failed
  at the `npm test` gate (runner was on Node 20, which doesn't expand the test glob — now
  pinned to Node 22); the gate steps all pass locally on Node 22. Still to confirm on a
  real run: `electron-builder` succeeds on the runner, the `latest` tag moves, and
  `/releases/latest` resolves to the `.exe`. Not exercisable in the dev sandbox.
- **Landing page — host it.** `landing/index.html`'s buttons are wired (Download →
  `/releases/latest`, Launch → `eqlist://open`) and the Download target is now populated
  by CI. Remaining: **host** the static page somewhere (e.g. GitHub Pages). Optional:
  point Download straight at `/releases/latest/download/<asset>` for a one-click download.
- **Code signing (optional).** Builds are unsigned → Windows SmartScreen warns "unknown
  publisher". Needs a cert (`CSC_LINK`/`CSC_KEY_PASSWORD` secrets) wired into the workflow.
