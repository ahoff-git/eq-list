"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AutoUpdateStatus } from "@/shared/types";

/**
 * The auto-updater's own progress, when there's something worth showing. Main downloads a newer
 * build in the background (electron-updater, ADR 0279) — this only ever surfaces the two states a
 * person can act on or might wonder about: downloading (so a restart isn't a mystery slowdown) and
 * ready (so they can apply it now rather than waiting for the next natural quit, when
 * `autoInstallOnAppQuit` would install it anyway).
 */
export default function UpdateBanner() {
  const [status, setStatus] = useState<AutoUpdateStatus | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.update.status().then(setStatus);
    return a.update.onStatus(setStatus);
  }, []);

  if (!status) return null;
  if (status.state === "ready" && status.version === dismissedVersion) return null;

  if (status.state === "downloading") {
    return (
      <div className="update-banner no-drag">
        <span className="ub-dot" aria-hidden />
        <span className="ub-text">Downloading EQ List update… {status.percent}%</span>
      </div>
    );
  }

  if (status.state !== "ready") return null;

  return (
    <div className="update-banner no-drag">
      <span className="ub-dot" aria-hidden />
      <span className="ub-text">EQ List {status.version} is ready to install.</span>
      <span className="spacer" />
      <button className="btn sm primary" onClick={() => void api()?.update.restart()}>
        Restart now
      </button>
      <button
        className="btn ghost sm"
        title="It installs the next time you quit, either way"
        onClick={() => setDismissedVersion(status.version)}
      >
        ✕
      </button>
    </div>
  );
}
