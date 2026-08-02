"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UpdateNotice } from "@/shared/types";

/**
 * A dismissible "newer build available" strip. The main process finds the update (comparing the
 * rolling `latest` release's commit to what we've acknowledged) and owns the URL; this just draws
 * it. **Download** opens the release page, **✕** hides it — both tell main to stop flagging this
 * build, so the next newer one notifies but this one won't nag again.
 */
export default function UpdateBanner() {
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  useEffect(() => {
    const a = api();
    if (!a) return;
    // Catch an update found before this mounted, and any found after.
    void a.update.current().then((n) => n && setNotice(n));
    return a.update.onAvailable(setNotice);
  }, []);

  if (!notice) return null;

  return (
    <div className="update-banner no-drag">
      <span className="ub-dot" aria-hidden />
      <span className="ub-text">A newer build of EQ List is available.</span>
      <span className="spacer" />
      <button
        className="btn sm primary"
        onClick={() => {
          void api()?.update.open();
          setNotice(null);
        }}
      >
        Download
      </button>
      <button
        className="btn ghost sm"
        title="Dismiss — you'll still be told about the next build"
        onClick={() => {
          void api()?.update.dismiss();
          setNotice(null);
        }}
      >
        ✕
      </button>
    </div>
  );
}
