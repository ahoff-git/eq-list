# 0013: CI publishes a rolling "latest" Windows build

## Status
Accepted

## Context
EQ List ships as a Windows desktop app (Electron → NSIS installer via `npm run dist`).
The landing page's **Download** button points at `github.com/ahoff-git/eq-list/releases/latest`,
but nothing was ever published there, so the button 404'd and every build was a manual
`npm run dist` + hand-upload. We want the **newest build always available as an .exe**
with no manual steps — and building a Windows installer needs a Windows environment,
which we don't have locally on demand.

## Decision
A GitHub Actions workflow (`.github/workflows/build-windows.yml`) builds and publishes
the installer automatically:

- **Triggers:** every push to `main`, plus manual `workflow_dispatch`. "Always up to
  date" means rebuilding whenever the code on `main` changes (not a nightly timer, which
  would rebuild unchanged code).
- **Runner:** `windows-latest` (NSIS installer is Windows-only).
- **Gate before publish:** `npm ci` → `typecheck` → `lint` → `test`. A broken commit
  must not become the "latest" download.
- **Build:** `npm run build` then `npx electron-builder --publish never` — electron-builder
  produces the artifact but does **not** publish it; we attach it ourselves.
- **Publish:** the `.exe` is uploaded to a **single rolling GitHub Release** on the
  `latest` tag (force-moved to the built commit each run, `make_latest: true`) via
  `softprops/action-gh-release`. `/releases/latest` therefore always resolves to the
  newest build, and `/releases/latest/download/<asset>` is a stable direct link.

Alternatives rejected:
- **Per-commit versioned releases** — clutters the releases page (package version is
  static, so tags would need run-number suffixes) for no benefit over a rolling entry.
- **electron-builder's native GitHub publish** — targets a `v{version}` *draft*; drafts
  don't surface at `/releases/latest`, so it wouldn't auto-publish without version bumps.

## Consequences
- The newest, test-passing build is always one click from the site; no manual release step.
- The `latest` git tag is **mutable** (moves to each built commit). Unusual for tags, but
  standard for a rolling "latest build"; consumers wanting an immutable point use a commit SHA.
- Costs Windows CI minutes on every push to `main`; `concurrency` cancels superseded runs.
- Builds are **unsigned**, so Windows SmartScreen warns "unknown publisher" regardless of
  host — fixing that needs a code-signing cert (`CSC_LINK`/`CSC_KEY_PASSWORD`), out of scope.
- Only takes effect once the workflow is on `main`; not exercisable in the dev sandbox
  (no Windows CI / network), so it's verified by its first run in Actions.
