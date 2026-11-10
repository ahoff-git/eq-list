/**
 * report.mjs — what a check returns, and how a run of them is written down.
 *
 * Pure. A check is an async function that returns a `CheckResult`:
 *   { name, status: "pass" | "fail" | "skip", summary, evidence: string[], ms }
 * `status` is three-valued on purpose. A check that could not run (no data to assert against, not on
 * Windows) is **skipped and says so**; reporting it as a pass would be the quiet lie a smoke suite
 * exists to avoid, and reporting it as a failure would make the suite red for a reason no change caused.
 */

export const PASS = "pass";
export const FAIL = "fail";
export const SKIP = "skip";

export const pass = (name, summary, evidence = []) => ({ name, status: PASS, summary, evidence, ms: 0 });
export const fail = (name, summary, evidence = []) => ({ name, status: FAIL, summary, evidence, ms: 0 });
export const skip = (name, why, evidence = []) => ({ name, status: SKIP, summary: why, evidence, ms: 0 });

/**
 * Run one check, timing it, and always return a **list** of results: a check may report several rows
 * (the sweep has one per kind of finding), and the whole run's time is shown against the first. A check
 * that throws is a **failed** check carrying the error: an exception mid-probe (a socket that never
 * answered, a window that never appeared) is exactly what this suite is looking for, so it must not
 * escape as a crash that hides the other checks' results.
 */
export async function runCheck(name, check, now = Date.now) {
  const started = now();
  let results;
  try {
    const returned = await check();
    results = Array.isArray(returned) ? returned : [returned];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    results = [fail(name, `threw: ${reason}`, error instanceof Error && error.stack ? [error.stack] : [])];
  }
  return results.map((result, i) => ({ ...result, name: result.name ?? name, ms: i === 0 ? now() - started : 0 }));
}

const LABEL = { [PASS]: "PASS", [FAIL]: "FAIL", [SKIP]: "SKIP" };

/** A check that reports several rows puts its time on the first; the rest show nothing rather than a false 0.0s. */
const seconds = (ms) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : "");

/** The summary table: one row per result, aligned. */
export function formatTable(results) {
  const width = Math.max(4, ...results.map((r) => r.name.length));
  const rows = results.map((r) => `  ${LABEL[r.status]}  ${r.name.padEnd(width)}  ${seconds(r.ms).padStart(6)}  ${r.summary}`);
  const counts = [PASS, FAIL, SKIP].map((s) => `${results.filter((r) => r.status === s).length} ${s}`).join(", ");
  return [`  ${"    "}  ${"check".padEnd(width)}  ${"time".padStart(6)}  result`, ...rows, "", `  ${counts}`].join("\n");
}

/**
 * What to read under the table: the evidence of every failed check, and why each skip was skipped.
 * `verbose` adds the evidence of the passes too — what each check actually looked at.
 */
export function formatDetails(results, { verbose = false } = {}) {
  const blocks = [];
  for (const r of results) {
    const nothingToSay = r.evidence.length === 0;
    if ((r.status === PASS && !verbose) || nothingToSay) continue;
    blocks.push([`${LABEL[r.status]}  ${r.name}`, ...r.evidence.map((line) => `    ${line}`)].join("\n"));
  }
  return blocks.join("\n\n");
}

/** Nonzero only for a failure. A skip is visible in the table but is not, on its own, a red build. */
export function exitCode(results) {
  return results.some((r) => r.status === FAIL) ? 1 : 0;
}
