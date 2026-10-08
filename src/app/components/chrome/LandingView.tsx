"use client";

/**
 * Shown when the renderer is opened in a plain browser (no Electron bridge) — e.g.
 * visiting http://localhost:3000 directly, or the hosted static export. The control UI
 * is useless there, so we explain what this is and offer to launch (eqlist:// deep link)
 * or download the app.
 */

import { useState } from "react";
import { LATEST_RELEASE_URL } from "@/shared/constants";

export default function LandingView() {
  const [showLaunchHint, setShowLaunchHint] = useState(false);

  // "Launch the app" only resolves if EQ List is installed (it registers the eqlist://
  // scheme). If it opened, the app takes foreground and this tab loses focus — so only
  // nudge to install when we're STILL focused a moment after the click.
  const onLaunch = () => {
    setShowLaunchHint(false);
    window.setTimeout(() => {
      if (document.hasFocus()) setShowLaunchHint(true);
    }, 1200);
  };

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
          <a className="btn primary" href="eqlist://open" onClick={onLaunch}>
            Launch the app
          </a>
          <a className="btn" href={LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
            Download for Windows
          </a>
        </div>

        {showLaunchHint && (
          <p className="landing-note" style={{ color: "var(--accent, #f0b429)" }}>
            Nothing opened? You’ll need to install EQ List first — use “Download for Windows”.
          </p>
        )}

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
