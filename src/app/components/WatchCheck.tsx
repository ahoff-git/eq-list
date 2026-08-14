"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TAIL_STEPS } from "@/shared/constants";
import { clock } from "@/shared/format";
import { parseLogText } from "@/shared/log-parser";
import { canDryRun, dryRun, type WatchIssue } from "@/shared/watch-check";
import type { CastAlertSettings, CastWatch, LogLine } from "@/shared/types";

/**
 * "Does this rule work?" — the two answers, in one drawer.
 *
 * The top half is what's *wrong* with the rule (`checkWatch`, carried in by the row so the ⚠ chip
 * and this list can't disagree). The bottom half is the one that settles arguments: a stretch of the
 * **log file**, and which of its lines this rule would have fired on.
 *
 * The file, not a record of this session — see `log-tail.ts`. A rule is usually written *after* the
 * evening that made you want it, so a check that could only see lines since launch answered "nothing
 * logged yet" to the exact person it was built for.
 *
 * **How far back is the reader's choice.** The first look is an evening or so, which answers nearly
 * everything and costs nothing; a rule about a named, a raid call or a fade you see twice a week
 * needs more log, and *nothing found* is only worth believing once you've looked as far as the thing
 * you're waiting for. So "further back" climbs `TAIL_STEPS` until the whole file has been read, and
 * the panel always says which of those two it's telling you.
 *
 * The replay itself runs **here**, in the renderer, over text fetched once per depth — so it
 * re-answers on every keystroke as the rule is edited, which is what makes it a tool for *writing* a
 * rule rather than a report on a finished one.
 */
export default function WatchCheck({
  watch,
  alerts,
  issues,
}: {
  watch: CastWatch;
  alerts: CastAlertSettings;
  issues: WatchIssue[];
}) {
  const [lines, setLines] = useState<LogLine[] | null>(null);
  const [step, setStep] = useState(0);
  const [whole, setWhole] = useState(false);
  const [loading, setLoading] = useState(false);

  const read = useCallback((at: number) => {
    setLoading(true);
    void api()
      ?.log.recent(TAIL_STEPS[at])
      .then((tail) => {
        setLines(parseLogText(tail?.text ?? ""));
        setWhole(tail?.whole ?? true);
        setStep(at);
      })
      .finally(() => setLoading(false));
  }, []);

  // Once on open, at the shallow end. The rule changes constantly while this is up; the log doesn't.
  useEffect(() => read(0), [read]);

  const result = lines && canDryRun(watch) ? dryRun(watch, alerts, lines) : null;
  // Deeper only while there *is* deeper: the file ran out, or the ladder did.
  const deeper = !whole && step + 1 < TAIL_STEPS.length ? step + 1 : null;
  const scanned = result ? result.scanned.toLocaleString() : "";

  return (
    <div className="watch-check">
      {issues.length > 0 && (
        <div className="wc-issues">
          {issues.map((issue) => (
            <div key={issue.message} className={`wc-issue ${issue.level}`}>
              {issue.level === "error" ? "✖" : "⚠"} {issue.message}
            </div>
          ))}
        </div>
      )}
      {issues.length === 0 && <div className="wc-issue ok">✔ Nothing wrong with this rule.</div>}

      <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
        <span className="astyle-label">Recent log</span>
        <button className="btn sm ghost" onClick={() => read(step)} disabled={loading}>
          {loading ? "Reading…" : "↻ Re-check"}
        </button>
        {/* Only offered when it would do something: at the end of the file there is no further back,
            and a button that can't change the answer is one more thing to wonder about. */}
        {deeper !== null && (
          <button
            className="btn sm ghost"
            disabled={loading}
            title="Read further back through the log — for a rule about something that happens rarely."
            onClick={() => read(deeper)}
          >
            ⤢ Search further back
          </button>
        )}
        <span className="muted small">
          {!lines
            ? "Reading the end of your log…"
            : !lines.length
              ? "No log file to read — check the log folder on the Settings tab."
              : result
                ? `${result.total} match${result.total === 1 ? "" : "es"} in ${
                    whole ? `the whole log (${scanned} lines)` : `the last ${scanned} lines`
                  }${
                    result.cancels
                      ? `, and ${result.cancels} line${result.cancels === 1 ? "" : "s"} that would cancel it`
                      : ""
                  }`
                : "This rule can't match anything yet."}
        </span>
      </div>

      {result && result.hits.length > 0 && (
        <div className="wc-hits">
          {/* One row per *distinct* sentence: twenty copies of "hits YOU for 12 points" would
              otherwise bury the one differently-worded line that tells you something. */}
          {result.hits.map((hit, i) => (
            <div className="wc-hit" key={`${hit.at}-${i}`}>
              <span className="muted small wc-when">{clock(hit.at)}</span>
              <span className="chip">{hit.event}</span>
              <span className="wc-line">{hit.line}</span>
              {hit.times > 1 && <span className="chip when">×{hit.times}</span>}
            </div>
          ))}
          {result.total > result.hits.reduce((n, h) => n + h.times, 0) && (
            <span className="hint">…and more, in shapes past the first {result.hits.length}.</span>
          )}
        </div>
      )}
      {result && !result.total && lines?.length ? (
        <span className="hint">
          Nothing in {whole ? "the whole log" : `the last ${scanned} lines`} would have fired this.
          {deeper !== null
            ? " That's the right answer for something rare — search further back before believing it, and if you expected a hit, check the wording against the log: EQ rarely says what you'd guess."
            : " The whole log has been read, so if you expected a hit the wording is wrong: EQ rarely says what you'd guess."}
        </span>
      ) : null}
    </div>
  );
}
