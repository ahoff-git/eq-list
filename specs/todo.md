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

_Distribution wiring (needs a host/repo decision):_

- **Landing page downloads.** `landing/index.html` has Launch + Download buttons.
  Point the Download link at the hosted installer (e.g. GitHub Releases `latest` —
  set OWNER/REPO), and decide where to host the page + the installer produced by
  `npm run dist` (in `release/`).
