"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  SETUP_CHECKS,
  problemCount,
  reportText,
  summarize,
  worstStatus,
  type CheckResult,
  type CheckStatus,
} from "@/shared/self-check";

/**
 * "Check my setup" — one button that walks everything the app needs and says which step broke.
 *
 * The problem it solves is that **every failure looks identical from here**: the list doesn't light
 * up, the meter reads zero, no alert ever pops. A missing folder, logging never switched on for
 * this character, a pinned file that was deleted and a folder we can't read all present as the same
 * silence, and the only tool anyone had was to change a setting and wait to see whether anything
 * happened.
 *
 * Deliberately **on demand rather than on mount**: it reads the disk and pings the wiki, and the
 * whole value of the answer is that it was gathered *just now*, after whatever the user changed a
 * moment ago. A panel that quietly cached a verdict from tab-open would be worse than none.
 *
 * Every row shows, pass or fail, for the reason the data panel shows every concern: a screen that
 * goes blank when all is well can't be told from a screen that's broken — and "following
 * eqlog_Kainos_pq.proj.txt" is often the sentence that solves it, by revealing the app is watching
 * a character you aren't playing.
 */
export default function SelfCheck() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(): Promise<void> {
    const a = api();
    if (!a) return;
    setRunning(true);
    setCopied(false);
    try {
      setResults(await a.app.selfCheck());
    } finally {
      setRunning(false);
    }
  }

  function copy(): void {
    if (!results) return;
    void navigator.clipboard?.writeText(reportText(results, new Date().toLocaleString()));
    setCopied(true);
  }

  // Computed before the return, so the JSX below stays a description of the screen.
  const verdict = results ? summarize(results) : null;
  const problems = results ? problemCount(results) : 0;

  return (
    <div className="setting">
      <label>Check my setup</label>
      <span className="hint">
        Walks everything the app needs — your log folder, the file it follows, whether the game is
        still writing to it, and the rest — in the order they depend on each other, and names the
        first thing that isn&apos;t right. Nothing is changed; it only looks.
      </span>

      <div className="row wrap" style={{ marginTop: 6 }}>
        <button className="btn" disabled={running} onClick={() => void run()}>
          {running ? "Checking…" : results ? "Check again" : `Check ${SETUP_CHECKS.length} things`}
        </button>
        {results && (
          <button className="btn ghost sm" onClick={copy}>
            {copied ? "Copied" : "Copy report"}
          </button>
        )}
      </div>

      {verdict && (
        <div className={`chk-verdict ${verdict.status}`}>
          <span className={`chk-state ${verdict.status}`}>{STATE_LABEL[verdict.status]}</span>
          <span>{verdict.headline}</span>
          {problems > 0 && <span className="chk-tally">{problems} of {results?.length} need a look</span>}
        </div>
      )}

      {results && (
        <div className="chk-rows">
          {results.map((r) => (
            <Row key={r.step.id} result={r} />
          ))}
        </div>
      )}
      {results && worstStatus(results) === "pass" && (
        <span className="hint chk-said">
          Everything the app needs is in place. If something still isn&apos;t happening, the debug
          log (tray icon → open the debug log) is the next place to look.
        </span>
      )}
    </div>
  );
}

/** One step: how it came out, what was found, and — when there is one — the thing to do. */
function Row({ result }: { result: CheckResult }) {
  const { step, status, detail, fix } = result;
  // A green row has already said everything worth saying in one line; `matters` explains the
  // *stakes*, which are only interesting once a step isn't right.
  const explain = status !== "pass";

  return (
    <div className={`chk-row ${status}`}>
      <div className="chk-head">
        <span className={`chk-state ${status}`} title={STATE_HINT[status]}>
          {STATE_LABEL[status]}
        </span>
        <span className="chk-label">{step.label}</span>
      </div>
      <span className="chk-detail">{detail}</span>
      {explain && <span className="chk-matters">{step.matters}</span>}
      {fix && <span className="chk-fix">{fix}</span>}
    </div>
  );
}

const STATE_LABEL: Record<CheckStatus, string> = {
  pass: "ok",
  warn: "worth a look",
  fail: "this is it",
  skip: "not checked",
};

const STATE_HINT: Record<CheckStatus, string> = {
  pass: "Checked, and right.",
  warn: "Not broken, but it explains something you may be missing.",
  fail: "This is what's stopping the app from working.",
  skip: "Skipped — a step it depends on has to be right first, and a second complaint about the same fault would only bury it.",
};
