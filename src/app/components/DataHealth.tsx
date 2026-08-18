"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRead } from "@/lib/hooks";
import { when } from "@/shared/format";
import {
  REMEDY_ADVICE,
  actionsNeeded,
  needsAction,
  type DataReportRow,
  type DataState,
} from "@/shared/data-provenance";

/** A stable empty, so a render that hasn't heard back yet doesn't look like an answer. */
const NO_ROWS: DataReportRow[] = [];

/**
 * "Is what I've recorded still true?" — the panel behind `data-provenance.ts`.
 *
 * The app derives nearly everything from your log, and the rules for reading it keep improving; a
 * fix that raises a figure leaves every stored copy of that figure quietly low. Quiet is the problem
 * — a wrong number that looks like a measurement is worse than a blank — so this exists to make the
 * gap **loud, specific, and actionable**: which body of data, what changed about it, and who can put
 * it right.
 *
 * It shows every concern rather than only the stale ones, for the same reason the alerts tab says
 * "off" out loud: a panel that renders nothing when all is well is indistinguishable from a panel
 * that is broken, and "everything here is current" is the answer you came for half the time.
 */
export default function DataHealth() {
  // Re-read after an action, since digesting a log rewrites the very stamps this is showing.
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const rows = useRead((a) => a.app.dataHealth(), NO_ROWS, [refresh]);
  const wanted = actionsNeeded(rows);

  /** Do the thing this row's remedy asks for, where the app is able to do it at all. */
  async function act(row: DataReportRow): Promise<void> {
    const a = api();
    if (!a) return;
    setBusy(true);
    setSaid("");
    try {
      if (row.concern.remedy === "re-eat") {
        const result = await a.log.import();
        // Cancelling the picker is not a failure and must not read like one.
        setSaid(
          result
            ? `Digested ${result.file.split(/[\\/]/).pop()} — ${result.fights} fights, ${result.kills} kills, ${result.drops} drops.`
            : "Nothing digested.",
        );
      } else if (row.concern.remedy === "refetch") {
        await a.wiki.refresh();
        setSaid("Wiki mirror refreshed.");
      }
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  }

  return (
    <div className="setting">
      <label>
        Recorded data{" "}
        {wanted > 0 && (
          <span className="dh-badge" title="Bodies of data an app change has left behind">
            {wanted} to update
          </span>
        )}
      </label>
      <span className="hint">
        What the app has learned from your log, and whether it was read by the rules the app uses now.
        A parser fix can raise a figure without touching what is already stored, so this is where a
        stored number admits it predates one.
      </span>

      <div className="dh-rows">
        {rows.map((row) => (
          <Row key={row.concern.id} row={row} busy={busy} onAct={() => void act(row)} />
        ))}
      </div>
      {said && <span className="hint dh-said">{said}</span>}
    </div>
  );
}

/** One body of data: where it stands, why, and the one thing worth doing about it. */
function Row({ row, busy, onAct }: { row: DataReportRow; busy: boolean; onAct: () => void }) {
  const { concern, state, stamp } = row;
  const act = needsAction(row);
  // Only two remedies are the app's to carry out; the rest are a command or a decision, so they get
  // words instead of a button that would have to explain why it did nothing.
  const canDo = concern.remedy === "re-eat" || concern.remedy === "refetch";

  return (
    <div className={`dh-row ${state}`}>
      <div className="dh-head">
        <span className={`dh-state ${state}`} title={STATE_HINT[state]}>
          {STATE_LABEL[state]}
        </span>
        <span className="dh-label">{concern.label}</span>
        {concern.file && <code className="dh-file">{concern.file}</code>}
        <span className="spacer" />
        {/* The build that wrote it — never compared, and the one thing worth quoting in a bug
            report. Hidden when there's nothing to say rather than shown as a dash. */}
        {stamp?.at && (
          <span className="dh-stamp" title={`Revision ${stamp.revision}${stamp.appVersion ? ` · written by ${stamp.appVersion}` : ""}`}>
            {when(stamp.at)}
          </span>
        )}
      </div>
      <span className="dh-blurb">{concern.blurb}</span>
      {state === "stale" && concern.changed && <span className="dh-changed">What changed: {concern.changed}</span>}
      {state === "ahead" && (
        <span className="dh-changed">
          Written by a newer build than this one. Nothing will be offered here — rebuilding it with
          older rules would replace the better answer with a worse one.
        </span>
      )}
      {act && (
        <div className="row wrap dh-act">
          <span className="dh-advice">{REMEDY_ADVICE[concern.remedy]}</span>
          {concern.command && <code className="dh-cmd">{concern.command}</code>}
          {canDo && (
            <button className="btn sm" disabled={busy} onClick={onAct}>
              {concern.remedy === "re-eat" ? "Digest a log…" : "Refresh now"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const STATE_LABEL: Record<DataState, string> = {
  current: "up to date",
  stale: "needs updating",
  ahead: "from a newer build",
  absent: "nothing recorded",
};

const STATE_HINT: Record<DataState, string> = {
  current: "Read by the rules this build uses.",
  stale: "Read by an older rule than this build uses, so its figures may be wrong.",
  ahead: "Written by a newer build. Left alone deliberately — see below.",
  absent: "No file yet: nothing has been recorded. Not a problem.",
};
