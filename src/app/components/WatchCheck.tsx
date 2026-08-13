"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clock } from "@/shared/format";
import { canDryRun, dryRun, type WatchIssue } from "@/shared/watch-check";
import type { CastAlertSettings, CastWatch, LogLine } from "@/shared/types";

/**
 * "Does this rule work?" — the two answers, in one drawer.
 *
 * The top half is what's *wrong* with the rule (`checkWatch`, carried in by the row so the ⚠ chip
 * and this list can't disagree). The bottom half is the one that settles arguments: the lines the
 * log has actually produced this session, and which of them this rule would have fired on.
 *
 * The replay runs **here**, in the renderer, over a buffer fetched once — so it re-answers on every
 * keystroke as the rule is edited, which is what makes it a tool for *writing* a rule rather than a
 * report on a finished one. The lines are fetched on open, and again on demand, because they're a
 * snapshot of a moving thing and pretending otherwise would be the wrong kind of tidy.
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
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    void api()
      ?.log.recent()
      .then((got) => setLines(got ?? []))
      .finally(() => setLoading(false));
  };
  // Once on open. The rule changes constantly while this is up; the log window doesn't need to.
  useEffect(load, []);

  const result = lines && canDryRun(watch) ? dryRun(watch, alerts, lines) : null;

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

      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <span className="astyle-label">Recent log</span>
        <button className="btn sm ghost" onClick={load} disabled={loading}>
          {loading ? "Reading…" : "↻ Re-check"}
        </button>
        <span className="muted small">
          {!lines
            ? "Reading the last few thousand lines…"
            : !lines.length
              ? "Nothing logged yet this session — play for a bit and check again."
              : result
                ? `${result.total} match${result.total === 1 ? "" : "es"} in ${result.scanned} lines${
                    result.cancels ? `, and ${result.cancels} line${result.cancels === 1 ? "" : "s"} that would cancel it` : ""
                  }`
                : "This rule can't match anything yet."}
        </span>
      </div>

      {result && result.hits.length > 0 && (
        <div className="wc-hits">
          {result.hits.map((hit, i) => (
            <div className="wc-hit" key={`${hit.at}-${i}`}>
              <span className="muted small wc-when">{clock(hit.at)}</span>
              <span className="chip">{hit.event}</span>
              <span className="wc-line">{hit.line}</span>
            </div>
          ))}
          {result.total > result.hits.length && (
            <span className="hint">…and {result.total - result.hits.length} more.</span>
          )}
        </div>
      )}
      {result && !result.total && lines?.length ? (
        <span className="hint">
          Nothing in the last {result.scanned} lines would have fired this. That&apos;s the right answer for
          something rare — but if you expected a hit, check the wording against the log: EQ rarely says what
          you&apos;d guess.
        </span>
      ) : null}
    </div>
  );
}
