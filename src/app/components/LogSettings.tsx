"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useWatcherStatus } from "@/lib/hooks";
import { count } from "@/shared/format";
import type { DeepPartial, LogImportResult, Settings } from "@/shared/types";

/**
 * Where your log is, which file to follow, and folding an old one in.
 *
 * The one settings group that *does* things rather than holding values — a native folder picker and a
 * whole-file import, each with its own in-progress state and its own result to report. Digesting is
 * safe to repeat (every kill, drop and fight is keyed by the log line behind it), which is worth saying
 * on screen, because "will this double my numbers?" is the question that stops people trying it.
 */
export default function LogSettings({
  settings,
  patch,
}: {
  settings: Settings;
  patch: (p: DeepPartial<Settings>) => void;
}) {
  const status = useWatcherStatus();
  const [digesting, setDigesting] = useState(false);
  const [digested, setDigested] = useState<LogImportResult | null>(null);

  async function browse() {
    const dir = await api()?.settings.pickLogDir();
    if (dir) patch({ logDir: dir });
  }

  async function digestLog() {
    setDigesting(true);
    try {
      const res = await api()?.log.import();
      if (res) setDigested(res);
    } finally {
      setDigesting(false);
    }
  }

  return (
    <>
      <div className="setting">
        <label>EverQuest log folder</label>
        <div className="row">
          <input className="field" value={settings.logDir} onChange={(e) => patch({ logDir: e.target.value })} />
          <button className="btn" onClick={browse}>
            Browse…
          </button>
        </div>
        <span className="hint">
          {status.watching ? `Watching ${fileName(status.file)}` : status.error ?? "Not watching"}
        </span>
      </div>
      <div className="setting">
        <label>Specific log file (optional)</label>
        <input
          className="field"
          placeholder="Auto — follow the most recently written eqlog_*.txt"
          value={settings.activeLogFile}
          onChange={(e) => patch({ activeLogFile: e.target.value })}
        />
        <span className="hint">Leave blank to auto-detect the active character.</span>
      </div>
      <div className="setting">
        <label>Digest a past log</label>
        <div className="row">
          <button className="btn" onClick={digestLog} disabled={digesting}>
            {digesting ? "Digesting…" : "Eat a log file…"}
          </button>
        </div>
        <span className="hint">
          Pick an old EverQuest log and fold its kills, drops and locations into your learned mob
          data (observed drop rates + roam areas), and its <b>fights into the Damage tab’s history</b>,
          one play session per login — without watching it live. Your live combat/session stats
          aren’t touched. Eating the same log twice is safe, and <b>worth doing</b> after an update
          that changes how a log is read: kills and drops are keyed by the line behind them so
          nothing lands twice, while recorded <b>fights are re-derived</b> — their figures redone
          from the log rather than left at whatever the old rules made of them, and drops that
          predate the ledger recording a <b>zone</b> get one. Results appear right
          away: the Hunt tab pools every zone, while the map shows the zone you’re viewing (only
          kills the log placed with a nearby <kbd>/loc</kbd> get a marker).
          {digested && (
            <>
              {" "}
              <b>
                Digested {digested.kills} kills / {digested.drops} drops / {digested.fights} fights /{" "}
                {digested.loot} looted
              </b>{" "}
              from {fileName(digested.file)}
              {digested.sessions > 0 && ` across ${count(digested.sessions, "play session")}`}.
              {digested.refreshed > 0 && ` Re-derived ${count(digested.refreshed, "fight")} already on record.`}
              {/* The one figure a re-read of an already-watched log will usually be the *only* thing to
                  report: nothing was added, and drops recorded before the ledger held a zone can now
                  say which camp they came from (ADR 0137). */}
              {digested.placed > 0 &&
                ` Filled in the zone for ${count(digested.placed, "drop")} already in the ledger.`}
              {digested.superseded > 0 &&
                ` ${count(digested.superseded, "stored fight")} folded into others as the boundaries moved.`}
              {digested.unsourced > 0 &&
                ` ${count(digested.unsourced, "older fight")} can no longer be found in this file — kept, and marked.`}
              {digested.trimmed > 0 &&
                ` ${count(digested.trimmed, "fight")} in the log are older than the history keeps.`}
            </>
          )}
        </span>
      </div>
    </>
  );
}

/** Just the file name, so a hint doesn't carry a whole Windows path. */
function fileName(p?: string): string {
  return p ? p.split(/[\\/]/).pop() ?? p : "";
}
