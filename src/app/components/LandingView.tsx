"use client";

/**
 * Shown when the renderer is opened in a plain browser (no Electron bridge) — e.g.
 * visiting http://localhost:3000 directly. The control UI is useless there, so we
 * explain what this is and offer to launch (eqlist:// deep link) or download the app.
 */

// Where the installer is hosted. If you publish via electron-builder to GitHub
// Releases, "releases/latest" resolves to the newest build — set OWNER/REPO.
const DOWNLOAD_URL = "https://github.com/OWNER/REPO/releases/latest";

export default function LandingView() {
  return (
    <div className="landing">
      <div className="landing-card">
        <h1>
          <span className="mark">EQ</span> List
        </h1>
        <p className="landing-tag">
          A floating loot shopping-list overlay for EverQuest Legends. This page is just the app’s
          web view — EQ List runs as a desktop app.
        </p>

        <div className="landing-cta">
          <a className="btn primary" href="eqlist://open">
            Launch the app
          </a>
          <a className="btn" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
            Download for Windows
          </a>
        </div>

        <ul className="landing-features">
          <li>Fuzzy search items, quests, and recipes — spelling can be rough.</li>
          <li>Always-on-top overlay flashes when a watched item drops.</li>
          <li>See who drops an item, by zone — your current zone highlighted.</li>
          <li>Screengrab lookup (Ctrl/Cmd+Shift+L) and a live XP/kill tracker.</li>
        </ul>

        <p className="landing-note">
          Running from source? <code>npm run dev</code> opens the desktop window automatically — this
          browser tab is only the renderer. “Launch the app” works once EQ List is installed.
        </p>
      </div>
    </div>
  );
}
